/**
 * apps/mobile/app/search/index.tsx
 *
 * Full search experience for Linkora mobile.
 *
 * Features:
 *  • Recent searches stored in AsyncStorage, shown when input is empty
 *  • 300ms debounced search results while typing
 *  • Results grouped: Profiles, Posts, Hashtags
 *  • Tapping a result navigates to the correct screen
 *  • Clear button removes all recent searches
 */

import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { SearchBar } from "../../components/SearchBar";
import { ProfileRow } from "../../components/ProfileRow";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { SearchResultSkeletonList } from "../../components/skeletons/SearchResultSkeleton";
import {
  useSearch,
  type HashtagSearchResult,
  type PostSearchResult,
  type ProfileSearchResult,
} from "../../hooks/useSearch";
import { useTheme } from "../../theme/useTheme";

// ---------------------------------------------------------------------------
// Recent search item
// ---------------------------------------------------------------------------

function RecentSearchItem({
  term,
  onTap,
  onRemove,
}: {
  term: string;
  onTap: () => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createRecentStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowContent}
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel={`Search for ${term}`}
      >
        <Text style={styles.clock}>🕐</Text>
        <Text style={styles.term} numberOfLines={1}>
          {term}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${term} from recent searches`}
      >
        <Text style={styles.removeIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Hashtag row
// ---------------------------------------------------------------------------

function HashtagRow({
  hashtag,
  onPress,
}: {
  hashtag: HashtagSearchResult;
  onPress: (tag: string) => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createHashtagStyles(theme), [theme]);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(hashtag.tag)}
      accessibilityRole="button"
      accessibilityLabel={`Search hashtag ${hashtag.tag}`}
      testID={`hashtag-result-${hashtag.tag}`}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>#</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>#{hashtag.tag}</Text>
        <Text style={styles.meta}>{hashtag.postCount} posts</Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Post search result row
// ---------------------------------------------------------------------------

function PostResultRow({
  post,
  onPress,
}: {
  post: PostSearchResult;
  onPress: (id: number | string) => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createPostRowStyles(theme), [theme]);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(post.id)}
      accessibilityRole="button"
      accessibilityLabel={`Post by ${post.username}`}
      testID={`post-result-${post.id}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{post.username.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.username} numberOfLines={1}>
          {post.username}
        </Text>
        <Text style={styles.snippet} numberOfLines={2}>
          {post.content}
        </Text>
        <Text style={styles.meta}>❤ {post.like_count} · 💰 {post.tip_total.toFixed(1)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, count }: { title: string; count: number }) {
  const { theme } = useTheme();
  const styles = useMemo(() => createSectionStyles(theme), [theme]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    query,
    setQuery,
    debouncedQuery,
    results,
    loading,
    error,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    refresh,
  } = useSearch();

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasResults =
    results.profiles.length > 0 || results.posts.length > 0 || results.hashtags.length > 0;

  // ── Navigation handlers ───────────────────────────────────────────────────

  const handleProfilePress = (profile: ProfileSearchResult) => {
    addRecentSearch(query.trim() || profile.username);
    router.push(
      `/profile/${encodeURIComponent(profile.address)}` as Parameters<typeof router.push>[0]
    );
  };

  const handlePostPress = (id: number | string) => {
    addRecentSearch(query.trim());
    router.push(`/post/${id}` as Parameters<typeof router.push>[0]);
  };

  const handleHashtagPress = (tag: string) => {
    addRecentSearch(`#${tag}`);
    // Navigate to explore with the hashtag as query (explore tab handles it)
    router.push(
      `/(tabs)/explore` as Parameters<typeof router.push>[0]
    );
  };

  const handleRecentTap = (term: string) => {
    setQuery(term);
  };

  const handleSearchSubmit = () => {
    if (query.trim()) {
      addRecentSearch(query.trim());
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search profiles, posts, hashtags"
      />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          !hasQuery && !hasResults && recentSearches.length === 0 && styles.centerContent,
        ]}
      >
        {loading ? (
          <SearchResultSkeletonList />
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : !hasQuery ? (
          // ── Empty query: show recent searches ───────────────────────────
          recentSearches.length > 0 ? (
            <View style={styles.recentSection}>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent Searches</Text>
                <TouchableOpacity
                  onPress={clearRecentSearches}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all recent searches"
                >
                  <Text style={styles.clearAllBtn}>Clear</Text>
                </TouchableOpacity>
              </View>
              {recentSearches.map((term) => (
                <RecentSearchItem
                  key={term}
                  term={term}
                  onTap={() => handleRecentTap(term)}
                  onRemove={() => removeRecentSearch(term)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="🔎"
              title="Search Linkora"
              subtitle="Find creators, posts, and hashtags."
            />
          )
        ) : !hasResults ? (
          <EmptyState
            icon="🧭"
            title="No matches"
            subtitle="Try another username, hashtag, or keyword."
            actionLabel="Clear search"
            onAction={() => setQuery("")}
          />
        ) : (
          // ── Results: grouped sections ────────────────────────────────────
          <>
            {results.profiles.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Profiles" count={results.profiles.length} />
                {results.profiles.map((profile) => (
                  <ProfileRow
                    key={profile.address}
                    profile={profile}
                    onPress={handleProfilePress}
                  />
                ))}
              </View>
            )}

            {results.posts.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Posts" count={results.posts.length} />
                {results.posts.map((post) => (
                  <PostResultRow key={post.id} post={post} onPress={handlePostPress} />
                ))}
              </View>
            )}

            {results.hashtags.length > 0 && (
              <View style={styles.section}>
                <SectionHeader title="Hashtags" count={results.hashtags.length} />
                {results.hashtags.map((ht) => (
                  <HashtagRow key={ht.tag} hashtag={ht} onPress={handleHashtagPress} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.surface.background,
    },
    content: {
      paddingBottom: 24,
    },
    centerContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    section: {
      marginTop: 8,
    },
    recentSection: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    recentHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    recentTitle: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: "800",
    },
    clearAllBtn: {
      color: theme.colors.brand.primary,
      fontSize: 13,
      fontWeight: "700",
    },
  });
}

function createRecentStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.surface.border,
    },
    rowContent: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
    },
    clock: {
      fontSize: 14,
      marginRight: 12,
    },
    term: {
      flex: 1,
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: "500",
    },
    removeBtn: {
      padding: 8,
    },
    removeIcon: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}

function createHashtagStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.surface.border,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: theme.colors.brand.secondary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    iconText: {
      color: theme.colors.text.onBrand,
      fontSize: 20,
      fontWeight: "800",
    },
    content: {
      flex: 1,
    },
    title: {
      color: theme.colors.text.primary,
      fontSize: 15,
      fontWeight: "700",
    },
    meta: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      marginTop: 2,
    },
  });
}

function createPostRowStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.surface.border,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.brand.primary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    avatarText: {
      color: theme.colors.text.onBrand,
      fontSize: 15,
      fontWeight: "800",
    },
    content: {
      flex: 1,
    },
    username: {
      color: theme.colors.text.primary,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 4,
    },
    snippet: {
      color: theme.colors.text.secondary,
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 6,
    },
    meta: {
      color: theme.colors.text.secondary,
      fontSize: 11,
    },
  });
}

function createSectionStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    sectionTitle: {
      color: theme.colors.text.primary,
      fontSize: 13,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionCount: {
      color: theme.colors.text.secondary,
      fontSize: 12,
      fontWeight: "600",
    },
  });
}
