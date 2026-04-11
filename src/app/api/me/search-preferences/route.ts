import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateFiltersPayload } from "@/lib/hh/vacancySearchPreferences";
import { NextResponse } from "next/server";

async function getSupabaseOr503() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

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
    return NextResponse.json({ filters: null }, { status: 200 });
  }

  const { data, error } = await supabase
    .from("user_search_preferences")
    .select("filters")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filters = data?.filters;
  if (
    filters == null ||
    (typeof filters === "object" && !Array.isArray(filters) && Object.keys(filters as object).length === 0)
  ) {
    return NextResponse.json({ filters: null }, { status: 200 });
  }

  return NextResponse.json({ filters }, { status: 200 });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateFiltersPayload(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
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

  const { error } = await supabase.from("user_search_preferences").upsert(
    {
      user_id: user.id,
      filters: validated.filters,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
