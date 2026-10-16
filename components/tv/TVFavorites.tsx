import React, { useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import useFavoritesStore from "@/stores/favoritesStore";
import { TVShell, TVPoster, Message, px, palette } from "./TVKit";
export default function TVFavorites() {
  const { favorites, loading, error, fetchFavorites } = useFavoritesStore();
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void fetchFavorites();
    }, [fetchFavorites]),
  );
  return (
    <TVShell active="收藏">
      <Text
        style={{
          fontSize: px(34),
          color: palette.white,
          fontWeight: "600",
          marginHorizontal: px(58),
          marginVertical: px(20),
        }}
      >
        留给下次的好故事
      </Text>
      {loading ? (
        <ActivityIndicator color={palette.accent} size="large" />
      ) : error ? (
        <Message text="收藏加载失败" action="重试" onPress={fetchFavorites} />
      ) : !favorites.length ? (
        <Message text="还没有收藏。在影片详情中添加喜欢的作品。" action="去发现" onPress={() => router.push("/")} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: px(52), paddingBottom: px(50) }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: px(18), paddingVertical: px(16) }}>
            {favorites.map((f) => (
              <TVPoster
                key={f.key}
                film={{
                  title: f.title,
                  poster: f.cover,
                  year: f.year,
                  source: f.key.split("+")[0],
                  id: f.key.split("+")[1],
                }}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </TVShell>
  );
}
