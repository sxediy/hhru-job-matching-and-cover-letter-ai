/** Client-side filter: drop vacancies whose `name` contains any phrase (case-insensitive). */

export type VacancyNameLike = { name?: string };

export function vacancyTitleContainsPhrase(name: string | undefined, phrase: string): boolean {
  const t = phrase.trim();
  if (!t || !name) return false;
  return name.toLowerCase().includes(t.toLowerCase());
}

export function filterVacanciesByLocalTitlePhrases<T extends VacancyNameLike>(
  items: T[],
  phrases: readonly string[],
): T[] {
  const normalized = phrases.map((p) => p.trim()).filter(Boolean);
  if (normalized.length === 0) return items;
  return items.filter((it) => !normalized.some((p) => vacancyTitleContainsPhrase(it.name, p)));
}
