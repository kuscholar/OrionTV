import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, ScrollView, Keyboard, ActivityIndicator, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { api, SearchResult } from "@/services/api";
import { groupResults, filterResults } from "@/utils/tvSearch";
import { TVShell, TVButton, Poster, Message, px, palette, k } from "./TVKit";
function Result({ group }: { group: ReturnType<typeof groupResults>[number] }) {
  const router = useRouter(),
    [focused, setFocused] = useState(false);
  const f = group.film;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${f.title}，${f.year}，${group.sources.length}个片源`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={() =>
        router.push({ pathname: "/detail", params: { q: f.title, source: f.source, id: String(f.id), year: f.year } })
      }
      style={() => ({
        width: px(552),
        minHeight: px(200),
        padding: px(16),
        borderRadius: px(14),
        borderWidth: px(3),
        borderColor: focused ? palette.white : "transparent",
        backgroundColor: focused ? "#303947" : palette.panel,
        flexDirection: "row",
        gap: px(22),
      })}
    >
      <Poster uri={f.poster} style={{ width: px(108), height: px(155), borderRadius: px(8) }} />
      <View style={{ flex: 1, justifyContent: "center", gap: px(12) }}>
        <Text numberOfLines={2} style={{ fontSize: px(24), fontWeight: "600", color: palette.white }}>
          {f.title}
        </Text>
        <Text style={{ fontSize: px(16), color: palette.accent }}>
          {[f.year, group.kind, `${group.sources.length} 个片源`].filter(Boolean).join("  ·  ")}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: px(15), lineHeight: px(23), color: palette.muted }}>
          {f.desc?.replace(/<[^>]*>/g, "") ||
            `${f.episodes.length > 1 ? "共 " + f.episodes.length + " 集" : "查看详情"} · 选择片源后播放`}
        </Text>
      </View>
    </Pressable>
  );
}
export default function TVSearch() {
  const [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState(""),
    [results, setResults] = useState<SearchResult[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<string[]>([]),
    [kind, setKind] = useState("全部"),
    [year, setYear] = useState("全部年份"),
    [sort, setSort] = useState("匹配优先"),
    [focus, setFocus] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    AsyncStorage.getItem("tv.searchHistory")
      .then((v) => {
        if (v) setHistory(JSON.parse(v));
      })
      .catch(() => {});
    return () => {
      request.current++;
    };
  }, []);
  const search = async (term = query) => {
    const q = term.trim();
    if (!q) return;
    Keyboard.dismiss();
    setQuery(q);
    setSubmitted(q);
    setResults([]);
    setKind("全部");
    setYear("全部年份");
    setError("");
    setLoading(true);
    const id = ++request.current;
    const next = [q, ...history.filter((h) => h !== q)].slice(0, 8);
    setHistory(next);
    void AsyncStorage.setItem("tv.searchHistory", JSON.stringify(next)).catch(() => {});
    try {
      const r = await api.searchVideos(q);
      if (id === request.current) setResults(r.results);
    } catch {
      if (id === request.current) setError("搜索失败，请检查连接后重试。");
    } finally {
      if (id === request.current) setLoading(false);
    }
  };
  const groups = groupResults(results),
    filtered = filterResults(groups, kind, year, sort, submitted);
  const kinds = ["全部", ...new Set(groups.map((g) => g.kind))],
    years = [
      "全部年份",
      ...new Set(
        results
          .map((r) => r.year)
          .filter(Boolean)
          .sort()
          .reverse(),
      ),
    ];
  return (
    <TVShell active="搜索">
      <View style={{ paddingHorizontal: px(52), paddingTop: px(12), paddingBottom: px(18) }}>
        <Text style={{ fontSize: px(34), fontWeight: "600", color: palette.white, marginBottom: px(8) }}>
          找到你想看的
        </Text>
        <Text style={{ fontSize: px(16), color: palette.muted, marginBottom: px(20) }}>
          搜索片名，集中比较片源，选好再播放
        </Text>
        <View style={{ flexDirection: "row", gap: px(14) }}>
          <TextInput
            accessibilityLabel="搜索片名"
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onSubmitEditing={() => search()}
            returnKeyType="search"
            placeholder="输入电影、电视剧或动漫名称"
            placeholderTextColor="#919bab"
            style={{
              flex: 1,
              color: palette.white,
              fontSize: px(22),
              height: px(58),
              paddingHorizontal: px(20),
              borderRadius: px(12),
              backgroundColor: palette.panel,
              borderWidth: px(3),
              borderColor: focus ? palette.white : "transparent",
            }}
          />
          <TVButton label="搜索" onPress={() => search()} />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: px(52), paddingBottom: px(50) }}
        showsVerticalScrollIndicator={false}
      >
        {!submitted && (
          <>
            <Text style={[k.section, { marginHorizontal: 0, marginTop: px(20) }]}>最近搜索</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: px(12), marginTop: px(16) }}>
              {history.map((h) => (
                <TVButton key={h} label={h} onPress={() => search(h)} />
              ))}
              {!!history.length && (
                <TVButton
                  label="清空历史"
                  onPress={() => {
                    setHistory([]);
                    void AsyncStorage.removeItem("tv.searchHistory");
                  }}
                />
              )}
            </View>
            {!history.length && <Message text="输入片名开始搜索。也可以使用 iPhone 的 Apple TV 键盘。" />}
          </>
        )}
        {loading ? (
          <ActivityIndicator size="large" color={palette.accent} style={{ marginTop: px(65) }} />
        ) : error ? (
          <Message text={error} action="重试搜索" onPress={() => search(submitted)} />
        ) : (
          submitted && (
            <>
              <View style={{ flexDirection: "row", gap: px(10), flexWrap: "wrap", paddingVertical: px(10) }}>
                {kinds.map((t) => (
                  <TVButton key={t} label={t} selected={kind === t} onPress={() => setKind(t)} />
                ))}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: px(10), paddingVertical: px(10) }}
              >
                {years.map((t) => (
                  <TVButton key={t} label={t} selected={year === t} onPress={() => setYear(t)} />
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", alignItems: "center", marginVertical: px(16), gap: px(12) }}>
                <Text style={{ flex: 1, fontSize: px(18), color: palette.muted }}>
                  “{submitted}” · {filtered.length} 部作品 / {results.length} 条片源结果
                </Text>
                <TVButton label={sort} onPress={() => setSort(sort === "匹配优先" ? "年份优先" : "匹配优先")} />
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: px(20) }}>
                {filtered.map((g) => (
                  <Result key={g.key} group={g} />
                ))}
              </View>
              {!filtered.length && (
                <Message
                  text={
                    groups.length ? "没有符合筛选条件的作品，请切换分类或年份。" : "没有找到相关内容，换个片名试试。"
                  }
                />
              )}
            </>
          )
        )}
      </ScrollView>
    </TVShell>
  );
}
