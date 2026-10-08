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
    hint: 'Esc Back',
  },
  result: {
    hint: '←→ Difficulty   ↑↓ Move   Enter Select   Esc Tracks',
  },
  gameplay: {
    loading: 'Loading',
    pressEnterToStart: 'Press Enter to start',
    buffering: 'Buffering',
    paused: 'Paused · Press Enter to resume',
    preparing: 'Preparing playback',
    chartLoadFailed: 'Failed to load chart',
    playerLoadFailed: 'Failed to load video player',
    videoError: 'Video playback error: {{message}}',
    backToSongSelect: 'Back to Tracks',
    quitTitle: 'Quit this play?',
    quitConfirm: 'This play will not be recorded',
  },
  chartEditorSelect: {
    title: 'Chart Editor',
    hint: '↑↓ Select song   Q/E Category   Enter Edit   Esc Exit',
    emptyFilter: 'No songs in this category',
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
