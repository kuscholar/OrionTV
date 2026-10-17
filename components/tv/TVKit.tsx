import React, { useState, useRef, useContext, createContext } from "react";
import { View, Text, Pressable, Image, StyleSheet, Dimensions, ScrollView, TVFocusGuideView, findNodeHandle } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/services/api";

export const unit = Dimensions.get("window").width / 1280;
export const px = (n: number) => n * unit;
export const palette = { bg: "#101319", panel: "#1d222b", muted: "#a2aab8", white: "#f5f6f8", accent: "#ff934f" };
const NavigationContext = createContext<{
  headerTarget?: number; returnTarget?: number;
  setHeaderTarget: (tag: number) => void; setReturnTarget: (tag: number) => void;
}>({ setHeaderTarget: () => {}, setReturnTarget: () => {} });

export function TVButton({
  label,
  onPress,
  selected = false,
  preferred = false,
  style,
  onFocus,
  toHeader = false,
  header = false,
  headerEntry = false,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  preferred?: boolean;
  style?: any;
  onFocus?: () => void;
  toHeader?: boolean;
  header?: boolean;
  headerEntry?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const buttonRef = useRef<View>(null);
  const nav = useContext(NavigationContext);
  return (
    <Pressable
      ref={buttonRef}
      onLayout={() => {
        const tag = findNodeHandle(buttonRef.current);
        if (headerEntry && tag != null) nav.setHeaderTarget(tag);
      }}
      nextFocusUp={toHeader ? nav.headerTarget : undefined}
      nextFocusDown={header ? nav.returnTarget : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hasTVPreferredFocus={preferred}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        const tag = findNodeHandle(buttonRef.current);
        if (toHeader && tag != null) nav.setReturnTarget(tag);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      style={() => [k.button, selected && k.selected, style, focused && k.focus]}
    >
      <Text style={[k.buttonText, selected && { color: palette.accent }, focused && { color: "#101319" }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function TVShell({ children, active = "" }: { children: React.ReactNode; active?: string }) {
  const router = useRouter();
  const [headerTarget, setHeaderTarget] = useState<number>();
  const [returnTarget, setReturnTarget] = useState<number>();
  return (
    <NavigationContext.Provider value={{headerTarget, returnTarget, setHeaderTarget, setReturnTarget}}>
    <View style={k.screen}>
      <View style={k.header}>
        <View style={k.brand}>
          <Text style={k.mark}>O</Text>
          <Text style={k.brandText}>
            ORION<Text style={{ color: palette.muted }}> TV</Text>
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={k.nav}>
          {[
            ["首页", "/"],
            ["搜索", "/search"],
            ["收藏", "/favorites"],
            ["设置", "/settings"],
          ].map(([label, path]) => (
            <TVButton
              key={label}
              header
              headerEntry={label === "首页"}
              label={label}
              selected={label === active}
              onPress={() => label !== active && router.push(path as any)}
            />
          ))}
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
    </NavigationContext.Provider>
  );
}
export function Poster({ uri, style }: { uri?: string; style?: any }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[{ backgroundColor: "#282e39", overflow: "hidden" }, style]}>
      <Text style={k.placeholder}>ORION</Text>
      {!!uri && !failed && (
        <Image
          source={{ uri: api.getImageProxyUrl(uri) }}
          onError={() => setFailed(true)}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
    </View>
  );
}
export type Film = {
  title: string;
  poster: string;
  year?: string;
  rate?: string;
  source?: string;
  id?: string | number;
  progress?: number;
  episodeIndex?: number;
  playTime?: number;
};
export function openFilm(router: ReturnType<typeof useRouter>, film: Film) {
  if (film.progress !== undefined && film.episodeIndex !== undefined)
    router.push({
      pathname: "/play",
      params: {
        source: film.source,
        id: String(film.id),
        episodeIndex: String(Math.max(0, film.episodeIndex - 1)),
        title: film.title,
        position: String((film.playTime || 0) * 1000),
      },
    });
  else
    router.push({
      pathname: "/detail",
      params: {
        q: film.title,
        ...(film.source && film.source !== "douban" ? { source: film.source, id: String(film.id) } : {}),
      },
    });
}
export function TVPoster({ film, onFocus }: { film: Film; onFocus?: () => void }) {
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={film.title}
      onPress={() => openFilm(router, film)}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => setFocused(false)}
      style={() => [k.card, focused && k.cardFocus]}
    >
      <Poster uri={film.poster} style={k.poster} />
      {film.rate && (
        <View style={k.rating}>
          <Text style={k.ratingText}>{film.rate}</Text>
        </View>
      )}
      {film.progress !== undefined && (
        <View style={k.progress}>
          <View
            style={{
              height: "100%",
              width: `${Math.min(100, Math.max(0, film.progress * 100))}%`,
              backgroundColor: palette.accent,
            }}
          />
        </View>
      )}
      <Text numberOfLines={1} style={k.cardTitle}>
        {film.title}
      </Text>
      <Text style={k.caption}>{film.progress !== undefined ? "继续观看" : film.year || "查看片源与选集"}</Text>
    </Pressable>
  );
}
export function Rail({ title, items }: { title: string; items: Film[] }) {
  if (!items.length) return null;
  return (
    <View style={{ marginBottom: px(20) }}>
      <Text style={k.section}>{title}</Text>
      <TVFocusGuideView autoFocus>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={k.rail}>
          {items.map((film, i) => (
            <TVPoster key={`${film.title}-${film.source}-${i}`} film={film} />
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  );
}
export function Hero({ film }: { film?: Film }) {
  const router = useRouter();
  return (
    <View style={k.hero}>
      {film && <Poster uri={film.poster} style={k.heroArt} />}
      <LinearGradient
        colors={["#202d3e", "#182331dd", "#10131900"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient colors={["#10131900", "#101319"]} style={StyleSheet.absoluteFill} />
      <View style={k.heroCopy}>
        <Text style={k.eyebrow}>ORION 精选 · 今晚看点什么</Text>
        <Text numberOfLines={2} style={k.heroTitle}>
          {film?.title || "把好故事，带回客厅"}
        </Text>
        <Text style={k.heroSub}>
          {film
            ? `${film.rate ? "豆瓣 " + film.rate + "  ·  " : ""}热门推荐  /  多片源搜索`
            : "电影、剧集与值得收藏的每一刻"}
        </Text>
        <View style={{ flexDirection: "row", gap: px(12) }}>
          <TVButton
            label={film ? "查看详情  ›" : "开始搜索  ›"}
            preferred
            onPress={() => (film ? openFilm(router, film) : router.push("/search"))}
            style={{ backgroundColor: palette.accent }}
          />
        </View>
      </View>
    </View>
  );
}
export function Message({ text, action, onPress }: { text: string; action?: string; onPress?: () => void }) {
  return (
    <View style={k.message}>
      <Text style={k.messageText}>{text}</Text>
      {action && onPress && <TVButton label={action} onPress={onPress} />}
    </View>
  );
}
export const k = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  header: { height: px(88), paddingHorizontal: px(52), flexDirection: "row", alignItems: "center", gap: px(12) },
  brand: { flexDirection: "row", alignItems: "center", gap: px(12) },
  mark: { fontSize: px(26), fontWeight: "800", color: palette.accent },
  brandText: { fontSize: px(19), letterSpacing: px(3), fontWeight: "700", color: palette.white },
  nav: { flexDirection: "row", gap: px(8) },
  button: {
    minHeight: px(44),
    paddingHorizontal: px(20),
    paddingVertical: px(10),
    borderRadius: px(10),
    borderWidth: px(2),
    borderColor: "transparent",
    backgroundColor: palette.panel,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { fontSize: px(18), fontWeight: "600", color: palette.white },
  selected: { backgroundColor: "#332920" },
  focus: { backgroundColor: palette.white, borderColor: palette.white, transform: [{ scale: 1.035 }] },
  section: { fontSize: px(23), fontWeight: "600", color: palette.white, marginHorizontal: px(52), marginBottom: px(6) },
  rail: { paddingHorizontal: px(52), paddingVertical: px(14), gap: px(18) },
  card: { width: px(172), borderWidth: px(3), borderColor: "transparent", borderRadius: px(12), padding: px(3) },
  cardFocus: { borderColor: palette.white, backgroundColor: "#303846", transform: [{ scale: 1.035 }] },
  poster: { height: px(224), borderRadius: px(7) },
  cardTitle: { fontSize: px(18), fontWeight: "600", color: palette.white, marginTop: px(12) },
  caption: { fontSize: px(13), color: palette.muted, marginTop: px(6) },
  placeholder: { color: "#788598", fontWeight: "700", letterSpacing: px(4), textAlign: "center", marginTop: px(40) },
  rating: {
    position: "absolute",
    top: px(15),
    right: px(14),
    padding: px(5),
    backgroundColor: "#101319dd",
    borderRadius: px(5),
  },
  ratingText: { fontSize: px(14), color: "#ffd39a", fontWeight: "700" },
  progress: { height: px(4), backgroundColor: "#4b5360" },
  hero: { height: px(305), marginBottom: px(12), overflow: "hidden" },
  heroArt: { position: "absolute", right: px(52), width: px(520), height: px(400), top: -px(50), borderRadius: px(18) },
  heroCopy: { paddingLeft: px(58), paddingTop: px(28), width: px(700) },
  eyebrow: { fontSize: px(14), color: palette.accent, letterSpacing: px(2), marginBottom: px(18) },
  heroTitle: { fontSize: px(42), fontWeight: "700", color: palette.white, lineHeight: px(54) },
  heroSub: { fontSize: px(17), color: "#bec6d1", marginTop: px(12), marginBottom: px(22) },
  message: { padding: px(48), alignItems: "center", gap: px(20) },
  messageText: { fontSize: px(22), color: palette.muted, textAlign: "center" },
});
