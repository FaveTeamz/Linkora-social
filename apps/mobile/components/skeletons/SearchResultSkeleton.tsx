import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBase, SkeletonCircle, SkeletonLine } from "./SkeletonBase";

/**
 * A single skeleton row that mirrors the height of a real search result row
 * (ProfileRow / PoolRow both use minHeight: 76–84). Shown in a list of 5
 * while the search network request is in-flight.
 *
 * Accessibility: accessibilityRole="progressbar" per AC.
 */
export function SearchResultSkeleton() {
  return (
    <SkeletonBase style={styles.row} testID="search-result-skeleton">
      <View
        style={styles.inner}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading search result"
      >
        <SkeletonCircle size={44} />
        <View style={styles.textBlock}>
          <SkeletonLine width={120} height={14} />
          <SkeletonLine width={200} height={11} style={styles.line2} />
          <SkeletonLine width={80} height={10} style={styles.line3} />
        </View>
        <SkeletonLine width={48} height={10} />
      </View>
    </SkeletonBase>
  );
}

/**
 * Renders 5 SearchResultSkeleton rows — the loading state for the search
 * FlatList while results are being fetched.
 */
export function SearchResultSkeletonList() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <SearchResultSkeleton key={i} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  line2: {
    marginTop: 4,
  },
  line3: {
    marginTop: 4,
  },
});
