import { DEFAULT_VACANCY_SEARCH_FIELDS } from "./vacancySearchDefaults";
import type { VacancySearchFilters } from "./vacancySearchTypes";

export type VacancySearchCurrencyParam = "currency" | "currency_code";

/** Append vacancy filter fields to `URLSearchParams` (hh.ru web / shard / Open API). */
export function appendVacancySearchFiltersToParams(
  target: URLSearchParams,
  filters: VacancySearchFilters,
  options?: { currencyParam?: VacancySearchCurrencyParam },
): void {
  const currencyParam = options?.currencyParam ?? "currency";
  const text = filters.text?.trim();
  if (text) target.set("text", text);

  const excludedText = filters.excludedText?.trim();
  if (excludedText) target.set("excluded_text", excludedText);

  const fields = filters.searchFields?.length ? filters.searchFields : [...DEFAULT_VACANCY_SEARCH_FIELDS];
  for (const f of fields) target.append("search_field", f);

  for (const id of filters.areaIds ?? []) {
    if (id) target.append("area", id);
  }

  for (const id of filters.employmentForm ?? []) {
    if (id) target.append("employment_form", id);
  }

  for (const id of filters.experience ?? []) {
    if (id) target.append("experience", id);
  }

  for (const id of filters.workFormat ?? []) {
    if (id) target.append("work_format", id);
  }

  for (const id of filters.labels ?? []) {
    if (id) target.append("label", id);
  }

  const labelList = filters.labels ?? [];
  if (filters.withStatedSalary && !labelList.includes("with_salary")) {
    target.append("label", "with_salary");
  }

  if (filters.salary != null && filters.currency_code) {
    target.set("salary", String(Math.trunc(filters.salary)));
    target.set(currencyParam, filters.currency_code);
  }
}

/** Append vacancy **filter** fields to `URLSearchParams` for hh.ru Open API `GET /vacancies`. */
export function appendVacancySearchFiltersToHhApiParams(
  target: URLSearchParams,
  filters: VacancySearchFilters,
): void {
  appendVacancySearchFiltersToParams(target, filters, { currencyParam: "currency" });
}
