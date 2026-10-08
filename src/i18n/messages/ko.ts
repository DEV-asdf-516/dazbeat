export const ko = {
  boot: {
    loadFailed: '게임 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',
  },
  main: {
    hint: '↑↓ 이동   Enter 선택',
    account: {
      signInFailed: 'Google 로그인에 실패했습니다',
    },
  },
  songSelect: {
    hint: '↑↓ 곡   ←→ 난이도   Q/E 카테고리   Enter 플레이   Tab 설정   Esc 메인',
    noSongs: '곡 없음',
    noRecord: '기록 없음',
  },
  settings: {
    title: '설정',
    hint: '↑↓ 이동   ←→ 조절   Enter 키 변경   Esc 뒤로',
    waitingKey: '레인 {{lane}} 키를 누르세요 (Esc 취소)',
    groups: {
      audio: '오디오',
      input: '입력',
      general: '일반',
    },
    rows: {
      masterVolume: '마스터 볼륨',
      musicVolume: '음악 볼륨',
      effectVolume: '효과음 볼륨',
      inputOffset: '입력 오프셋',
      laneKey: '레인 {{lane}} 키',
      noteSpeed: '노트 속도',
      mvMode: 'MV 모드',
      language: '언어',
    },
  },
  credits: {
    title: '크레딧',
    hint: 'Esc 뒤로',
  },
  result: {
    hint: '←→ 난이도   ↑↓ 이동   Enter 선택   Esc 곡 선택',
  },
  gameplay: {
    loading: '불러오는 중',
    pressEnterToStart: 'Enter 로 시작',
    buffering: '버퍼링 중',
    paused: '일시정지됨 · Enter 로 재개',
    preparing: '재생 준비 중',
    chartLoadFailed: '채보 로드 실패',
    playerLoadFailed: '영상 플레이어 로드 실패',
    videoError: '영상 재생 오류: {{message}}',
    backToSongSelect: '곡 선택으로',
    quitTitle: '플레이를 그만둘까요?',
    quitConfirm: '이번 플레이 기록은 저장되지 않습니다',
  },
  chartEditorSelect: {
    title: '채보 편집',
    hint: '↑↓ 곡 선택   Q/E 카테고리   Enter 편집   Esc 나가기',
    emptyFilter: '이 카테고리에 곡이 없습니다',
  },
  chartEditor: {
    hint: 'Space 재생/일시정지   Delete 노트 삭제   휠 이동   Esc 나가기',
    noSongs: '곡이 없습니다',
    loading: '채보를 불러오는 중',
    chartLoadFailed: '채보를 불러오지 못했습니다',
    discardTitle: '변경사항을 버릴까요?',
    discardConfirm: '저장하지 않은 변경사항이 사라집니다',
    clearTitle: '노트를 모두 삭제할까요?',
    clearConfirm: '노트 {{noteCount}}개가 지워집니다.\n저장하기 전까지는 서버에 반영되지 않습니다.',
    noSelection: '선택된 노트 없음',
    saving: '저장 중',
    saved: '저장됨',
    saveFailed: '저장 실패',
    invalidChart: '채보 검증 실패: {{reason}}',
    noteCount: '노트 {{count}}개',
    toolSection: '입력 도구',
    selectionSection: '선택한 노트',
  },
  youtubeError: {
    invalidParameter: '잘못된 영상 ID',
    html5PlayerError: '브라우저 플레이어 오류',
    videoNotFound: '영상을 찾을 수 없음 (삭제·비공개)',
    embeddingNotAllowed: '퍼가기가 허용되지 않은 영상',
    embeddingNotAllowedHint:
      '광고 차단 확장 프로그램·로그인 상태를 확인하거나 시크릿 창에서 플레이해 보세요',
    unknown: '알 수 없는 오류',
    withCode: '{{message}} (오류 {{code}})',
  },
};

export type Messages = typeof ko;
