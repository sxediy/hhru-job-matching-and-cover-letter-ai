import type { VacancySearchPayload } from "./vacancySearchTypes";

const DEFAULT_SEARCH_FIELDS = ["name", "company_name", "description"] as const;

/** Собирает query для GET /vacancies (повторяющиеся ключи — несколько значений). */
export function buildVacancySearchParams(payload: VacancySearchPayload): URLSearchParams {
  const p = new URLSearchParams();
  const text = payload.text?.trim();
  if (text) p.set("text", text);

  const excludedText = payload.excludedText?.trim();
  if (excludedText) p.set("excluded_text", excludedText);

  const fields = payload.searchFields?.length ? payload.searchFields : [...DEFAULT_SEARCH_FIELDS];
  for (const f of fields) p.append("search_field", f);

  for (const id of payload.areaIds ?? []) {
    if (id) p.append("area", id);
  }

  for (const id of payload.employmentForm ?? []) {
    if (id) p.append("employment_form", id);
  }

  if (payload.experience) p.set("experience", payload.experience);

  for (const id of payload.workFormat ?? []) {
    if (id) p.append("work_format", id);
  }

  for (const id of payload.labels ?? []) {
    if (id) p.append("label", id);
  }

  const labelList = payload.labels ?? [];
  if (payload.withStatedSalary && !labelList.includes("with_salary")) {
    p.append("label", "with_salary");
  }

  if (payload.salary != null && payload.currency_code) {
    p.set("salary", String(Math.trunc(payload.salary)));
    // HH API `/vacancies` expects `currency`; `currency_code` is for hh.ru web search URL.
    p.set("currency", payload.currency_code);
  }

  p.set("page", String(Math.max(0, payload.page ?? 0)));
  p.set("per_page", String(Math.min(100, Math.max(1, payload.perPage ?? 20))));
  // Match hh.ru web query profile closer for comparable result sets.
  p.set("enable_snippets", "false");

  return p;
}
