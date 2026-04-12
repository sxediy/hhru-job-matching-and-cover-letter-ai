import {
  DEFAULT_VACANCY_SEARCH_FIELDS,
  isFullDefaultVacancySearchFields,
  type DefaultVacancySearchField,
} from "./vacancySearchDefaults";

/**
 * App-only query param (repeated): client-side substring excludes for vacancy titles.
 * Never pass to hh.ru Open API — use {@link vacancyAppSearchParamsForHhWebsite} for hh.ru links.
 */
export const VACANCY_APP_TITLE_LOCAL_QUERY_KEY = "title_not";

/**
 * Query keys used in the **app** URL for vacancy search filters (hh.ru web-style names).
 * Not the same as GET /vacancies API keys (e.g. API uses `currency`, not `currency_code`).
 */
export const VACANCY_APP_SEARCH_QUERY_KEYS = new Set<string>([
  "text",
  "excluded_text",
  "search_field",
  "area",
  "employment_form",
  "experience",
  "work_format",
  "label",
  "salary",
  "currency_code",
  VACANCY_APP_TITLE_LOCAL_QUERY_KEY,
]);

const MAX_TITLE_LOCAL_EXCLUDE_PHRASES = 48;
const MAX_TITLE_LOCAL_EXCLUDE_CHARS = 200;

function normalizeTitleLocalExcludesFromUrl(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    let t = r.trim();
    if (!t) continue;
    if (t.length > MAX_TITLE_LOCAL_EXCLUDE_CHARS) t = t.slice(0, MAX_TITLE_LOCAL_EXCLUDE_CHARS);
    const lk = t.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    out.push(t);
    if (out.length >= MAX_TITLE_LOCAL_EXCLUDE_PHRASES) break;
  }
  return out;
}

export function isVacancyAppSearchQueryKey(key: string): boolean {
  return VACANCY_APP_SEARCH_QUERY_KEYS.has(key);
}

/** True if the URL contains at least one app vacancy-filter key (value may be empty). */
export function urlSearchParamsHasVacancyAppFilter(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (VACANCY_APP_SEARCH_QUERY_KEYS.has(key)) return true;
  }
  return false;
}

/** hh.ru vacancy `label` ids we persist in the app URL (subset of dictionary). */
export const VACANCY_APP_URL_LABEL_IDS = [
  "not_from_agency",
  "with_address",
  "accept_handicapped",
  "low_performance",
  "accredited_it",
] as const;

export type VacancyAppUrlLabelId = (typeof VACANCY_APP_URL_LABEL_IDS)[number];

function toSortedUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, "en"));
}

export type VacancyAppUrlParsedFilters = {
  text: string;
  excludedText: string;
  searchFields: string[];
  areaIds: Set<string>;
  employmentForm: Set<string>;
  experience: Set<string>;
  workFormat: Set<string>;
  labels: Set<string>;
  withStatedSalary: boolean;
  salaryAmount: string;
  currency_code: string;
  /** Parsed from repeated `title_not`; app-only, not hh.ru API. */
  titleLocalExcludes: string[];
};

export type VacancyAppUrlAllowedIds = {
  employmentForm: Set<string>;
  workFormat: Set<string>;
  experience: Set<string>;
};

export function parseVacancyAppSearchFromUrlSearchParams(
  params: URLSearchParams,
  allowed: VacancyAppUrlAllowedIds,
): VacancyAppUrlParsedFilters {
  const allSearchFields = toSortedUnique(params.getAll("search_field"));
  const searchFields =
    allSearchFields.length === 0
      ? [...DEFAULT_VACANCY_SEARCH_FIELDS]
      : allSearchFields.filter((f): f is DefaultVacancySearchField =>
          (DEFAULT_VACANCY_SEARCH_FIELDS as readonly string[]).includes(f),
        );
  const effectiveSearchFields = searchFields.length > 0 ? searchFields : [...DEFAULT_VACANCY_SEARCH_FIELDS];

  const labelValues = params.getAll("label");
  const withStatedSalary = labelValues.includes("with_salary");
  const labels = new Set(
    labelValues.filter((id) => (VACANCY_APP_URL_LABEL_IDS as readonly string[]).includes(id)),
  );

  const normalizedExperience = new Set(
    toSortedUnique(params.getAll("experience")).filter((id) => allowed.experience.has(id)),
  );

  const salaryRaw = params.get("salary")?.trim() ?? "";
  const salaryNum = Number(salaryRaw);
  const salaryAmount =
    salaryRaw !== "" && Number.isFinite(salaryNum) && salaryNum > 0 ? String(Math.trunc(salaryNum)) : "";

  return {
    text: params.get("text")?.trim() ?? "",
    excludedText: params.get("excluded_text")?.trim() ?? "",
    searchFields: effectiveSearchFields,
    areaIds: new Set(toSortedUnique(params.getAll("area"))),
    employmentForm: new Set(
      toSortedUnique(params.getAll("employment_form")).filter((id) => allowed.employmentForm.has(id)),
    ),
    experience: normalizedExperience,
    workFormat: new Set(
      toSortedUnique(params.getAll("work_format")).filter((id) => allowed.workFormat.has(id)),
    ),
    labels,
    withStatedSalary,
    salaryAmount,
    currency_code: params.get("currency_code")?.trim().toUpperCase() ?? "",
    titleLocalExcludes: normalizeTitleLocalExcludesFromUrl(params.getAll(VACANCY_APP_TITLE_LOCAL_QUERY_KEY)),
  };
}

/** Writable filter state for building the app URL (mirrors SearchPage snapshot fields). */
export type VacancyAppUrlWriteState = {
  text: string;
  excludedText: string;
  searchFields: string[];
  selectedAreaIds: Iterable<string>;
  employmentForm: Iterable<string>;
  experience: Iterable<string>;
  workFormat: Iterable<string>;
  labels: Iterable<string>;
  withStatedSalary: boolean;
  salaryAmount: string;
  currencyResolved: string;
  /** App-only; each value becomes one `title_not` query param (not sent to hh.ru API). */
  titleLocalExcludes: readonly string[];
};

export function buildVacancyAppUrlSearchParams(snapshot: VacancyAppUrlWriteState): URLSearchParams {
  const params = new URLSearchParams();
  if (snapshot.text.trim()) params.set("text", snapshot.text.trim());
  if (snapshot.excludedText.trim()) params.set("excluded_text", snapshot.excludedText.trim());

  const searchFieldsSorted = toSortedUnique(snapshot.searchFields);
  if (!isFullDefaultVacancySearchFields(searchFieldsSorted)) {
    for (const field of searchFieldsSorted) {
      params.append("search_field", field);
    }
  }

  for (const areaId of toSortedUnique(snapshot.selectedAreaIds)) params.append("area", areaId);
  for (const id of toSortedUnique(snapshot.employmentForm)) params.append("employment_form", id);
  for (const id of toSortedUnique(snapshot.experience)) params.append("experience", id);
  for (const id of toSortedUnique(snapshot.workFormat)) params.append("work_format", id);
  for (const id of toSortedUnique(snapshot.labels)) params.append("label", id);
  if (snapshot.withStatedSalary) params.append("label", "with_salary");

  if (snapshot.salaryAmount && snapshot.currencyResolved) {
    params.set("salary", snapshot.salaryAmount);
    params.set("currency_code", snapshot.currencyResolved);
  }

  for (const phrase of snapshot.titleLocalExcludes) {
    const t = String(phrase).trim();
    if (t) params.append(VACANCY_APP_TITLE_LOCAL_QUERY_KEY, t);
  }

  return params;
}

/** Same as {@link buildVacancyAppUrlSearchParams} but strips app-only keys before opening hh.ru in the browser. */
export function vacancyAppSearchParamsForHhWebsite(snapshot: VacancyAppUrlWriteState): URLSearchParams {
  const p = buildVacancyAppUrlSearchParams(snapshot);
  p.delete(VACANCY_APP_TITLE_LOCAL_QUERY_KEY);
  return p;
}
