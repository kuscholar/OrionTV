import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, ActivityIndicator, TVFocusGuideView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/services/api";
import { PlayRecordManager } from "@/services/storage";
import { useSettingsStore } from "@/stores/settingsStore";
import useAuthStore from "@/stores/authStore";
import { TVShell, TVButton, Hero, Rail, Message, TVPoster, Film, px, palette, k } from "./TVKit";
export const channels = [
  { name: "精选", type: "movie", tags: ["热门"] },
  {
    name: "电影",
    type: "movie",
    tags: ["热门", "最新", "豆瓣高分", "华语", "欧美", "动作", "喜剧", "爱情", "科幻", "悬疑"],
  },
  { name: "电视剧", type: "tv", tags: ["热门", "国产剧", "美剧", "英剧", "韩剧", "日剧", "港剧"] },
  { name: "综艺", type: "tv", tags: ["综艺"] },
  { name: "动漫", type: "tv", tags: ["日本动画", "动画"] },
  { name: "纪录片", type: "tv", tags: ["纪录片"] },
] as const;
export default function TVHome() {
  const router = useRouter();
  const generation = useRef(0);
  const base = useSettingsStore((s) => s.apiBaseUrl);
  const logged = useAuthStore((s) => s.isLoggedIn);
  const [channel, setChannel] = useState(0),
    [tag, setTag] = useState("热门"),
    [items, setItems] = useState<Film[]>([]),
    [rails, setRails] = useState<{ title: string; items: Film[] }[]>([]),
    [records, setRecords] = useState<Film[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [retry, setRetry] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (logged)
        PlayRecordManager.getAll()
          .then((data) => {
            if (alive)
              setRecords(
                Object.entries(data)
                  .sort((a, b) => b[1].save_time - a[1].save_time)
                  .map(([key, r]) => ({
                    title: r.title,
                    poster: r.cover,
                    source: key.split("+")[0],
                    id: key.split("+")[1],
                    progress: r.total_time ? r.play_time / r.total_time : 0,
                    episodeIndex: r.index,
                    playTime: r.play_time,
                  })),
              );
          })
          .catch(() => {});
      return () => {
        alive = false;
      };
    }, [logged]),
  );
  useEffect(() => {
    if (!base) return;
    let alive = true;
    ++generation.current;
    setLoading(true);
    setError("");
    setItems([]);
    setPage(0);
    setMore(false);
    (async () => {
      try {
        const c = channels[channel];
        const result = await api.getDoubanData(c.type, tag, 24, 0);
        if (!alive) return;
        setItems(result.list);
        setPage(result.list.length);
        setMore(result.list.length === 24);
        if (channel === 0) {
          const extra = await Promise.allSettled([
            api.getDoubanData("tv", "热门", 12),
            api.getDoubanData("movie", "豆瓣高分", 12),
          ]);
          if (alive)
            setRails(
              extra.flatMap((r, i) =>
                r.status === "fulfilled" ? [{ title: i === 0 ? "热播剧集" : "高分电影", items: r.value.list }] : [],
              ),
            );
        }
      } catch (e) {
        if (alive) setError("暂时无法加载片单，请检查网络或服务器设置。");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      ++generation.current;
    };
  }, [base, logged, channel, tag, retry]);
  const loadMore = async () => {
    if (loading) return;
    setLoading(true);
    const current = generation.current;
    try {
      const r = await api.getDoubanData(channels[channel].type, tag, 24, page);
      if (current !== generation.current) return;
      setItems((old) => [...old, ...r.list]);
      setPage(page + r.list.length);
      setMore(r.list.length === 24);
    } catch {
      if (current === generation.current) setError("加载更多失败，请重试");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  return (
    <TVShell active="首页">
      <View
        style={{ flexDirection: "row", gap: px(12), paddingHorizontal: px(52), paddingBottom: px(12) }}
      >
        {channels.map((c, i) => (
          <TVButton
            toHeader
            key={c.name}
            label={c.name}
            selected={channel === i}
            onPress={() => {
              setChannel(i);
              setTag(c.tags[0]);
            }}
          />
        ))}
        <TVButton toHeader label="直播" onPress={() => router.push("/live")} />
      </View>
      {channel > 0 && (
        <ScrollView
          horizontal
          style={{ maxHeight: px(62) }}
          contentContainerStyle={{ paddingHorizontal: px(52), gap: px(10), paddingVertical: px(6) }}
          showsHorizontalScrollIndicator={false}
        >
          {channels[channel].tags.map((t) => (
            <TVButton key={t} label={t} selected={tag === t} onPress={() => setTag(t)} />
          ))}
        </ScrollView>
      )}
      {!base ? (
        <Message text="连接 MoonTV，开始你的客厅影院" action="配置服务器" onPress={() => router.push("/settings")} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: px(60) }}>
          {channel === 0 && <Hero film={items[0]} />}
          {!!error && <View><Message text={error} action="重试" onPress={() => setRetry((n) => n + 1)} /><View style={{alignItems: "center", marginBottom: px(24)}}><TVButton label="服务器设置" onPress={() => router.push("/settings")} /></View></View>}
          {channel === 0 ? (
            <>
              <Rail title="继续观看" items={records} />
              <Rail title="热门电影" items={items} />
              {rails.map((r) => (
                <Rail key={r.title} {...r} />
              ))}
            </>
          ) : (
            <>
              <Text style={[k.section, { marginTop: px(16) }]}>
                {channels[channel].name} · {tag}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: px(18),
                  paddingHorizontal: px(52),
                  paddingVertical: px(16),
                }}
              >
                {items.map((f, i) => (
                  <TVPoster key={`${f.title}-${i}`} film={f} />
                ))}
              </View>
              {more && (
                <View style={{ alignItems: "center" }}>
                  <TVButton label={loading ? "加载中…" : "加载更多"} onPress={loadMore} />
                </View>
              )}
            </>
          )}
          {loading && <ActivityIndicator color={palette.accent} size="large" style={{ padding: px(30) }} />}
          {!loading && !error && !items.length && <Message text="这个分类暂时没有内容" />}
        </ScrollView>
      )}
    </TVShell>
  );
}
