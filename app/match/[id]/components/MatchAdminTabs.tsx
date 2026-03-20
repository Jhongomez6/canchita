"use client";

import { useCallback } from "react";

export type TabId = "dashboard" | "players" | "teams" | "settings";

interface Tab {
  id: TabId;
  label: string;
  icon: string;
  badge?: number;
  showDot?: boolean;
}

interface MatchAdminTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  playerCount: number;
  hasUnsavedBalance: boolean;
  hasTeams: boolean;
}

export default function MatchAdminTabs({
  activeTab,
  onTabChange,
  playerCount,
  hasUnsavedBalance,
  hasTeams,
}: MatchAdminTabsProps) {
  const scrollToTab = useCallback((el: HTMLButtonElement | null) => {
    if (el && el.getAttribute("aria-selected") === "true") {
      el.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  }, [activeTab]);

  const tabs: Tab[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "players", label: "Jugadores", icon: "👥", badge: playerCount },
    { id: "teams", label: "Equipos", icon: "⚖️", showDot: hasUnsavedBalance },
    { id: "settings", label: "Ajustes", icon: "⚙️" },
  ];

  return (
    <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm -mx-4 md:-mx-6 px-4 md:px-6 mb-6">
      <nav
        role="tablist"
        aria-label="Secciones del partido"
        className="flex overflow-x-auto scrollbar-hide -mb-px"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={scrollToTab}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-1 items-center justify-center gap-1 px-2 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 ${
              activeTab === tab.id
                ? "text-[#1f7a4f] border-[#1f7a4f]"
                : "text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>

            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {tab.badge}
              </span>
            )}

            {tab.showDot && (
              <span className="flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
