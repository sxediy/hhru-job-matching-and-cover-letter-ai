export type VacancySearchPayload = {
  text?: string;
  /** hh.ru `excluded_text`: comma-separated words to filter out */
  excludedText?: string;
  /** vacancy_search_fields ids; пусто = все три как у HH */
  searchFields?: string[];
  areaIds?: string[];
  employmentForm?: string[];
  experience?: string;
  workFormat?: string[];
  labels?: string[];
  /** hh.ru `label=with_salary` — only vacancies where employer stated income */
  withStatedSalary?: boolean;
  salary?: number | null;
  currency?: string;
  page?: number;
  perPage?: number;
};
