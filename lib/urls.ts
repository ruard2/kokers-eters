export function appUrl(path: string) {
  const rawBase = (process.env.APP_URL || "http://localhost:3000").trim();
  const base = /^https?:\/\//i.test(rawBase)
    ? rawBase
    : /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(rawBase)
      ? `http://${rawBase}`
      : `https://${rawBase}`;
  return new URL(path, base).toString();
}
