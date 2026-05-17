import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getSupabaseOr503() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

function parseVacancyId(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  if (!/^\d+$/.test(id)) return null;
  return id;
}

/** GET — all hidden vacancy ids for the signed-in user. */
export async function GET() {
  const supabase = await getSupabaseOr503();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ vacancyIds: [] }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("user_hidden_vacancies")
    .select("vacancy_id")
    .eq("user_id", user.id)
    .order("hidden_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const vacancyIds = (data ?? []).map((row) => row.vacancy_id as string);
  return NextResponse.json({ vacancyIds }, { status: 200 });
}

/** POST — hide a vacancy ({ vacancyId }). */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vacancyId = parseVacancyId((body as { vacancyId?: unknown })?.vacancyId);
  if (!vacancyId) {
    return NextResponse.json({ error: "vacancyId must be a numeric string" }, { status: 400 });
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

  const { error } = await supabase.from("user_hidden_vacancies").upsert(
    {
      user_id: user.id,
      vacancy_id: vacancyId,
      hidden_at: new Date().toISOString(),
    },
    { onConflict: "user_id,vacancy_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, vacancyId }, { status: 200 });
}

/** DELETE — restore a vacancy (?vacancyId=). */
export async function DELETE(req: Request) {
  const vacancyId = parseVacancyId(new URL(req.url).searchParams.get("vacancyId"));
  if (!vacancyId) {
    return NextResponse.json({ error: "vacancyId query param required" }, { status: 400 });
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

  const { error } = await supabase
    .from("user_hidden_vacancies")
    .delete()
    .eq("user_id", user.id)
    .eq("vacancy_id", vacancyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, vacancyId }, { status: 200 });
}
