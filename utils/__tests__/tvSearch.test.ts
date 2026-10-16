import { groupResults, filterResults } from "../tvSearch";
import type { SearchResult } from "../../services/api";
const film = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  id: 1,
  title: "三体",
  poster: "",
  episodes: ["episode"],
  source: "a",
  source_name: "A",
  year: "2023",
  type_name: "国产剧",
  ...overrides,
});
test("merges duplicate works across sources without merging seasons or release years", () => {
  const groups = groupResults([
    film(),
    film({ source: "b" }),
    film({ title: "三体 第二季" }),
    film({ year: "2024" }),
    film(),
  ]);
  expect(groups).toHaveLength(3);
  expect(groups[0].sources).toHaveLength(2);
});
test("filters by provided kind and year and ranks exact titles first", () => {
  const groups = groupResults([film({ title: "三体 解说", type_name: "纪录片" }), film(), film({ year: "2024" })]);
  expect(filterResults(groups, "电视剧", "2023", "匹配优先", "三体")).toHaveLength(1);
  expect(filterResults(groups, "全部", "全部年份", "匹配优先", "三体")[0].film.title).toBe("三体");
  expect(filterResults(groups, "全部", "全部年份", "年份优先", "三体")[0].film.year).toBe("2024");
});
test("keeps different media types separate and handles missing metadata", () => {
  expect(groupResults([film(), film({ type_name: "动画" }), film({ year: "", type_name: undefined })])).toHaveLength(3);
  expect(filterResults([], "全部", "全部年份", "匹配优先", "")).toEqual([]);
});
