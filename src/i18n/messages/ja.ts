import type { Messages } from './ko.js';

export const ja: Messages = {
  boot: {
    loadFailed: 'ゲームデータを読み込めませんでした。しばらくしてから再読み込みしてください。',
  },
  main: {
    hint: '↑↓ 移動   Enter 決定',
    account: {
      signInFailed: 'Google ログインに失敗しました',
    },
  },
  songSelect: {
    hint: '↑↓ 曲   ←→ 難易度   Q/E カテゴリー   Enter プレイ   Tab 設定   Esc メイン',
    noSongs: '曲がありません',
    noRecord: '記録なし',
  },
  settings: {
    title: '設定',
    hint: '↑↓ 移動   ←→ 調整   Enter キー変更   Esc 戻る',
    waitingKey: 'レーン{{lane}}のキーを押してください (Esc キャンセル)',
    groups: {
      audio: 'オーディオ',
      input: '入力',
      general: '一般',
    },
    rows: {
      masterVolume: 'マスター音量',
      musicVolume: '音楽音量',
      effectVolume: '効果音音量',
      inputOffset: '入力オフセット',
      laneKey: 'レーン{{lane}}のキー',
      noteSpeed: 'ノーツ速度',
      mvMode: 'MVモード',
      language: '言語',
    },
  },
  credits: {
    title: 'クレジット',
    hint: 'Esc 戻る',
  },
  result: {
    hint: '←→ 難易度   ↑↓ 移動   Enter 決定   Esc 曲選択',
  },
  gameplay: {
    loading: '読み込み中',
    pressEnterToStart: 'Enter で開始',
    buffering: 'バッファリング中',
    paused: '一時停止中 · Enter で再開',
    preparing: '再生準備中',
    chartLoadFailed: '譜面の読み込みに失敗しました',
    playerLoadFailed: '動画プレーヤーの読み込みに失敗しました',
    videoError: '動画再生エラー: {{message}}',
    backToSongSelect: '曲選択へ',
    quitTitle: 'プレイをやめますか？',
    quitConfirm: '今回のプレイ記録は保存されません',
  },
  chartEditorSelect: {
    title: '譜面編集',
    hint: '↑↓ 曲を選択   Q/E カテゴリー   Enter 編集   Esc 終了',
    emptyFilter: 'このカテゴリーに曲がありません',
  },
  chartEditor: {
    hint: 'Space 再生/一時停止   Delete ノート削除   ホイール 移動   Esc 終了',
    noSongs: '曲がありません',
    loading: '譜面を読み込み中',
    chartLoadFailed: '譜面を読み込めませんでした',
    discardTitle: '変更を破棄しますか？',
    discardConfirm: '保存していない変更は失われます',
    clearTitle: 'ノートをすべて削除しますか？',
    clearConfirm: 'ノート{{noteCount}}個が消えます。\n保存するまでサーバーには反映されません。',
    noSelection: '選択中のノートなし',
    saving: '保存中',
    saved: '保存しました',
    saveFailed: '保存に失敗しました',
    invalidChart: '譜面の検証に失敗しました: {{reason}}',
    noteCount: 'ノート{{count}}個',
    toolSection: '入力ツール',
    selectionSection: '選択中のノート',
  },
  youtubeError: {
    invalidParameter: '無効な動画ID',
    html5PlayerError: 'ブラウザプレーヤーのエラー',
    videoNotFound: '動画が見つかりません (削除・非公開)',
    embeddingNotAllowed: '埋め込みが許可されていない動画',
    embeddingNotAllowedHint:
      '広告ブロック拡張機能やログイン状態を確認するか、シークレットウィンドウでプレイしてください',
    unknown: '不明なエラー',
    withCode: '{{message}} (エラー {{code}})',
  },
};
