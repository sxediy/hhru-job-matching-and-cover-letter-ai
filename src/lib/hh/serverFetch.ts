const HH_API_BASE = "https://api.hh.ru";
const HH_SITE_BASE = "https://hh.ru";

export function getHhUserAgent(): string {
  const ua = process.env.HH_USER_AGENT?.trim();
  if (!ua) {
    throw new Error(
      "Set HH_USER_AGENT in .env (format: AppName/1.0 (your@email.com)) — required for hh.ru requests",
    );
  }
  return ua;
}

function hhRequest(base: string, path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": getHhUserAgent(),
      ...init?.headers,
    },
  });
}

/** Open API (api.hh.ru): dictionaries, areas, single vacancy details. */
export async function hhFetch(path: string, init?: RequestInit): Promise<Response> {
  return hhRequest(HH_API_BASE, path, init);
}

/** Site (hh.ru): shard search, vacancy page HTML — unofficial, no OAuth. */
export async function hhShardFetch(path: string, init?: RequestInit): Promise<Response> {
  return hhRequest(HH_SITE_BASE, path, init);
}
