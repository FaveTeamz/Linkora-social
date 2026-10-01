import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { useProfile } from "../../hooks/useProfile";
import { useWallet } from "../../hooks/useWallet";
import { useTheme } from "../../theme/useTheme";

interface CreatorPost {
  created_ledger: number;
  tip_total: string | number;
}

interface RevenuePoint {
  date: string;
  amount: number;
}

interface CreatorMetrics {
  postCount: number;
  tipsXlm: number;
  revenue: RevenuePoint[];
}

const INDEXER_URL = (process.env.EXPO_PUBLIC_INDEXER_URL || "http://localhost:3001").replace(/\/$/, "");
const STELLAR_GENESIS_MS = new Date("2015-09-01T00:00:00Z").getTime();

async function fetchCreatorMetrics(address: string): Promise<CreatorMetrics> {
  const posts: CreatorPost[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `${INDEXER_URL}/api/posts?author=${encodeURIComponent(address)}&limit=100&offset=${offset}`
    );
    if (!response.ok) throw new Error("Could not load creator analytics.");
    const page = (await response.json()) as { posts?: CreatorPost[]; has_more?: boolean };
    posts.push(...(page.posts ?? []));
    hasMore = Boolean(page.has_more);
    offset += 100;
  }

  const dailyTips = new Map<string, number>();
  let totalTips = 0;
  for (const post of posts) {
    const tips = Number(post.tip_total) || 0;
    const day = new Date(STELLAR_GENESIS_MS + (post.created_ledger - 1) * 5_000)
      .toISOString()
      .slice(0, 10);
    dailyTips.set(day, (dailyTips.get(day) ?? 0) + tips);
    totalTips += tips;
  }

  return {
    postCount: posts.length,
    tipsXlm: totalTips / 10_000_000,
    revenue: Array.from(dailyTips, ([date, amount]) => ({ date, amount: amount / 10_000_000 }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export default function CreatorDashboardScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { address, connected, connect } = useWallet();
  const { followerCount, loading: profileLoading, refresh: refreshProfile } = useProfile(address ?? "");
  const [metrics, setMetrics] = useState<CreatorMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      setMetrics(await fetchCreatorMetrics(address));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load creator analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    void loadMetrics();
  }, [address, loadMetrics]);

  const refresh = () => {
    setRefreshing(true);
    refreshProfile();
    void loadMetrics();
  };

  const styles = createStyles(theme);

  if (!connected || !address) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="◎"
          title="Connect your wallet"
          subtitle="Connect to see your creator stats and rewards."
          actionLabel="Connect wallet"
          onAction={() => void connect()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={theme.colors.brand.secondary}
          colors={[theme.colors.brand.secondary]}
        />
      }
    >
      <View style={styles.heading}>
        <Text style={styles.title}>Creator dashboard</Text>
        <Text style={styles.subtitle}>{address.slice(0, 8)}…{address.slice(-6)}</Text>
      </View>

      {loading && !metrics ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.brand.secondary} />
      ) : error ? (
        <View style={styles.errorPanel}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refresh} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.stats}>
            <StatCard label="Tips received" value={`${(metrics?.tipsXlm ?? 0).toFixed(2)} XLM`} styles={styles} />
            <StatCard label="Posts" value={String(metrics?.postCount ?? 0)} styles={styles} />
            <StatCard label="Followers" value={profileLoading ? "—" : String(followerCount)} styles={styles} />
            <StatCard label="Pending rewards" value="—" styles={styles} />
          </View>

          <RevenueChart points={metrics?.revenue ?? []} styles={styles} />

          <TouchableOpacity
            style={styles.claimButton}
            onPress={() => router.push("/(tabs)/pools" as Parameters<typeof router.push>[0])}
            accessibilityRole="button"
            accessibilityLabel="Claim rewards or view available pools"
          >
            <Text style={styles.claimButtonText}>Claim rewards</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RevenueChart({
  points,
  styles,
}: {
  points: RevenuePoint[];
  styles: ReturnType<typeof createStyles>;
}) {
  const visiblePoints = points.slice(-30);
  const maxAmount = Math.max(...visiblePoints.map(({ amount }) => amount), 0);

  return (
    <View style={styles.chartPanel}>
      <View style={styles.chartHeading}>
        <Text style={styles.chartTitle}>Revenue</Text>
        <Text style={styles.chartUnit}>XLM per day</Text>
      </View>
      {visiblePoints.length === 0 ? (
        <Text style={styles.chartEmpty}>No tips received yet</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.chartScroll}>
          {visiblePoints.map(({ date, amount }) => (
            <View key={date} style={styles.chartColumn}>
              <Text style={styles.chartAmount}>{amount.toFixed(2)}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${Math.max((amount / maxAmount) * 100, 3)}%` }]} />
              </View>
              <Text style={styles.chartDate}>{date.slice(5)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useTheme>["theme"]) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.surface.background },
    content: { padding: 20, paddingBottom: 32, gap: 16 },
    heading: { gap: 5, marginBottom: 2 },
    title: { color: theme.colors.text.primary, fontSize: 24, fontWeight: "800" },
    subtitle: { color: theme.colors.text.secondary, fontSize: 12, fontFamily: "monospace" },
    loader: { paddingVertical: 36 },
    errorPanel: { padding: 16, gap: 12, backgroundColor: theme.colors.surface.surface1 },
    errorText: { color: theme.colors.semantic.error, fontSize: 14 },
    retryText: { color: theme.colors.brand.secondary, fontWeight: "700" },
    stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    statCard: {
      width: "47%",
      minHeight: 92,
      justifyContent: "center",
      padding: 14,
      backgroundColor: theme.colors.surface.surface1,
      borderWidth: 1,
      borderColor: theme.colors.surface.border,
      borderRadius: 8,
    },
    statValue: { color: theme.colors.text.primary, fontSize: 20, fontWeight: "800" },
    statLabel: { color: theme.colors.text.secondary, fontSize: 12, marginTop: 6 },
    chartPanel: {
      padding: 16,
      backgroundColor: theme.colors.surface.surface1,
      borderWidth: 1,
      borderColor: theme.colors.surface.border,
      borderRadius: 8,
    },
    chartHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    chartTitle: { color: theme.colors.text.primary, fontSize: 16, fontWeight: "700" },
    chartUnit: { color: theme.colors.text.secondary, fontSize: 11 },
    chartEmpty: { color: theme.colors.text.secondary, fontSize: 13, paddingVertical: 28 },
    chartScroll: { minHeight: 170, alignItems: "flex-end", gap: 14, paddingTop: 12 },
    chartColumn: { width: 48, height: 148, alignItems: "center", justifyContent: "flex-end", gap: 5 },
    chartAmount: { color: theme.colors.text.secondary, fontSize: 9 },
    barTrack: { width: 24, height: 104, justifyContent: "flex-end", overflow: "hidden" },
    bar: { width: "100%", minHeight: 3, backgroundColor: theme.colors.brand.secondary, borderRadius: 3 },
    chartDate: { color: theme.colors.text.secondary, fontSize: 10 },
    claimButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
      backgroundColor: theme.colors.brand.primary,
      borderRadius: 8,
    },
    claimButtonText: { color: theme.colors.text.onBrand, fontSize: 15, fontWeight: "700" },
  });
}