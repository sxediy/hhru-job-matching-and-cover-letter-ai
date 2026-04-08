import areaPresetIds from "@/data/area-preset-ids.json";
import { directChildren, type HhAreaNode } from "@/lib/areas/flatten";
import { hhFetch } from "@/lib/hh/serverFetch";
import { NextResponse } from "next/server";

type AreasPayload = {
  roots: HhAreaNode[];
  otherRegions: HhAreaNode | null;
  russia: HhAreaNode | null;
  presetIds: typeof areaPresetIds;
};

export async function GET() {
  const res = await hhFetch("/areas", { cache: "no-store" });
  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to load /areas", status: res.status },
      { status: 502 },
    );
  }
  const roots = (await res.json()) as HhAreaNode[];
  const other = roots.find((r) => r.id === "1001") ?? null;
  const russia = roots.find((r) => r.id === "113") ?? null;
  const ruSubjects = russia ? directChildren(russia) : [];
  const payload: AreasPayload = {
    roots,
    otherRegions: other,
    russia: russia
      ? { id: russia.id, name: russia.name, areas: ruSubjects }
      : null,
    presetIds: areaPresetIds,
  };
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
