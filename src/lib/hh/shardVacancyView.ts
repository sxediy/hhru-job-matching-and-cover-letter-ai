import { hhShardFetch } from "./serverFetch";

const LUX_INITIAL_STATE_RE =
  /<template[^>]*\bid=["']HH-Lux-InitialState["'][^>]*>([\s\S]*?)<\/template>/i;

const HH_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const HH_FETCH_MAX_ATTEMPTS = 7;

export type HhVacancyViewFetchResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; detail?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract `vacancyView` from hh.ru vacancy page HTML (Lux SSR). */
export function parseVacancyViewFromLuxHtml(html: string): Record<string, unknown> | null {
  const m = html.match(LUX_INITIAL_STATE_RE);
  if (!m?.[1]) return null;
  let state: unknown;
  try {
    state = JSON.parse(m[1]) as unknown;
  } catch {
    return null;
  }
  if (state == null || typeof state !== "object" || Array.isArray(state)) return null;
  const view = (state as { vacancyView?: unknown }).vacancyView;
  if (view == null || typeof view !== "object" || Array.isArray(view)) return null;
  return view as Record<string, unknown>;
}

function mapCompensation(comp: unknown): Record<string, unknown> | null {
  if (comp == null || typeof comp !== "object" || Array.isArray(comp)) return null;
  const c = comp as Record<string, unknown>;
  if (c.noCompensation != null) return null;
  const from = c.from;
  const to = c.to;
  if (from == null && to == null) return null;
  return {
    from: typeof from === "number" ? from : undefined,
    to: typeof to === "number" ? to : undefined,
    currency: typeof c.currencyCode === "string" ? c.currencyCode : undefined,
    gross: typeof c.gross === "boolean" ? c.gross : undefined,
  };
}

function mapKeySkills(keySkills: unknown): { name: string }[] {
  if (keySkills == null || typeof keySkills !== "object" || Array.isArray(keySkills)) return [];
  const raw = (keySkills as { keySkill?: unknown }).keySkill;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((name) => ({ name }));
}

/**
 * Normalize Lux `vacancyView` toward Open API–like fields used by matching,
 * while keeping the full shard object under `vacancyView`.
 */
export function adaptVacancyViewToStoredPayload(
  vacancyId: string,
  view: Record<string, unknown>,
): Record<string, unknown> {
  const id = String(view.vacancyId ?? vacancyId);
  const company =
    view.company != null && typeof view.company === "object" && !Array.isArray(view.company)
      ? (view.company as Record<string, unknown>)
      : undefined;
  const area =
    view.area != null && typeof view.area === "object" && !Array.isArray(view.area)
      ? (view.area as Record<string, unknown>)
      : undefined;

  const areaId = area?.["@id"] ?? area?.id;

  return {
    _source: "hh.ru/vacancy",
    id,
    name: typeof view.name === "string" ? view.name : "",
    description: typeof view.description === "string" ? view.description : "",
    key_skills: mapKeySkills(view.keySkills),
    employer: company
      ? {
          id: company.id,
          name:
            (typeof company.name === "string" ? company.name : undefined) ??
            (typeof company.visibleName === "string" ? company.visibleName : undefined),
        }
      : undefined,
    area: area
      ? {
          id: typeof areaId === "number" || typeof areaId === "string" ? areaId : undefined,
          name: typeof area.name === "string" ? area.name : undefined,
        }
      : undefined,
    salary: mapCompensation(view.compensation),
    experience:
      typeof view.workExperience === "string" ? { id: view.workExperience } : undefined,
    employment:
      typeof view.employmentForm === "string" ? { id: view.employmentForm } : undefined,
    alternate_url: `https://hh.ru/vacancy/${id}`,
    published_at: view.publicationDate,
    vacancyView: view,
  };
}

/**
 * Full vacancy card via hh.ru site (Lux SSR), not api.hh.ru/vacancies/{id}.
 * api.hh.ru often returns 403 without OAuth; the public vacancy page still exposes `vacancyView`.
 */
export async function fetchVacancyDetailsPayloadWithRetries(
  vacancyId: string,
): Promise<HhVacancyViewFetchResult> {
  let lastStatus = 503;
  let lastDetail: string | undefined;

  for (let attempt = 0; attempt < HH_FETCH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(22_000, 900 * 2 ** (attempt - 1));
      await sleep(backoff);
    }

    let res: Response;
    try {
      res = await hhShardFetch(`/vacancy/${vacancyId}`, {
        cache: "no-store",
        headers: { Accept: "text/html" },
      });
    } catch {
      lastStatus = 503;
      lastDetail = "hh.ru unreachable";
      continue;
    }

    if (res.status === 404) {
      return { ok: false, status: 404, detail: "Vacancy not found" };
    }

    if (!res.ok) {
      lastStatus = res.status;
      if (!HH_RETRYABLE_STATUS.has(res.status)) {
        return { ok: false, status: res.status, detail: `hh.ru vacancy page failed (${res.status})` };
      }
      await res.text().catch(() => {});
      if (res.status === 429) {
        const ra = res.headers.get("Retry-After");
        const sec = parseInt(ra ?? "", 10);
        const fromHeader = Number.isFinite(sec) && sec > 0 && sec <= 180 ? sec * 1000 : 0;
        await sleep(Math.max(3200, fromHeader));
      }
      continue;
    }

    const html = await res.text();
    const view = parseVacancyViewFromLuxHtml(html);
    if (!view) {
      return { ok: false, status: 502, detail: "vacancyView missing in hh.ru page state" };
    }

    const parsedId = String(view.vacancyId ?? "");
    if (parsedId && parsedId !== vacancyId) {
      return { ok: false, status: 502, detail: "vacancyView id mismatch" };
    }

    return { ok: true, payload: adaptVacancyViewToStoredPayload(vacancyId, view) };
  }

  return { ok: false, status: lastStatus, detail: lastDetail ?? "hh.ru unreachable after retries" };
}
