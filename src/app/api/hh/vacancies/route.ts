import {
  adaptShardVacancySearchResponse,
  shardVacancySearchPath,
  type ShardSearchJson,
} from "@/lib/hh/shardVacancySearch";
import { buildVacancySearchParams } from "@/lib/hh/vacancyQuery";
import type { VacancySearchPayload } from "@/lib/hh/vacancySearchTypes";
import { hhShardFetch } from "@/lib/hh/serverFetch";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let payload: VacancySearchPayload;
  try {
    payload = (await req.json()) as VacancySearchPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const salary = payload.salary;
  const hasSalary =
    salary != null && !Number.isNaN(Number(salary)) && String(salary).trim() !== "";
  if (hasSalary && !payload.currency_code?.trim()) {
    return NextResponse.json(
      { error: "Укажите валюту для фильтра по зарплате" },
      { status: 400 },
    );
  }

  const params = buildVacancySearchParams(payload);
  const page = Math.max(0, payload.page ?? 0);
  const perPage = Math.min(100, Math.max(1, payload.perPage ?? 50));

  const res = await hhShardFetch(shardVacancySearchPath(params), { cache: "no-store" });
  if (!res.ok) {
    const errText = await res.text();
    let errBody: { error?: string } = { error: `hh.ru shard search failed (${res.status})` };
    try {
      const parsed = JSON.parse(errText) as { error?: string; message?: string };
      if (typeof parsed.error === "string") errBody = { error: parsed.error };
      else if (typeof parsed.message === "string") errBody = { error: parsed.message };
    } catch {
      if (errText.trim()) errBody = { error: errText.slice(0, 500) };
    }
    return NextResponse.json(errBody, { status: res.status });
  }

  let shardJson: ShardSearchJson;
  try {
    shardJson = (await res.json()) as ShardSearchJson;
  } catch {
    return NextResponse.json({ error: "Invalid JSON from hh.ru shard" }, { status: 502 });
  }

  const list = adaptShardVacancySearchResponse(shardJson, page, perPage);
  return NextResponse.json(list);
}
