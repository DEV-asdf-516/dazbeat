export type GraphicsLevel = 'low' | 'high';

export function getGraphicsLevel(isSoftwareRendering: boolean): GraphicsLevel {
  return isSoftwareRendering ? 'low' : 'high';
}
