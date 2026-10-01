"use client";

import React, { useState } from "react";
import { LeftSidebar } from "../../components/dashboard/LeftSidebar";
import { RightSidebar } from "../../components/dashboard/RightSidebar";
import { DashboardHeader } from "../../components/dashboard/DashboardHeader";
import { DashboardPostGrid } from "../../components/dashboard/DashboardPostGrid";
import { MobileTopTabs } from "../../components/dashboard/MobileTopTabs";

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(false);

  const toggleLoading = () => setIsLoading((prev) => !prev);

  return (
    <div
      className="dashboard-layout"
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
        width: "100%",
        overflowX: "hidden",
      }}
    >
      {/* 1. Left Sidebar Column (240px / collapsible) — hidden on mobile via CSS */}
      <LeftSidebar />

      {/* 2. Main Content Area Column (Background #0F172A) */}
      <main
        style={{
          flex: 1,
          backgroundColor: "var(--background)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          /* Prevent main from growing wider than viewport minus sidebar */
          minWidth: 0,
          overflowX: "hidden",
        }}
      >
        {/* Mobile top tabs — shown only on mobile via CSS, replaces LeftSidebar */}
        <MobileTopTabs />

        <DashboardHeader isLoading={isLoading} onToggleLoading={toggleLoading} />
        <DashboardPostGrid isLoading={isLoading} />
      </main>

      {/* 3. Right Sidebar Column (320px / hidden on <1280px) */}
      <RightSidebar />
    </div>
  );
}
