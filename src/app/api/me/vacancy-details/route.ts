import { HH_VACANCY_SEARCH_MAX_FOUND_FOR_HEAVY_ACTIONS } from "@/lib/hh/hhVacancySearchMaxFoundForHeavyActions";
import { VACANCY_DETAILS_SAVE_MAX_IDS_PER_REQUEST } from "@/lib/me/vacancyDetailsSaveChunk";
import {
  loadUserHiddenVacancyIds,
  postgrestQuotedInList,
} from "@/lib/me/userHiddenVacancyIds";
import { deleteUserVacancyDetails } from "@/lib/me/userVacancyDetails";
import { fetchVacancyDetailsPayloadWithRetries } from "@/lib/hh/shardVacancyView";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/** Allow long sequential HH fetches (host may still cap below this). */
export const maxDuration = 180;

const MAX_IDS = VACANCY_DETAILS_SAVE_MAX_IDS_PER_REQUEST;
/** Pause between hh.ru vacancy page fetches (~1.3 req/s). */
const BETWEEN_MS = 750;

async function getSupabaseOr503() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseNumericVacancyIdList(
  raw: unknown,
  maxLen: number,
): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string" && typeof x !== "number") continue;
    const id = String(x).trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length > maxLen) return null;
  }
  return out.length > 0 ? out : null;
}

function parseVacancyIds(body: unknown): string[] | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  return parseNumericVacancyIdList((body as { vacancyIds?: unknown }).vacancyIds, MAX_IDS);
}

async function loadExistingVacancyDetailIds(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  vacancyIds: string[],
): Promise<Set<string>> {
  if (vacancyIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("user_vacancy_details")
    .select("vacancy_id")
    .eq("user_id", userId)
    .in("vacancy_id", vacancyIds);
  if (error) throw error;
  return new Set((data ?? []).map((row) => String(row.vacancy_id)));
}

/** POST — fetch each vacancy from hh.ru (Lux vacancyView) and upsert JSON into user_vacancy_details. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestedIds = parseVacancyIds(body);
  if (!requestedIds) {
    return NextResponse.json(
      { error: `Provide vacancyIds: string[] (1–${MAX_IDS} numeric ids)` },
      { status: 400 },
    );
  }

  const replaceSnapshotRaw = (body as { replaceSnapshot?: unknown }).replaceSnapshot;
  const replaceSnapshot = replaceSnapshotRaw !== false;

  const snapshotVacancyIdsRaw = (body as { snapshotVacancyIds?: unknown }).snapshotVacancyIds;
  const snapshotVacancyIds =
    snapshotVacancyIdsRaw === undefined
      ? null
      : parseNumericVacancyIdList(
          snapshotVacancyIdsRaw,
          HH_VACANCY_SEARCH_MAX_FOUND_FOR_HEAVY_ACTIONS,
        );
  if (snapshotVacancyIdsRaw !== undefined && !snapshotVacancyIds) {
    return NextResponse.json({ error: "Invalid snapshotVacancyIds" }, { status: 400 });
  }

  const searchFoundRaw = (body as { searchFound?: unknown }).searchFound;
  if (searchFoundRaw !== undefined) {
    if (typeof searchFoundRaw !== "number" || !Number.isFinite(searchFoundRaw) || searchFoundRaw < 0) {
      return NextResponse.json({ error: "Invalid searchFound" }, { status: 400 });
    }
    if (searchFoundRaw > HH_VACANCY_SEARCH_MAX_FOUND_FOR_HEAVY_ACTIONS) {
      return NextResponse.json(
        {
          error: `Too many results for this action. Need no more than ${HH_VACANCY_SEARCH_MAX_FOUND_FOR_HEAVY_ACTIONS}.`,
        },
        { status: 400 },
      );
    }
  }

  const supabase = await getSupabaseOr503();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let hiddenIds: Set<string>;
  try {
    hiddenIds = await loadUserHiddenVacancyIds(supabase, user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load hidden vacancies";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const ids = requestedIds.filter((id) => !hiddenIds.has(id));
  const skippedHidden = requestedIds.length - ids.length;

  let removed = 0;
  try {
    removed += await deleteUserVacancyDetails(supabase, user.id, hiddenIds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to purge hidden vacancy details";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  /** First chunk only: drop cached rows outside this search snapshot. */
  if (replaceSnapshot) {
    let clearQuery = supabase.from("user_vacancy_details").delete({ count: "exact" }).eq("user_id", user.id);
    if (snapshotVacancyIds && snapshotVacancyIds.length > 0) {
      clearQuery = clearQuery.not("vacancy_id", "in", postgrestQuotedInList(snapshotVacancyIds));
    }
    const { error: clearError, count: clearCount } = await clearQuery;
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }
    removed += clearCount ?? 0;
  }

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      requested: requestedIds.length,
      saved: 0,
      removed,
      skippedHidden,
      skippedCached: 0,
      skippedCachedIds: [],
      savedIds: [],
      failed: [],
      failedByStatus: {},
    });
  }

  let existingIds: Set<string>;
  try {
    existingIds = await loadExistingVacancyDetailIds(supabase, user.id, ids);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load cached vacancy details";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const skippedCachedIds = ids.filter((id) => existingIds.has(id));
  const idsToFetch = ids.filter((id) => !existingIds.has(id));

  const saved: string[] = [];
  const failed: { id: string; status: number; detail?: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < idsToFetch.length; i++) {
    const id = idsToFetch[i]!;
    if (i > 0) await sleep(BETWEEN_MS);

    const fetched = await fetchVacancyDetailsPayloadWithRetries(id);
    if (!fetched.ok) {
      failed.push({ id, status: fetched.status, detail: fetched.detail });
      continue;
    }
    const payload = fetched.payload;

    const { error } = await supabase.from("user_vacancy_details").upsert(
      {
        user_id: user.id,
        vacancy_id: id,
        payload,
        updated_at: now,
      },
      { onConflict: "user_id,vacancy_id" },
    );

    if (error) {
      failed.push({ id, status: 500, detail: error.message });
      continue;
    }
    saved.push(id);
  }

  const failedByStatus: Record<string, number> = {};
  for (const f of failed) {
    const k = String(f.status);
    failedByStatus[k] = (failedByStatus[k] ?? 0) + 1;
  }

  return NextResponse.json(
    {
      ok: true,
      requested: requestedIds.length,
      saved: saved.length,
      removed,
      skippedHidden,
      skippedCached: skippedCachedIds.length,
      skippedCachedIds,
      savedIds: saved,
      failed,
      failedByStatus,
    },
    { status: 200 },
  );
}
