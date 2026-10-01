"use client";

import React, { useState } from "react";

interface DashboardHeaderProps {
  isLoading: boolean;
  onToggleLoading: () => void;
}

const subNavTabs = ["Cont rives", "F0A8200", "Mycontonts", "Deshlohns"];

export function DashboardHeader({ isLoading, onToggleLoading }: DashboardHeaderProps) {
  const [activeTab, setActiveTab] = useState("Cont rives");

  return (
    <header
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "24px 24px 16px 24px",
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--background)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1
            style={{
              margin: 0,
              color: "var(--foreground)",
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            Daskloode
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--text-muted)",
              fontSize: "0.9rem",
            }}
          >
            Explore community updates, Stellar Soroban posts, and custom content streams.
          </p>
        </div>

        {/* Skeleton Toggle Button & Create Action */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={onToggleLoading}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--muted)",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {isLoading ? "Show Posts" : "Skeleton View"}
          </button>
          <button
            style={{
              padding: "8px 18px",
              borderRadius: "10px",
              border: "none",
              background:
                "linear-gradient(135deg, var(--color-secondary) 0%, var(--color-primary) 100%)",
              color: "var(--color-text-on-brand)",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 12px color-mix(in srgb, var(--color-primary) 25%, transparent)",
            }}
          >
            + Create Post
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <nav style={{ display: "flex", gap: "8px", overflowX: "auto" }}>
        {subNavTabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 16px",
                borderRadius: "20px",
                border: isActive ? "1px solid var(--color-primary)" : "1px solid transparent",
                backgroundColor: isActive ? "var(--muted)" : "transparent",
                color: isActive ? "var(--color-primary)" : "var(--text-muted)",
                fontSize: "0.9rem",
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
            >
              {tab}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
