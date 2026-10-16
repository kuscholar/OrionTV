import type { SearchResult } from "../services/api";
export function mediaKind(item: SearchResult): string {
  const type = item.type_name || item.class || "";
  if (/动漫|动画/.test(type)) return "动漫";
  if (/综艺/.test(type)) return "综艺";
  if (/纪录/.test(type)) return "纪录片";
  if (/剧|电视/.test(type)) return "电视剧";
  if (/电影|片/.test(type)) return "电影";
  return "其他";
}
export function groupResults(items: SearchResult[]) {
  const groups = new Map<string, { key: string; film: SearchResult; sources: SearchResult[]; kind: string }>();
  for (const item of items) {
    // Keep editions, seasons and unknown years distinct; only merge known matching works.
    const title = item.title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const key = JSON.stringify([title, item.year || "", mediaKind(item)]);
    const group = groups.get(key);
    if (group) {
      if (!group.sources.some((s) => s.source === item.source && String(s.id) === String(item.id)))
        group.sources.push(item);
    } else groups.set(key, { key, film: item, sources: [item], kind: mediaKind(item) });
  }
  return [...groups.values()];
}
export function filterResults(
  groups: ReturnType<typeof groupResults>,
  kind: string,
  year: string,
  sort: string,
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase();
  return groups
    .filter((g) => (kind === "全部" || g.kind === kind) && (year === "全部年份" || g.film.year === year))
    .sort((a, b) =>
      sort === "年份优先"
        ? (Number(b.film.year) || 0) - (Number(a.film.year) || 0)
        : Number(b.film.title.trim().toLocaleLowerCase() === normalized) -
          Number(a.film.title.trim().toLocaleLowerCase() === normalized),
    );
}
