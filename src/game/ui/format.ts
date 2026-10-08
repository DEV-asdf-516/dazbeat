const SCORE_FORMAT = new Intl.NumberFormat('en-US');

export function formatScore(score: number): string {
  return SCORE_FORMAT.format(score);
}

export function formatAccuracy(accuracy: number): string {
  return `${(accuracy * 100).toFixed(2)}%`;
}

export function formatKeyCode(code: string): string {
  const match = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(code);
  if (match !== null) {
    return match[1] ?? match[2] ?? code;
  }
  return code === 'Space' ? 'SPACE' : code;
}
