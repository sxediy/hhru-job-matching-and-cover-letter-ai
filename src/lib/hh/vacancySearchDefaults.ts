/** hh.ru vacancy search_field ids when all three are used (matches hh.ru web defaults). */
export const DEFAULT_VACANCY_SEARCH_FIELDS = ["name", "company_name", "description"] as const;

export type DefaultVacancySearchField = (typeof DEFAULT_VACANCY_SEARCH_FIELDS)[number];

const DEFAULT_SEARCH_FIELD_SET = new Set<string>(DEFAULT_VACANCY_SEARCH_FIELDS);

/** Empty selection means search in all default fields (same as hh.ru with no `search_field` in URL). */
export function effectiveVacancySearchFieldIds(selected: ReadonlySet<string>): string[] {
  if (selected.size === 0) return [...DEFAULT_VACANCY_SEARCH_FIELDS];
  return [...selected]
    .filter((id) => DEFAULT_SEARCH_FIELD_SET.has(id))
    .sort((a, b) => a.localeCompare(b, "en"));
}

/** True when the effective field list is the full default triple (omit from app URL). */
export function isFullDefaultVacancySearchFields(fields: readonly string[]): boolean {
  if (fields.length !== DEFAULT_VACANCY_SEARCH_FIELDS.length) return false;
  const s = new Set(fields);
  return DEFAULT_VACANCY_SEARCH_FIELDS.every((f) => s.has(f));
}
