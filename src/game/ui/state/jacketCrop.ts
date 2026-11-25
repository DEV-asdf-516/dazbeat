export function getCenteredSquare(
  width: number,
  height: number,
): { x: number; y: number; sidePx: number } {
  const sidePx = Math.min(width, height);
  return {
    x: Math.floor((width - sidePx) / 2),
    y: Math.floor((height - sidePx) / 2),
    sidePx,
  };
}
