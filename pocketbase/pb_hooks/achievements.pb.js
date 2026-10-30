/// <reference path="../pb_data/types.d.ts" />
// 대시보드(superuser)의 저장도 규칙 값이 종류에 맞는지 검사해, 칸 옆에 틀린 필드를 보이게 한다.
// 마이그레이션과 앨범 삭제로 relation 이 비는 내부 저장은 요청이 아니라 막지 않는다.
function validateAchievementRequest(e) {
  const { parseAchievementDefinition, InvalidAchievementDefinitionError } = require(
    `${__hooks}/lib/achievement/dto.cjs`,
  );
  try {
    parseAchievementDefinition({
      key: e.record.getString('key'),
      achievementSet: e.record.getString('achievementSet'),
      category: e.record.getString('category'),
      kind: e.record.getString('kind'),
      target: e.record.getInt('target'),
      mark: e.record.getString('mark'),
      difficulty: e.record.getString('difficulty'),
      zodiac: e.record.getString('zodiac'),
      album: e.record.getString('album'),
      retired: e.record.getBool('retired'),
    });
  } catch (error) {
    if (error instanceof InvalidAchievementDefinitionError) {
      throw new BadRequestError(error.message, {
        [error.field]: new ValidationError(error.code, error.message),
      });
    }
    throw error;
  }
  e.next();
}

onRecordCreateRequest(validateAchievementRequest, 'achievements');
onRecordUpdateRequest(validateAchievementRequest, 'achievements');
