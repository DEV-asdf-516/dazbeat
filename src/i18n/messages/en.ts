import type { Messages } from './ko.js';

export const en: Messages = {
  boot: {
    loadFailed: 'Failed to load game data. Please refresh in a moment.',
  },
  main: {
    hint: '↑↓ Move   Enter Select',
    account: {
      signInFailed: 'Google sign-in failed',
    },
  },
  songSelect: {
    hint: '↑↓ Song   ←→ Difficulty   Q/E Category   Enter Play   Tab Settings   Esc Main',
    noSongs: 'No songs',
    noRecord: 'No record',
  },
  settings: {
    title: 'Settings',
    hint: '↑↓ Move   ←→ Adjust   Enter Change key   Esc Back',
    waitingKey: 'Press a key for Lane {{lane}} (Esc to cancel)',
    groups: {
      audio: 'Audio',
      input: 'Input',
      general: 'General',
    },
    rows: {
      masterVolume: 'Master Volume',
      musicVolume: 'Music Volume',
      effectVolume: 'Effect Volume',
      inputOffset: 'Input Offset',
      laneKey: 'Lane {{lane}} Key',
      noteSpeed: 'Note Speed',
      mvMode: 'MV Mode',
      language: 'Language',
    },
  },
  credits: {
    title: 'Credits',
    hint: '↑↓ Scroll   Esc Back',
  },
  result: {
    hint: '←→ Difficulty   ↑↓ Move   Enter Select   Esc Tracks',
  },
  gameplay: {
    loading: 'Loading',
    pressEnterToStart: 'Press Enter to start',
    resuming: 'Syncing back to the music',
    chartLoadFailed: 'Failed to load chart',
    playerLoadFailed: 'Failed to load video player',
    videoError: 'Video playback error: {{message}}',
    playbackStartFailed: "Couldn't start video playback.",
    backToSongSelect: 'Back to Tracks',
    quitTitle: 'Quit this play?',
    quitConfirm: 'This play will not be recorded',
    resyncFailedTitle: "Couldn't sync back to the music",
    resyncFailedBody: 'Press CONTINUE to try again. If you QUIT, this play will not be recorded',
  },
  chartEditorSelect: {
    title: 'Chart Editor',
    hint: '↑↓ Select song   Q/E Category   / Search   Enter Edit   Esc Exit',
    emptyFilter: 'No songs in this category',
    loading: 'Loading songs',
    loadFailed: "Couldn't load songs · R Retry",
    loadingMore: 'Loading more songs',
    loadMoreFailed: "Couldn't load more songs · R Retry",
    noMatch: 'No songs match “{{title}}”',
    searchPlaceholder: 'Search...',
  },
  chartEditor: {
    hint: 'Space Play/Pause   Delete Delete note   Wheel Move   Esc Exit',
    noSongs: 'No songs',
    loading: 'Loading chart',
    chartLoadFailed: 'Failed to load chart',
    discardTitle: 'Discard changes?',
    discardConfirm: 'Unsaved changes will be lost',
    clearTitle: 'Delete all notes?',
    clearConfirm:
      '{{noteCount}} notes will be removed.\nNothing changes on the server until you save.',
    noSelection: 'No note selected',
    saving: 'Saving',
    saved: 'Saved',
    saveFailed: 'Save failed',
    invalidChart: 'Chart validation failed: {{reason}}',
    noteCount: '{{count}} notes',
    toolSection: 'Input tool',
    selectionSection: 'Selected note',
  },
  youtubeError: {
    invalidParameter: 'Invalid video ID',
    html5PlayerError: 'Browser player error',
    videoNotFound: 'Video not found (deleted or private)',
    embeddingNotAllowed: 'Embedding is not allowed for this video',
    embeddingNotAllowedHint:
      'Check your ad blocker and login status, or try playing in a private window',
    unknown: 'Unknown error',
    withCode: '{{message}} (error {{code}})',
  },
};
