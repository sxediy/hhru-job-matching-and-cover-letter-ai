/** hh.ru vacancy search_field ids when all three are used (matches hh.ru web defaults). */
export const DEFAULT_VACANCY_SEARCH_FIELDS = ["name", "company_name", "description"] as const;

export type DefaultVacancySearchField = (typeof DEFAULT_VACANCY_SEARCH_FIELDS)[number];
