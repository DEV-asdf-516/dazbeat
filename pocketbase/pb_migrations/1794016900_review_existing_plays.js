/// <reference path="../pb_data/types.d.ts" />
// 검토 상태 도입 전 기록을 승인 근거로 다시 맞춘다. 의심 플레이는 검토 대기로 두고, 순위와 채보
// 도장에는 승인 근거만 남긴다. 업적과 곡 도장은 지급 기록이라 바꾸지 않는다.
// 운영의 scores 는 모두 같은 사용자, 채보, 점수의 플레이가 있어(배포 전 확인) 플레이만으로 다시 만든다.
// 마이그레이션은 스냅샷이라 src/rhythm 을 import 할 수 없어 도장 규칙을 복사한다. S 정확도는
// RANK_THRESHOLDS, FULL COMBO 와 ALL PERFECT 는 score.ts 에서 가져왔다.
const S_MIN_ACCURACY = 0.95;

function getProvenMarks(result) {
  if (!result.cleared) {
    return [];
  }
  const { counts } = result;
  const isFullCombo = counts.good === 0 && counts.bad === 0 && counts.miss === 0;
  const marks = ['clear'];
  if (result.accuracy >= S_MIN_ACCURACY) {
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

// SQLite 바인딩 변수 한도를 넘지 않게 나눠 지운다.
const DELETE_BATCH_SIZE = 500;

// 서버 전용 컬렉션이라 레코드 API 대신 미리 고른 행을 지운다.
function deleteRows(app, table, records) {
  for (let start = 0; start < records.length; start += DELETE_BATCH_SIZE) {
    const ids = records.slice(start, start + DELETE_BATCH_SIZE).map((record) => record.id);
    app
      .db()
      .delete(table, $dbx.in('id', ...ids))
      .execute();
  }
}

function keyOf(...parts) {
  return parts.join('\u0000');
}

// play_results 행에서 순위와 도장 판정에 쓰는 값만 꺼낸다.
function readResult(record) {
  return {
    record,
    user: record.getString('user'),
    chart: record.getString('chart'),
    chartRevision: record.getString('chartRevision'),
    score: record.getFloat('score'),
    accuracy: record.getFloat('accuracy'),
    cleared: record.getBool('cleared'),
    counts: JSON.parse(toString(record.get('counts'))),
  };
}

// 점수, 정확도가 높고 먼저 달성한 플레이가 앞선다.
function isBetterPlay(play, other) {
  if (play.score !== other.score) {
    return play.score > other.score;
  }
  if (play.accuracy !== other.accuracy) {
    return play.accuracy > other.accuracy;
  }
  const created = play.record.getString('created');
  const otherCreated = other.record.getString('created');
  if (created !== otherCreated) {
    return created < otherCreated;
  }
  return play.record.id < other.record.id;
}

function readChartIds(app) {
  const chartsCollection = app.findCollectionByNameOrId('charts');
  const charts = arrayOf(new Record(chartsCollection));
  // 채보 data 열은 크므로 필요한 열만 읽는다.
  app.recordQuery(chartsCollection).select('charts.id').all(charts);
  return new Set(charts.map((chart) => chart.id));
}

function saveScore(app, record, result, achievedAt) {
  record.set('user', result.user);
  record.set('chart', result.chart);
  record.set('chartRevision', result.chartRevision);
  record.set('score', result.score);
  record.set('accuracy', result.accuracy);
  record.set('maxCombo', result.record.getInt('maxCombo'));
  record.set('cleared', result.cleared);
  record.set('counts', result.counts);
  record.set('achievedAt', achievedAt);
  app.save(record);
}

migrate(
  (app) => {
    const chartIds = readChartIds(app);
    const plays = app.findAllRecords('play_results').map((record) => ({
      ...readResult(record),
      constellation: record.getString('constellation'),
      status: record.getString('autoplayCheck') === 'suspicious' ? 'pending' : 'approved',
    }));

    const bestByKey = {};
    plays
      .filter((play) => play.status === 'approved')
      .forEach((play) => {
        const key = keyOf(play.user, play.chart, play.chartRevision);
        const best = bestByKey[key];
        if (best === undefined || isBetterPlay(play, best)) {
          bestByKey[key] = play;
        }
      });

    const evidenceByKey = {};
    plays.forEach((play) => {
      const key = keyOf(play.user, play.chart, play.chartRevision);
      evidenceByKey[key] = [...(evidenceByKey[key] ?? []), play];
    });
    const marksToRemove = app.findAllRecords('earned_chart_marks').filter((mark) => {
      const kind = mark.getString('kind');
      const isPlayMark = mark.getString('source') === 'play';
      const evidence = (
        evidenceByKey[
          keyOf(mark.getString('user'), mark.getString('chart'), mark.getString('chartRevision'))
        ] ?? []
      ).filter((play) => !isPlayMark || play.constellation === mark.getString('constellation'));
      const hasProof = (status) =>
        evidence.some((item) => item.status === status && getProvenMarks(item).includes(kind));
      // 승인 근거도 대기 근거도 없는 과거 지급 기록은 복원할 근거가 없어 남긴다.
      return !hasProof('approved') && hasProof('pending');
    });

    plays.forEach(({ record, status }) => {
      record.set('achievedAt', record.get('created'));
      record.set('reviewStatus', status);
      app.save(record);
    });
    deleteRows(app, 'scores', app.findAllRecords('scores'));
    const scoresCollection = app.findCollectionByNameOrId('scores');
    Object.values(bestByKey).forEach((play) => {
      // 지워진 채보는 scores 의 relation 대상이 없다.
      if (!chartIds.has(play.chart)) {
        return;
      }
      saveScore(app, new Record(scoresCollection), play, play.record.get('created'));
    });
    deleteRows(app, 'earned_chart_marks', marksToRemove);
  },
  (app) => {
    // 정확한 원상태는 백업 복구로 되돌린다. 여기서는 이관 전 코드가 읽을 수 있는 상태만 만든다.
    const chartIds = readChartIds(app);
    const pendingPlays = app
      .findAllRecords('play_results')
      .filter((record) => record.getString('reviewStatus') === 'pending')
      .map((record) => ({
        ...readResult(record),
        constellation: record.getString('constellation'),
      }));

    // 이관 전에는 의심 플레이도 최고 점수에 들어갔다. 키마다 더 높은 점수만 남긴다.
    const scoresByKey = {};
    app.findAllRecords('scores').forEach((record) => {
      scoresByKey[
        keyOf(
          record.getString('user'),
          record.getString('chart'),
          record.getString('chartRevision'),
        )
      ] = record;
    });
    const bestByKey = {};
    pendingPlays
      .filter((play) => chartIds.has(play.chart))
      .forEach((play) => {
        const key = keyOf(play.user, play.chart, play.chartRevision);
        const best = bestByKey[key];
        if (best === undefined || play.score > best.score) {
          bestByKey[key] = play;
        }
      });

    const markKeys = new Set(
      app
        .findAllRecords('earned_chart_marks')
        .map((mark) =>
          keyOf(
            mark.getString('user'),
            mark.getString('kind'),
            mark.getString('chart'),
            mark.getString('chartRevision'),
            mark.getString('constellation'),
          ),
        ),
    );
    const marksToRestore = [];
    pendingPlays.forEach((play) => {
      getProvenMarks(play).forEach((kind) => {
        const key = keyOf(play.user, kind, play.chart, play.chartRevision, play.constellation);
        if (markKeys.has(key)) {
          return;
        }
        markKeys.add(key);
        marksToRestore.push({
          user: play.user,
          kind,
          song: play.record.getString('song'),
          difficulty: play.record.getString('difficulty'),
          chart: play.chart,
          chartRevision: play.chartRevision,
          constellation: play.constellation,
          source: 'play',
        });
      });
    });

    const scoresCollection = app.findCollectionByNameOrId('scores');
    Object.keys(bestByKey).forEach((key) => {
      const result = bestByKey[key];
      const score = scoresByKey[key];
      if (score !== undefined && score.getFloat('score') >= result.score) {
        return;
      }
      saveScore(
        app,
        score ?? new Record(scoresCollection),
        result,
        result.record.get('achievedAt'),
      );
    });
    const marksCollection = app.findCollectionByNameOrId('earned_chart_marks');
    marksToRestore.forEach((fields) => {
      const mark = new Record(marksCollection);
      Object.keys(fields).forEach((field) => mark.set(field, fields[field]));
      app.save(mark);
    });
  },
);
