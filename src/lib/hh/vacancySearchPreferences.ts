import { isVacancyAppSearchQueryKey } from "./vacancyAppSearchUrl";

const MAX_FILTERS_JSON_BYTES = 24_000;

/** Serializable snapshot of app URL filter query (same keys as URLSearchParams). */
export type VacancySearchPreferencesRecord = Record<string, string | string[]>;

export function serializeAppUrlParamsToFiltersRecord(params: URLSearchParams): VacancySearchPreferencesRecord {
  const out: VacancySearchPreferencesRecord = {};
  for (const key of params.keys()) {
    if (!isVacancyAppSearchQueryKey(key)) continue;
    const all = params.getAll(key);
    if (all.length === 0) continue;
    out[key] = all.length === 1 ? all[0] : all;
  }
  return out;
}

/** Build URLSearchParams from stored JSON; rejects unknown keys and invalid value types. */
export function parseFiltersRecordToUrlSearchParams(record: unknown): URLSearchParams | null {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return null;
  const p = new URLSearchParams();
  for (const [key, raw] of Object.entries(record as Record<string, unknown>)) {
    if (!isVacancyAppSearchQueryKey(key)) return null;
    if (typeof raw === "string") {
      p.append(key, raw);
    } else if (Array.isArray(raw)) {
      if (!raw.every((x) => typeof x === "string")) return null;
      for (const v of raw) p.append(key, v);
    } else {
      return null;
    }
  }
  return p;
}

export function validateFiltersPayload(
  body: unknown,
): { ok: true; filters: VacancySearchPreferencesRecord } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const filtersRaw = (body as { filters?: unknown }).filters;
  if (filtersRaw === undefined || filtersRaw === null) {
    return { ok: true, filters: {} };
  }
  if (typeof filtersRaw !== "object" || Array.isArray(filtersRaw)) {
    return { ok: false, error: "filters must be an object" };
  }
  const encoded = JSON.stringify(filtersRaw);
  if (encoded.length > MAX_FILTERS_JSON_BYTES) {
    return { ok: false, error: "filters JSON is too large" };
  }
  const params = parseFiltersRecordToUrlSearchParams(filtersRaw);
  if (!params) {
    return { ok: false, error: "Invalid filters: only known app URL keys and string or string[] values are allowed" };
  }
  return { ok: true, filters: serializeAppUrlParamsToFiltersRecord(params) };
}
