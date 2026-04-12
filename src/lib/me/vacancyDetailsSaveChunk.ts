/**
 * Max vacancy ids per POST /api/me/vacancy-details.
 * Smaller chunks + more client round-trips reduce sustained HH rate-limit (429) bursts.
 */
export const VACANCY_DETAILS_SAVE_MAX_IDS_PER_REQUEST = 35;

export function chunkVacancyIdsForSave(ids: string[], chunkSize: number): string[][] {
  if (chunkSize <= 0) return ids.length ? [ids] : [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    out.push(ids.slice(i, i + chunkSize));
  }
  return out;
}
