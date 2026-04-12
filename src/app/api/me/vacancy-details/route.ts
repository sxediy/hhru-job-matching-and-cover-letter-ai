import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hhFetch } from "@/lib/hh/serverFetch";
import { NextResponse } from "next/server";

const MAX_IDS = 100;
const MAX_SEARCH_FOUND_FOR_CACHE = 400;
const BETWEEN_MS = 120;

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

  const searchFoundRaw = (body as { searchFound?: unknown }).searchFound;
  if (searchFoundRaw !== undefined) {
    if (typeof searchFoundRaw !== "number" || !Number.isFinite(searchFoundRaw) || searchFoundRaw < 0) {
      return NextResponse.json({ error: "Invalid searchFound" }, { status: 400 });
    }
    if (searchFoundRaw > MAX_SEARCH_FOUND_FOR_CACHE) {
      return NextResponse.json(
        { error: "Too many results for this action. Need no more than 400." },
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

  /** Replace snapshot: drop this user’s cached vacancy rows before loading the new batch. */
  const { error: clearError } = await supabase.from("user_vacancy_details").delete().eq("user_id", user.id);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 });
  }

  const saved: string[] = [];
  const failed: { id: string; status: number; detail?: string }[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (i > 0) await sleep(BETWEEN_MS);

    let res: Response;
    try {
      res = await hhFetch(`/vacancies/${id}`, { cache: "no-store" });
    } catch (e) {
      failed.push({
        id,
        status: 0,
        detail: e instanceof Error ? e.message : "fetch failed",
      });
      continue;
    }

    if (!res.ok) {
      let detail: string | undefined;
      try {
        const errBody = (await res.json()) as { description?: string; errors?: unknown };
        if (typeof errBody?.description === "string") detail = errBody.description;
      } catch {
        /* ignore */
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

  return NextResponse.json(
    {
      ok: true,
      requested: ids.length,
      saved: saved.length,
      savedIds: saved,
      failed,
    },
    { status: 200 },
  );
}
