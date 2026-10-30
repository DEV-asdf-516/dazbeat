/// <reference path="../pb_data/types.d.ts" />
// 마이그레이션은 스냅샷이라 src/rhythm 을 import 할 수 없어, 저장된 최고 점수가 증명하는 규칙을
// 여기 복사한다. S 정확도는 RANK_THRESHOLDS, FULL COMBO 와 ALL PERFECT 는 score.ts 에서 가져왔다.
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

// 바인딩 파라미터로 같음 필터를 만든다. 마이그레이션이 import 할 수 없는 src/pbQuery.ts 의 where() 와 같다.
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
    // 채보 data 열은 크므로 mark 에 필요한 열만 읽는다.
    app
      .recordQuery(chartsCollection)
      .select('charts.id', 'charts.song', 'charts.difficulty')
      .all(charts);
    const chartsById = {};
    charts.forEach((chart) => {
      chartsById[chart.id] = chart;
    });

    const marksCollection = app.findCollectionByNameOrId('achievement_marks');
    // 기존 증거 키를 한 번만 읽어 중복을 mark 마다 조회하지 않고 메모리에서 판정한다.
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
          // 플레이 당시 별자리는 알 수 없어 소급한 mark 에는 별자리가 없다.
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
