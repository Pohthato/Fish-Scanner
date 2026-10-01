import React from 'react';
import { motion } from 'motion/react';
import { Fish, BookOpen, AlertTriangle, History, Cpu } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scanner' | 'regulations' | 'dangerGuide' | 'catchLog';
  setActiveTab: (tab: 'scanner' | 'regulations' | 'dangerGuide' | 'catchLog') => void;
  catchCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  catchCount,
}) => {
  const tabs = [
    { id: 'scanner' as const, label: 'Scanner', icon: Fish },
    { id: 'regulations' as const, label: 'CDFW Regulations', icon: BookOpen },
    { id: 'dangerGuide' as const, label: 'Hazard & Venom', icon: AlertTriangle },
    { id: 'catchLog' as const, label: 'Catch Log', icon: History, count: catchCount },
  ];

  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl bg-slate-950/80 border-b border-white/[0.08] text-white">
      {/* Sleek Top Telemetry Bar */}
      <div className="border-b border-white/[0.04] px-4 py-1 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
          <span className="text-slate-300 font-semibold tracking-wide">YOLOv8-CalFish Local Engine</span>
          <span className="text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-400">California Title 14 Regulations v2026</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-slate-400">Poaching Hotline: <span className="text-amber-400">1-888-334-CalTIP</span></span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
            100% OFFLINE LOCAL
          </span>
        </div>
      </div>

      {/* Main Glass Nav Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand */}
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setActiveTab('scanner')}
          className="flex items-center gap-3 cursor-pointer"
        >
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-sky-500 to-indigo-500 p-[1px] shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <div className="w-full h-full rounded-[11px] bg-slate-950 flex items-center justify-center">
              <Fish className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-white">
                FishingApp
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] text-cyan-300 border border-white/[0.1] font-semibold">
                CALIFORNIA AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Photo Fish ID • Size Limits • Protected Species • Venom Detection
            </p>
          </div>
        </motion.div>

        {/* Floating Capsule Tabs with Spring Indicator */}
        <nav className="flex items-center gap-1 p-1 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabGlow"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/20 via-sky-500/20 to-blue-500/20 border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  />
                )}
                <Icon className={`w-3.5 h-3.5 relative z-10 ${isActive ? 'text-cyan-400' : ''}`} />
                <span className="relative z-10">{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="relative z-10 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
