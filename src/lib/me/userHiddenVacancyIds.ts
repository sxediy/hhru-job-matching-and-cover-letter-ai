import type { SupabaseClient } from "@supabase/supabase-js";

/** Vacancy ids the user marked hidden (session-persisted in user_hidden_vacancies). */
export async function loadUserHiddenVacancyIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_hidden_vacancies")
    .select("vacancy_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.vacancy_id)));
}

/** PostgREST `not.in` list for text vacancy_id values. */
export function postgrestQuotedInList(ids: Iterable<string>): string {
  return `(${[...ids].map((id) => `"${id}"`).join(",")})`;
}
