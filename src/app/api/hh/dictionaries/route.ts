import { hhFetch } from "@/lib/hh/serverFetch";
import { NextResponse } from "next/server";

export async function GET() {
  const res = await hhFetch("/dictionaries", { cache: "force-cache" });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
