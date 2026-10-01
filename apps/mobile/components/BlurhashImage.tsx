/**
 * BlurhashImage
 *
 * A React-Native image component that:
 *  1. Renders a blurhash-decoded colour grid as a placeholder while the real
 *     image is loading (zero layout shift — the container is sized up-front).
 *  2. Crossfades from the placeholder to the real image on load.
 *  3. Falls back gracefully when no `blurhash` or `uri` is supplied.
 *
 * The `blurhash` pure-JS library is used to decode the hash into RGBA pixels,
 * which are then rendered as an N×N grid of absolutely-positioned <View>s.
 * This avoids any native-module dependency while providing a correct visual
 * placeholder.
 *
 * Usage:
 *   <BlurhashImage
 *     uri="https://example.com/avatar.jpg"
 *     blurhash="LEHV6nWB2yk8pyo0adR*.7kCMdnj"
 *     width={40}
 *     height={40}
 *     borderRadius={20}
 *   />
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { decode } from "blurhash";

/** Number of pixels per axis used for the decoded colour grid. */
const GRID_SIZE = 8;

interface Props {
  /** Remote or local image URI. */
  uri?: string | null;
  /** Blurhash string to show while the image is loading. */
  blurhash?: string | null;
  /** Displayed width in dp. */
  width: number;
  /** Displayed height in dp. */
  height: number;
  /** Border radius applied to both the placeholder and the image. */
  borderRadius?: number;
  /** Extra styles forwarded to the outer container. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Extra styles forwarded to the <Image> element. */
  imageStyle?: StyleProp<ImageStyle>;
  /** Accessibility label for the image. */
  accessibilityLabel?: string;
}

/**
 * Decode a blurhash string into a grid of CSS-hex colour strings.
 * Returns null if the hash is missing or decoding throws.
 */
function decodeBlurhash(hash: string, w: number, h: number): string[] | null {
  try {
    const pixels = decode(hash, w, h);
    const cells: string[] = [];
    for (let i = 0; i < w * h; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      cells.push(
        `rgb(${r},${g},${b})`
      );
    }
    return cells;
  } catch {
    return null;
  }
}

export function BlurhashImage({
  uri,
  blurhash: blurhashProp,
  width,
  height,
  borderRadius = 0,
  containerStyle,
  imageStyle,
  accessibilityLabel,
}: Props) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageOpacity = useRef(new Animated.Value(0)).current;

  /** Decode once per hash value. */
  const cells = useMemo<string[] | null>(() => {
    if (!blurhashProp) return null;
    return decodeBlurhash(blurhashProp, GRID_SIZE, GRID_SIZE);
  }, [blurhashProp]);

  const cellWidth = width / GRID_SIZE;
  const cellHeight = height / GRID_SIZE;

  const handleLoad = useCallback(() => {
    setImageLoaded(true);
    Animated.timing(imageOpacity, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [imageOpacity]);

  return (
    <View
      style={[
        styles.container,
        { width, height, borderRadius, overflow: "hidden" },
        containerStyle,
      ]}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      {/* ── Blurhash placeholder ── */}
      {cells ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.grid,
          ]}
          // Hide from accessibility tree — it's purely decorative
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {cells.map((color, idx) => {
            const col = idx % GRID_SIZE;
            const row = Math.floor(idx / GRID_SIZE);
            return (
              <View
                key={idx}
                style={{
                  position: "absolute",
                  left: col * cellWidth,
                  top: row * cellHeight,
                  width: cellWidth,
                  height: cellHeight,
                  backgroundColor: color,
                }}
              />
            );
          })}
        </View>
      ) : (
        /* Plain tinted fallback when no blurhash is provided */
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {/* ── Real image (crossfades in on load) ── */}
      {uri ? (
        <Animated.Image
          source={{ uri }}
          style={[
            StyleSheet.absoluteFill,
            { borderRadius, opacity: imageOpacity },
            imageStyle,
          ]}
          onLoad={handleLoad}
          // Don't announce duplicate accessibility info
          accessible={false}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "transparent",
  },
  grid: {
    // cells are absolutely placed inside the grid
  },
  fallback: {
    backgroundColor: "#E5E7EB",
  },
});
