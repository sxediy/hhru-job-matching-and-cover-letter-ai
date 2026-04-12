import { HH_VACANCY_SEARCH_MAX_FOUND_FOR_HEAVY_ACTIONS } from "@/lib/hh/hhVacancySearchMaxFoundForHeavyActions";
import { VACANCY_DETAILS_SAVE_MAX_IDS_PER_REQUEST } from "@/lib/me/vacancyDetailsSaveChunk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hhFetch } from "@/lib/hh/serverFetch";
import { NextResponse } from "next/server";

/** Allow long sequential HH fetches (host may still cap below this). */
export const maxDuration = 180;

const MAX_IDS = VACANCY_DETAILS_SAVE_MAX_IDS_PER_REQUEST;
/** ~1.3 req/s to api.hh.ru — going faster tends to produce 429 on /vacancies/:id chains. */
const BETWEEN_MS = 750;
const HH_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const HH_FETCH_MAX_ATTEMPTS = 7;

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

/** GET /vacancies/:id with retries on rate limit / transient HH errors. */
async function hhFetchVacancyWithRetries(id: string): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt < HH_FETCH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(22_000, 900 * 2 ** (attempt - 1));
      await sleep(backoff);
    }
    let res: Response;
    try {
      res = await hhFetch(`/vacancies/${id}`, { cache: "no-store" });
    } catch {
      last = undefined;
      continue;
    }
    if (res.ok) return res;
    if (!HH_RETRYABLE_STATUS.has(res.status)) return res;
    await res.text().catch(() => {});
    last = res;
    if (res.status === 429) {
      const ra = res.headers.get("Retry-After");
      const sec = parseInt(ra ?? "", 10);
      const fromHeader = Number.isFinite(sec) && sec > 0 && sec <= 180 ? sec * 1000 : 0;
      await sleep(Math.max(3200, fromHeader));
    }
  }
  return (
    last ??
    new Response(JSON.stringify({ description: "HH unreachable after retries" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })
  );
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

/** POST — fetch each vacancy from HH API and upsert JSON into user_vacancy_details. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = parseVacancyIds(body);
  if (!ids) {
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

  /** First chunk only: replace snapshot — drop cached rows before loading this save session. */
  if (replaceSnapshot) {
    const { error: clearError } = await supabase.from("user_vacancy_details").delete().eq("user_id", user.id);
    if (clearError) {
      return NextResponse.json({ error: clearError.message }, { status: 500 });
    }
  }

  const saved: string[] = [];
  const failed: { id: string; status: number; detail?: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (i > 0) await sleep(BETWEEN_MS);

    const res = await hhFetchVacancyWithRetries(id);

    if (!res.ok) {
      let detail: string | undefined;
      try {
        const errBody = (await res.json()) as { description?: string; errors?: unknown };
        if (typeof errBody?.description === "string") detail = errBody.description;
      } catch {
        if (res.status === 429) detail = "Too many requests";
      }
      failed.push({ id, status: res.status, detail });
      continue;
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      failed.push({ id, status: res.status, detail: "Invalid JSON from HH" });
      continue;
    }

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
      requested: ids.length,
      saved: saved.length,
      savedIds: saved,
      failed,
      failedByStatus,
    },
    { status: 200 },
  );
}
