"use client";

import React, { useState, useEffect } from "react";
import { fetchCreatorTokenPrice } from "@/lib/api";

const trendingTopics = [
  { tag: "#StellarSoroban", posts: "42.8K posts" },
  { tag: "#DecentralizedSocial", posts: "28.3K posts" },
  { tag: "#Web3Identity", posts: "19.5K posts" },
  { tag: "#LinkoraNetwork", posts: "14.2K posts" },
];

const suggestedConnections = [
  { name: "Elena Rostova", handle: "@elena.sor" },
  { name: "Marcus Vance", handle: "@marcus_v" },
  { name: "Aria Chen", handle: "@ariachen" },
];

/** All colour values use CSS custom properties from globals.css / tokens.css
 *  so the dark/light toggle switches this sidebar correctly (Issue #171). */
export function RightSidebar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);

  const [creatorToken, setCreatorToken] = useState<{
    price: string | null;
    volume24h: string | null;
    ready: boolean;
  }>({ price: null, volume24h: null, ready: false });

  useEffect(() => {
    let cancelled = false;
    fetchCreatorTokenPrice.get().then((value) => {
      if (cancelled) return;
      setCreatorToken({ price: value.price, volume24h: value.volume24h, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const priceLabel = creatorToken.ready
    ? creatorToken.price && creatorToken.price !== "null"
      ? creatorToken.price
      : "—"
    : "Loading…";

  return (
    <aside
      aria-label="Right Sidebar Suggestions and Trends"
      className="dashboard-right-sidebar"
      style={{
        width: "320px",
        minWidth: "320px",
        backgroundColor: "var(--background)",
        borderLeft: "1px solid var(--color-border)",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflowY: "auto",
        boxSizing: "border-box",
      }}
    >
      {/* Search Bar */}
      <div style={{ position: "relative", width: "100%" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Linkora..."
          aria-label="Search Linkora"
          style={{
            width: "100%",
            padding: "10px 14px 10px 40px",
            borderRadius: "12px",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--muted)",
            color: "var(--foreground)",
            fontSize: "0.9rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {/* User Profile Card */}
      <div
        style={{
          backgroundColor: "var(--muted)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "var(--color-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-on-brand)",
              fontWeight: 700,
              fontSize: "1.1rem",
            }}
          >
            7C
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <h3
                style={{
                  margin: 0,
                  color: "var(--foreground)",
                  fontSize: "1rem",
                  fontWeight: 600,
                }}
              >
                Alex Rivera
              </h3>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-secondary)">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>@7CAI.326</span>
          </div>
        </div>

        <p
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          Building smart contracts &amp; decentralized social graph on Stellar. Web3 builder &amp;
          Soroban enthusiast.
        </p>

        {/* Profile Stats */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 12px",
            backgroundColor: "var(--background)",
            borderRadius: "10px",
            border: "1px solid var(--color-border)",
          }}
        >
          {[
            { value: "1,420", label: "Followers" },
            { value: "385", label: "Following" },
            { value: "94", label: "Posts" },
          ].map(({ value, label }, i, arr) => (
            <React.Fragment key={label}>
              <div style={{ textAlign: "center" }}>
                <span
                  style={{
                    display: "block",
                    color: "var(--foreground)",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                  }}
                >
                  {value}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{label}</span>
              </div>
              {i < arr.length - 1 && (
                <div style={{ width: "1px", backgroundColor: "var(--color-border)" }} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "var(--color-primary)",
              color: "var(--color-text-on-brand)",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Edit Profile
          </button>
          <button
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              backgroundColor: "transparent",
              color: "var(--foreground)",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Share
          </button>
        </div>
      </div>

      {/* Creator Token Price — fixed height placeholder prevents layout shift */}
      <div
        aria-label="Creator token price"
        style={{
          backgroundColor: "var(--muted)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          padding: "16px",
          minHeight: "112px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3
            style={{
              margin: 0,
              color: "var(--foreground)",
              fontSize: "0.95rem",
              fontWeight: 700,
            }}
          >
            Creator Token
          </h3>
          <span
            style={{
              fontSize: "0.7rem",
              color: "var(--color-primary)",
              fontWeight: 600,
            }}
          >
            7C
          </span>
        </div>
        <div>
          <span
            style={{
              display: "block",
              color: "var(--foreground)",
              fontWeight: 700,
              fontSize: "1.1rem",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {priceLabel}
          </span>
          <span
            style={{
              display: "block",
              color: "var(--text-muted)",
              fontSize: "0.75rem",
            }}
          >
            {creatorToken.volume24h ? `24h Vol ${creatorToken.volume24h}` : "Tracking 24h volume"}
          </span>
        </div>
      </div>

      {/* Trending Topic Section */}
      <div
        style={{
          backgroundColor: "var(--muted)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            color: "var(--foreground)",
            fontSize: "0.95rem",
            fontWeight: 700,
          }}
        >
          Trending Topics
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {trendingTopics.map((topic, idx) => (
            <div
              key={idx}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <span
                  style={{
                    display: "block",
                    color: "var(--color-primary)",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                  }}
                >
                  {topic.tag}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {topic.posts}
                </span>
              </div>
              <button
                aria-label={`More options for ${topic.tag}`}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                •••
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Suggested Connections Section */}
      <div
        style={{
          backgroundColor: "var(--muted)",
          borderRadius: "16px",
          border: "1px solid var(--color-border)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h3
          style={{
            margin: 0,
            color: "var(--foreground)",
            fontSize: "0.95rem",
            fontWeight: 700,
          }}
        >
          Suggested Connections
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {suggestedConnections.map((user, idx) => (
            <div
              key={idx}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-text-on-brand)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  {user.name.charAt(0)}
                </div>
                <div>
                  <span
                    style={{
                      display: "block",
                      color: "var(--foreground)",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}
                  >
                    {user.name}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {user.handle}
                  </span>
                </div>
              </div>
              <button
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  border: "1px solid var(--color-primary)",
                  backgroundColor: "transparent",
                  color: "var(--color-primary)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Follow
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination Dots */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "6px",
          marginTop: "auto",
          paddingTop: "12px",
        }}
      >
        {[0, 1, 2].map((dotIndex) => (
          <button
            key={dotIndex}
            onClick={() => setCurrentPage(dotIndex)}
            aria-label={`Go to section slide ${dotIndex + 1}`}
            style={{
              width: currentPage === dotIndex ? "20px" : "8px",
              height: "8px",
              borderRadius: "4px",
              border: "none",
              backgroundColor:
                currentPage === dotIndex ? "var(--color-primary)" : "var(--color-border)",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </aside>
  );
}
