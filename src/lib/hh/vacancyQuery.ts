import { appendVacancySearchFiltersToHhApiParams } from "./vacancyHhApiSearchParams";
import type { VacancySearchPayload } from "./vacancySearchTypes";

/** Собирает query для GET /vacancies (повторяющиеся ключи — несколько значений). */
export function buildVacancySearchParams(payload: VacancySearchPayload): URLSearchParams {
  const p = new URLSearchParams();
  const { page, perPage, ...filters } = payload;
  appendVacancySearchFiltersToHhApiParams(p, filters);

  p.set("page", String(Math.max(0, page ?? 0)));
  p.set("per_page", String(Math.min(100, Math.max(1, perPage ?? 20))));
  // Match hh.ru web query profile closer for comparable result sets.
  p.set("enable_snippets", "false");

  return p;
}
