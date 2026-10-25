export function isOriginAllowed(origin: string, host: string, allowedOriginsText: string): boolean {
  if (origin === '') {
    return true;
  }
  const allowedOrigins = allowedOriginsText
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return (
    allowedOrigins.includes(origin) || origin === `http://${host}` || origin === `https://${host}`
  );
}
