/// <reference path="../pb_data/types.d.ts" />
// Migrations are snapshots and cannot import src/rhythm, so the rules proven by a stored best score
// are copied here: S accuracy from RANK_THRESHOLDS, FULL COMBO and ALL PERFECT from score.ts.
const S_MIN_ACCURACY = 0.95;

function getProvenMarks(score) {
  if (!score.getBool('cleared')) {
    return [];
  }
  const counts = JSON.parse(toString(score.get('counts')));
  const isFullCombo = counts.good === 0 && counts.bad === 0 && counts.miss === 0;
  const marks = ['clear'];
  if (score.getFloat('accuracy') >= S_MIN_ACCURACY) {
    marks.push('s');
  }
  if (isFullCombo) {
    marks.push('fc');
  }
  if (isFullCombo && counts.great === 0) {
    marks.push('ap');
  }
  return marks;
}

// Builds an equality filter with bound params, like where() in src/pbQuery.ts, which a migration
// cannot import.
function equalsFilter(fields) {
  return {
    expression: Object.keys(fields)
      .map((field) => `${field} = {:${field}}`)
      .join(' && '),
    params: fields,
  };
}

function getEvidenceKey(key) {
  return [key.user, key.kind, key.chart, key.chartRevision, key.constellation].join('\u0000');
}

migrate(
  (app) => {
    const chartsCollection = app.findCollectionByNameOrId('charts');
    const charts = arrayOf(new Record(chartsCollection));
    // The chart data column is large, so only the columns a mark needs are read.
    app
      .recordQuery(chartsCollection)
      .select('charts.id', 'charts.song', 'charts.difficulty')
      .all(charts);
    const chartsById = {};
    charts.forEach((chart) => {
      chartsById[chart.id] = chart;
    });

    const marksCollection = app.findCollectionByNameOrId('achievement_marks');
    // Existing evidence keys are read once so duplicates are decided in memory, not per mark.
    const existingMarks = arrayOf(new Record(marksCollection));
    app
      .recordQuery(marksCollection)
      .select(
        'achievement_marks.id',
        'achievement_marks.user',
        'achievement_marks.kind',
        'achievement_marks.chart',
        'achievement_marks.chartRevision',
        'achievement_marks.constellation',
      )
      .all(existingMarks);
    const savedKeys = new Set(
      existingMarks.map((mark) =>
        getEvidenceKey({
          user: mark.getString('user'),
          kind: mark.getString('kind'),
          chart: mark.getString('chart'),
          chartRevision: mark.getString('chartRevision'),
          constellation: mark.getString('constellation'),
        }),
      ),
    );
    app.findAllRecords('scores').forEach((score) => {
      const chart = chartsById[score.getString('chart')];
      getProvenMarks(score).forEach((kind) => {
        const key = {
          user: score.getString('user'),
          kind,
          chart: chart.id,
          chartRevision: score.getString('chartRevision'),
          // The constellation at the time of the play is unknown, so a backfilled mark has none.
          constellation: '',
        };
        const evidenceKey = getEvidenceKey(key);
        if (savedKeys.has(evidenceKey)) {
          return;
        }
        const mark = new Record(marksCollection);
        Object.keys(key).forEach((field) => mark.set(field, key[field]));
        mark.set('song', chart.getString('song'));
        mark.set('difficulty', chart.getString('difficulty'));
        mark.set('source', 'backfill');
        app.save(mark);
        savedKeys.add(evidenceKey);
      });
    });
  },
  (app) => {
    const backfillFilter = equalsFilter({ source: 'backfill' });
    app
      .findRecordsByFilter(
        'achievement_marks',
        backfillFilter.expression,
        '',
        0,
        0,
        backfillFilter.params,
      )
      .forEach((mark) => {
        app.delete(mark);
      });
  },
);
