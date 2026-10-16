import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import useDetailStore from "@/stores/detailStore";
import { TVShell, TVButton, Poster, Message, px, palette } from "./TVKit";
export default function TVDetail() {
  const { q, source, id, year } = useLocalSearchParams<{ q: string; source?: string; id?: string; year?: string }>();
  const router = useRouter();
  const store = useDetailStore();
  const [batch, setBatch] = useState(0),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (q) void store.init(q, source, id, year);
    return () => store.abort();
  }, [q, source, id, year, retry]);
  const d = store.detail;
  const sources = store.searchResults.filter((s) => !year || s.year === year);
  const episodes = d?.episodes || [];
  const play = (i: number) => {
    if (!d) return;
    store.abort();
    router.push({
      pathname: "/play",
      params: { q: d.title, source: d.source, id: String(d.id), episodeIndex: String(i) },
    });
  };
  return (
    <TVShell>
      <ScrollView contentContainerStyle={{ paddingHorizontal: px(58), paddingBottom: px(60) }}>
        <View style={{ flexDirection: "row", marginBottom: px(24) }}>
          <TVButton label="‹ 返回" onPress={() => router.back()} />
        </View>
        {store.loading ? (
          <ActivityIndicator color={palette.accent} size="large" />
        ) : store.error || !d ? (
          <Message text={store.error || "未找到可播放片源"} action="重新查找" onPress={() => setRetry((r) => r + 1)} />
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: px(42), marginBottom: px(32) }}>
              <Poster uri={d.poster} style={{ width: px(210), height: px(300), borderRadius: px(14) }} />
              <View style={{ flex: 1, paddingTop: px(8) }}>
                <Text style={{ fontSize: px(14), color: palette.accent, letterSpacing: px(2), marginBottom: px(14) }}>
                  ORION / 影片详情
                </Text>
                <Text style={{ fontSize: px(42), fontWeight: "700", color: palette.white, marginBottom: px(16) }}>
                  {d.title}
                </Text>
                <Text style={{ fontSize: px(18), color: palette.muted, marginBottom: px(18) }}>
                  {[d.year, d.type_name, episodes.length > 1 ? `${episodes.length} 集` : "正片"]
                    .filter(Boolean)
                    .join("  ·  ")}
                </Text>
                <Text
                  numberOfLines={4}
                  style={{ fontSize: px(18), lineHeight: px(29), color: "#c4cbd5", marginBottom: px(26) }}
                >
                  {d.desc?.replace(/<[^>]*>/g, "") || "暂无剧情简介"}
                </Text>
                <View style={{ flexDirection: "row", gap: px(14) }}>
                  {!!episodes.length && (
                    <TVButton
                      label="▶ 开始播放"
                      preferred
                      onPress={() => play(0)}
                      style={{ backgroundColor: palette.accent }}
                    />
                  )}
                  <TVButton
                    label={store.isFavorited ? "♥ 已收藏" : "♡ 加入收藏"}
                    onPress={() => {
                      void store.toggleFavorite();
                    }}
                  />
                </View>
              </View>
            </View>
            <Text style={{ fontSize: px(23), fontWeight: "600", color: palette.white, marginBottom: px(14) }}>
              播放来源{!store.allSourcesLoaded ? " · 正在查找更多片源…" : ""}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: px(12), paddingVertical: px(8) }}
            >
              {sources.map((s) => (
                <TVButton
                  key={`${s.source}-${s.id}`}
                  label={`${s.source_name} · ${s.episodes.length} 集`}
                  selected={d.source === s.source && d.id === s.id}
                  onPress={() => {
                    setBatch(0);
                    void store.setDetail(s);
                  }}
                />
              ))}
            </ScrollView>
            <Text
              style={{
                fontSize: px(23),
                fontWeight: "600",
                color: palette.white,
                marginTop: px(26),
                marginBottom: px(12),
              }}
            >
              选集
            </Text>
            {episodes.length > 30 && (
              <ScrollView horizontal contentContainerStyle={{ gap: px(10), paddingVertical: px(8) }}>
                {Array.from({ length: Math.ceil(episodes.length / 30) }, (_, i) => (
                  <TVButton
                    key={i}
                    label={`${i * 30 + 1}–${Math.min((i + 1) * 30, episodes.length)}`}
                    selected={batch === i}
                    onPress={() => setBatch(i)}
                  />
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: px(12), paddingVertical: px(12) }}>
              {episodes.slice(batch * 30, batch * 30 + 30).map((_, i) => (
                <TVButton
                  key={batch * 30 + i}
                  label={episodes.length === 1 ? "播放正片" : `第 ${batch * 30 + i + 1} 集`}
                  onPress={() => play(batch * 30 + i)}
                  style={{ minWidth: px(126) }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </TVShell>
  );
}
