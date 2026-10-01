import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Ruler, CheckCircle2, XCircle, Info, SlidersHorizontal } from 'lucide-react';
import { CDFW_MEASUREMENT_GUIDELINES } from '../data/californiaRegulationsData';

interface CatchRulerToolProps {
  currentLengthInches: number;
  minimumLegalInches?: number;
  speciesName?: string;
  onLengthChange: (length: number) => void;
  measurementType?: string;
}

export const CatchRulerTool: React.FC<CatchRulerToolProps> = ({
  currentLengthInches,
  minimumLegalInches = 0,
  speciesName,
  onLengthChange,
  measurementType = 'Total Length (TL)',
}) => {
  const [sliderVal, setSliderVal] = useState<number>(currentLengthInches || 18);
  const [activeType, setActiveType] = useState<string>(measurementType);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSliderVal(val);
    onLengthChange(val);
  };

  const isLegal = minimumLegalInches > 0 ? sliderVal >= minimumLegalInches : true;
  const delta = minimumLegalInches > 0 ? (sliderVal - minimumLegalInches).toFixed(1) : null;

  return (
    <div className="relative rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-white/[0.08] p-5 shadow-2xl backdrop-blur-xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Ruler className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white tracking-wide">
                Virtual CDFW Digital Caliper
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                {activeType}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Snout closed to farthest caudal tail tip (CCR Title 14 § 1.62)
            </p>
          </div>
        </div>

        {/* TL vs FL Segmented Toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs">
          <button
            onClick={() => setActiveType('Total Length (TL)')}
            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activeType.includes('Total')
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Total Length (TL)
          </button>
          <button
            onClick={() => setActiveType('Fork Length (FL)')}
            className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              activeType.includes('Fork')
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Fork Length (FL)
          </button>
        </div>
      </div>

      {/* Modern HUD Readouts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* Measured Readout */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5 relative overflow-hidden">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
            Measured Length
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-white tracking-tight">
              {sliderVal.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-cyan-400 font-mono">in</span>
            <span className="text-xs text-slate-500 font-mono ml-auto">
              {(sliderVal * 2.54).toFixed(1)} cm
            </span>
          </div>
        </div>

        {/* Minimum Size Requirement */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
            Legal Minimum (CDFW)
          </span>
          <div className="flex items-baseline gap-1.5">
            {minimumLegalInches > 0 ? (
              <>
                <span className="text-3xl font-black font-mono text-amber-300 tracking-tight">
                  {minimumLegalInches}
                </span>
                <span className="text-xs font-bold text-amber-400/80 font-mono">in min</span>
              </>
            ) : (
              <span className="text-sm font-bold text-slate-300 mt-1 block">
                No Minimum Limit
              </span>
            )}
          </div>
        </div>

        {/* Status Callout with Glow */}
        <motion.div
          animate={{ scale: [0.98, 1] }}
          transition={{ duration: 0.2 }}
          className={`rounded-xl p-3.5 border flex items-center justify-between ${
            minimumLegalInches === 0
              ? 'bg-sky-500/10 border-sky-500/30 text-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.15)]'
              : isLegal
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
          }`}
        >
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider block opacity-80 mb-0.5">
              Legal Verdict
            </span>
            <div className="flex items-center gap-1.5 font-mono font-black text-sm">
              {minimumLegalInches === 0 ? (
                <span>Legal Size</span>
              ) : isLegal ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>KEEPER (+{delta}&quot;)</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>UNDERSIZED ({delta}&quot;)</span>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Interactive High-Tech Slider */}
      <div className="relative pt-6 pb-5">
        <input
          type="range"
          min="4"
          max="50"
          step="0.25"
          value={sliderVal}
          onChange={handleSlider}
          className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
        />

        {/* Ticks Grid */}
        <div className="relative w-full h-5 mt-3">
          {[6, 12, 18, 24, 30, 36, 42, 48].map((inch) => {
            const percent = ((inch - 4) / (50 - 4)) * 100;
            const isMinThreshold = minimumLegalInches === inch;
            return (
              <div
                key={inch}
                style={{ left: `${percent}%` }}
                className="absolute -translate-x-1/2 flex flex-col items-center"
              >
                <div
                  className={`w-0.5 h-2 ${
                    isMinThreshold ? 'bg-amber-400 w-1 h-3 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-700'
                  }`}
                />
                <span
                  className={`text-[10px] font-mono mt-1 ${
                    isMinThreshold ? 'text-amber-400 font-bold' : 'text-slate-500'
                  }`}
                >
                  {inch}&quot;
                </span>
              </div>
            );
          })}

          {/* Minimum Legal Pin if non-standard */}
          {minimumLegalInches > 0 &&
            ![6, 12, 18, 24, 30, 36, 42, 48].includes(minimumLegalInches) && (
              <div
                style={{
                  left: `${((minimumLegalInches - 4) / (50 - 4)) * 100}%`,
                }}
                className="absolute -translate-x-1/2 flex flex-col items-center"
              >
                <div className="w-1 h-3.5 bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
                <span className="text-[10px] font-mono font-bold text-amber-400 mt-1 whitespace-nowrap">
                  Min {minimumLegalInches}&quot;
                </span>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
