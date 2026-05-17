import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove cached full vacancy payloads for the given ids. Returns rows deleted. */
export async function deleteUserVacancyDetails(
  supabase: SupabaseClient,
  userId: string,
  vacancyIds: Iterable<string>,
): Promise<number> {
  const ids = [...vacancyIds];
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from("user_vacancy_details")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .in("vacancy_id", ids);
  if (error) throw error;
  return count ?? 0;
}
