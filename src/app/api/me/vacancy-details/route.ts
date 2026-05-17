import { HH_VACANCY_SEARCH_MAX_FOUND_FOR_HEAVY_ACTIONS } from "@/lib/hh/hhVacancySearchMaxFoundForHeavyActions";
import { VACANCY_DETAILS_SAVE_MAX_IDS_PER_REQUEST } from "@/lib/me/vacancyDetailsSaveChunk";
import {
  loadUserHiddenVacancyIds,
  postgrestQuotedInList,
} from "@/lib/me/userHiddenVacancyIds";
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

function parseVacancyIds(body: unknown): string[] | null {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as { vacancyIds?: unknown }).vacancyIds;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string" && typeof x !== "number") continue;
    const id = String(x).trim();
    if (!/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length > MAX_IDS) return null;
  }
  return out.length > 0 ? out : null;
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

  /** First chunk only: replace snapshot — drop cached rows before loading this save session. */
  if (replaceSnapshot) {
    let clearQuery = supabase.from("user_vacancy_details").delete().eq("user_id", user.id);
    if (hiddenIds.size > 0) {
      clearQuery = clearQuery.not("vacancy_id", "in", postgrestQuotedInList(hiddenIds));
    }
    const { error: clearError } = await clearQuery;
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      requested: requestedIds.length,
      saved: 0,
      skippedHidden,
      savedIds: [],
      failed: [],
      failedByStatus: {},
    });
  }

  const saved: string[] = [];
  const failed: { id: string; status: number; detail?: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
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
      skippedHidden,
      savedIds: saved,
      failed,
      failedByStatus,
    },
    { status: 200 },
  );
}
