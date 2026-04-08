const HH_BASE = "https://api.hh.ru";

export function getHhUserAgent(): string {
  const ua = process.env.HH_USER_AGENT?.trim();
  if (!ua) {
    throw new Error(
      "Set HH_USER_AGENT in .env (format: AppName/1.0 (your@email.com)) — required by api.hh.ru",
    );
  }
  return ua;
}

export async function hhFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${HH_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": getHhUserAgent(),
      ...init?.headers,
    },
  });
}
