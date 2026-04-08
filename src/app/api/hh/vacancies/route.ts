import { buildVacancySearchParams } from "@/lib/hh/vacancyQuery";
import type { VacancySearchPayload } from "@/lib/hh/vacancySearchTypes";
import { hhFetch } from "@/lib/hh/serverFetch";
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
  if (hasSalary && !payload.currency?.trim()) {
    return NextResponse.json(
      { error: "Укажите валюту для фильтра по зарплате" },
      { status: 400 },
    );
  }

  const params = buildVacancySearchParams(payload);
  const qs = params.toString();
  const res = await hhFetch(`/vacancies?${qs}`, { cache: "no-store" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
