export type HhAreaNode = {
  id: string;
  name: string;
  areas?: HhAreaNode[];
};

export function flattenAreas(nodes: HhAreaNode[]): Map<string, { id: string; name: string }> {
  const map = new Map<string, { id: string; name: string }>();
  const walk = (list: HhAreaNode[]) => {
    for (const n of list) {
      map.set(n.id, { id: n.id, name: n.name });
      if (n.areas?.length) walk(n.areas);
    }
  };
  walk(nodes);
  return map;
}

/** Прямые дети узла (для субъектов РФ). */
export function directChildren(root: HhAreaNode): HhAreaNode[] {
  return root.areas ?? [];
}
