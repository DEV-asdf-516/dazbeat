export function fillStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  pointCount: number,
  outerRadius: number,
  innerRadius: number,
): void {
  context.beginPath();
  for (let index = 0; index < pointCount * 2; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / pointCount;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
}

export function fillFourPointStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  waist = 0.32,
): void {
  fillStar(context, x, y, 4, radius, radius * waist);
}
