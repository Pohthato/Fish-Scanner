import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Ruler,
  Utensils,
  Save,
  ArrowLeft,
  LifeBuoy,
  Scale,
  Flame,
  Info,
  Check,
} from 'lucide-react';
import { FishAnalysisResult } from '../types';
import { CatchRulerTool } from './CatchRulerTool';

interface AnalysisResultViewProps {
  result: FishAnalysisResult;
  imageUrl: string;
  onReset: () => void;
  onSaveToLog: (customNotes?: string) => void;
  isSaved?: boolean;
}

export const AnalysisResultView: React.FC<AnalysisResultViewProps> = ({
  result,
  imageUrl,
  onReset,
  onSaveToLog,
  isSaved = false,
}) => {
  const [adjustedLength, setAdjustedLength] = useState<number>(result.estimatedLengthInches);
  const [notes, setNotes] = useState<string>('');

  const {
    commonName,
    scientificName,
    family,
    confidenceLevel,
    waterHabitat,
    identificationFeatures,
    lookAlikesComparison,
    isDangerousOrVenomous,
    dangerLevel,
    dangerDetails,
    safeHandlingProtocol,
    californiaRegulations,
    verdict,
    culinaryProfile,
    measurementType,
  } = result;

  const minSize = californiaRegulations.minimumSizeInches || 0;
  const isProtected = californiaRegulations.legalStatus === 'PROTECTED_STRICTLY_PROHIBITED';
  const isLegal = minSize > 0 ? adjustedLength >= minSize : !isProtected;
  const delta = minSize > 0 ? (adjustedLength - minSize).toFixed(1) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onReset}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white bg-slate-900 border border-white/10 px-4 py-2 rounded-xl transition-all cursor-pointer backdrop-blur-md shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>New Scan</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSaveToLog(notes)}
          disabled={isSaved}
          className={`inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer shadow-lg ${
            isSaved
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
              : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
          }`}
        >
          {isSaved ? (
            <>
              <Check className="w-4 h-4" />
              <span>Saved in Catch Log</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Catch</span>
            </>
          )}
        </motion.button>
      </div>

      {/* High-Tech Glowing Verdict Billboard */}
      <motion.div
        initial={{ scale: 0.98 }}
        animate={{ scale: 1 }}
        className={`relative rounded-3xl p-6 md:p-7 border backdrop-blur-2xl overflow-hidden shadow-2xl transition-all ${
          isProtected
            ? 'bg-gradient-to-r from-red-950/80 via-slate-950 to-slate-950 border-rose-500/50 text-rose-100 shadow-[0_0_40px_rgba(244,63,94,0.15)]'
            : isDangerousOrVenomous && dangerLevel === 'CRITICAL_HAZARD'
            ? 'bg-gradient-to-r from-amber-950/80 via-slate-950 to-slate-950 border-amber-500/50 text-amber-100 shadow-[0_0_40px_rgba(245,158,11,0.15)]'
            : verdict.canKeep && isLegal
            ? 'bg-gradient-to-r from-emerald-950/80 via-slate-950 to-slate-950 border-emerald-500/50 text-emerald-100 shadow-[0_0_40px_rgba(16,185,129,0.15)]'
            : 'bg-gradient-to-r from-red-950/80 via-slate-950 to-slate-950 border-red-500/50 text-red-100 shadow-[0_0_40px_rgba(239,68,68,0.15)]'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start gap-4">
            <div
              className={`p-3.5 rounded-2xl shrink-0 shadow-lg ${
                isProtected
                  ? 'bg-rose-500 text-slate-950'
                  : isDangerousOrVenomous && dangerLevel === 'CRITICAL_HAZARD'
                  ? 'bg-amber-400 text-slate-950'
                  : verdict.canKeep && isLegal
                  ? 'bg-emerald-400 text-slate-950'
                  : 'bg-rose-500 text-slate-950'
              }`}
            >
              {isProtected ? (
                <ShieldAlert className="w-8 h-8" />
              ) : isDangerousOrVenomous && dangerLevel === 'CRITICAL_HAZARD' ? (
                <AlertTriangle className="w-8 h-8" />
              ) : verdict.canKeep && isLegal ? (
                <CheckCircle2 className="w-8 h-8" />
              ) : (
                <XCircle className="w-8 h-8" />
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5 font-mono">
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    isProtected
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : verdict.canKeep && isLegal
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                  }`}
                >
                  {isProtected
                    ? 'PROTECTED / PROHIBITED'
                    : verdict.canKeep && isLegal
                    ? 'LEGAL KEEPER'
                    : 'UNDERSIZED — ILLEGAL TO KEEP'}
                </span>

                <span className="text-[11px] bg-white/[0.06] text-slate-300 px-2 py-0.5 rounded-md border border-white/10">
                  {californiaRegulations.cdfwCodeSection}
                </span>

                {isDangerousOrVenomous && (
                  <span className="text-[11px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-500/30 flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    HAZARD ALERT
                  </span>
                )}
              </div>

              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                {verdict.headline}
              </h2>
              <p className="text-xs md:text-sm opacity-90 mt-1 max-w-3xl leading-relaxed">
                {verdict.detailedReason}
              </p>
            </div>
          </div>

          {/* Action Box */}
          <div className="rounded-2xl bg-black/50 backdrop-blur-md p-4 border border-white/10 shrink-0 w-full md:w-auto">
            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block mb-1">
              Required Immediate Action
            </span>
            <div className="text-xs font-bold text-white max-w-xs leading-snug">
              {verdict.requiredAction}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Grid: Photo & Specs Left (5 cols), Regulations Right (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] overflow-hidden shadow-2xl backdrop-blur-xl">
            {/* Viewport with YOLO Bounding Box */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              <img src={imageUrl} alt={commonName} className="w-full h-full object-contain" />

              {/* Bounding Box Simulation */}
              <div
                className={`absolute border-2 rounded-lg pointer-events-none ${
                  isProtected
                    ? 'border-rose-500/80 bg-rose-500/10'
                    : isLegal
                    ? 'border-emerald-400/80 bg-emerald-400/10'
                    : 'border-red-500/80 bg-red-500/10'
                }`}
                style={{
                  left: '12%',
                  top: '20%',
                  width: '76%',
                  height: '60%',
                }}
              >
                {/* Top Corner Label */}
                <div className="absolute -top-6 left-0 bg-slate-950/90 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white border border-white/10 flex items-center gap-1.5 shadow-lg">
                  <span className="text-cyan-400">{commonName}</span>
                  <span className="text-slate-400">{confidenceLevel}</span>
                </div>

                {/* Bottom Length Marker */}
                <div className="absolute -bottom-6 right-0 bg-slate-950/90 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white border border-white/10 shadow-lg">
                  {adjustedLength}&quot; [{measurementType === 'Fork Length (FL)' ? 'FL' : 'TL'}]
                </div>
              </div>
            </div>

            {/* Species Identity Card */}
            <div className="p-4 border-t border-white/[0.08]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg font-black text-white">{commonName}</h3>
                  <div className="text-xs italic text-slate-400 font-mono mt-0.5">
                    {scientificName} • {family}
                  </div>
                </div>

                <span className="text-[10px] font-semibold bg-white/[0.04] text-slate-300 px-2 py-1 rounded-md border border-white/[0.08] shrink-0 font-mono">
                  {waterHabitat}
                </span>
              </div>

              {/* Visual Identification Hallmarks */}
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <h4 className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Observed Identification Hallmarks:
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {identificationFeatures.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5 shadow-[0_0_6px_#22d3ee]" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Calibrator Tool */}
          <CatchRulerTool
            currentLengthInches={adjustedLength}
            minimumLegalInches={minSize}
            speciesName={commonName}
            onLengthChange={(val) => setAdjustedLength(val)}
            measurementType={measurementType}
          />

          {/* Notes Input */}
          <div className="rounded-xl bg-slate-900/90 border border-white/[0.08] p-3 text-xs">
            <label className="font-bold text-slate-300 block mb-1">
              Add Field Notes (Depth, Lure, Coordinates):
            </label>
            <input
              type="text"
              placeholder="e.g. 45ft deep on live squid, Catalina south side"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        {/* Right Column: Regulations & Danger Guides */}
        <div className="lg:col-span-7 space-y-4">
          {/* CALIFORNIA CDFW TITLE 14 SPECIFICATION CARD */}
          <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    California CDFW Title 14 Regulations
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Official Sport Fishing Enforcement Code
                  </span>
                </div>
              </div>
              <span className="bg-amber-500/10 text-amber-300 font-mono text-xs px-2.5 py-1 rounded-lg border border-amber-500/20">
                {californiaRegulations.cdfwCodeSection}
              </span>
            </div>

            {/* Size Progress Bar */}
            <div className="rounded-xl bg-slate-950 p-4 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-slate-400 uppercase">
                  Measured vs Legal Limit
                </span>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {measurementType}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">
                    Fish: <strong className="text-white">{adjustedLength}&quot;</strong>
                  </span>
                  <span className="text-slate-400">
                    CDFW Min:{' '}
                    <strong className="text-amber-300">
                      {minSize > 0 ? `${minSize}"` : 'None'}
                    </strong>
                  </span>
                </div>

                {minSize > 0 && (
                  <div className="relative w-full h-3.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isLegal ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]' : 'bg-rose-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (adjustedLength / (minSize * 1.35)) * 100)}%`,
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-amber-400 z-10 shadow-[0_0_6px_#f59e0b]"
                      style={{ left: `${(minSize / (minSize * 1.35)) * 100}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-400">{californiaRegulations.sizeRuleSummary}</span>
                  {delta && (
                    <span
                      className={`font-mono font-bold ${
                        Number(delta) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {Number(delta) >= 0 ? `+${delta}" Legal Margin` : `${delta}" Undersized`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bag Limit & Season Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-white/[0.02] p-3 border border-white/[0.06]">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                  Daily Bag Limit
                </span>
                <span className="font-bold text-white text-sm">{californiaRegulations.bagLimit}</span>
              </div>

              <div className="rounded-xl bg-white/[0.02] p-3 border border-white/[0.06]">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                  Season Status
                </span>
                <span className="font-medium text-slate-200">
                  {californiaRegulations.openSeasonSummary || 'Open in accordance with California regional zone'}
                </span>
              </div>
            </div>

            {/* Barotrauma Descending Device Notice */}
            {californiaRegulations.descendingDeviceAdvised && (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-3 text-xs text-cyan-200 flex items-start gap-2.5">
                <LifeBuoy className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-cyan-300">
                    CDFW Barotrauma Descending Device Advised
                  </span>
                  When releasing rockfish, lingcod, or cabezon caught from depth, recompress with an approved descending device to at least 50ft to ensure survival.
                </div>
              </div>
            )}

            {/* Penalties Notice */}
            {californiaRegulations.penaltiesWarning && (
              <div className="rounded-xl bg-black/40 p-3 border border-white/[0.06] text-[11px] text-slate-400 flex items-start gap-2 font-mono">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-300">CDFW Enforcement: </span>
                  {californiaRegulations.penaltiesWarning}
                </div>
              </div>
            )}
          </div>

          {/* DANGEROUS / VENOMOUS SPECIES ALERT CARD */}
          {isDangerousOrVenomous && (
            <div className="rounded-2xl bg-gradient-to-r from-amber-950/80 to-red-950/80 border border-amber-500/50 p-5 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>Hazard Alert: {dangerLevel.replace('_', ' ')}</span>
              </div>

              {dangerDetails && (
                <div className="text-xs text-amber-100 bg-black/40 p-3 rounded-xl border border-amber-500/20 leading-relaxed">
                  <strong>Specific Hazard: </strong> {dangerDetails}
                </div>
              )}

              {safeHandlingProtocol && (
                <div className="text-xs text-slate-200 bg-slate-900/90 p-3.5 rounded-xl border border-white/10 space-y-1">
                  <span className="font-bold text-amber-300 block">
                    Safe Handling & Unhooking Protocol:
                  </span>
                  <p className="leading-relaxed">{safeHandlingProtocol}</p>
                </div>
              )}
            </div>
          )}

          {/* LOOK-ALIKES COMPARISON */}
          {lookAlikesComparison && lookAlikesComparison.length > 0 && (
            <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-cyan-400" />
                California Look-Alike & Regulation Risk Comparison
              </h3>

              <div className="space-y-2">
                {lookAlikesComparison.map((comp, i) => (
                  <div key={i} className="rounded-xl bg-slate-950 p-3 border border-white/[0.06] text-xs space-y-1">
                    <div className="font-bold text-cyan-300">Similar: {comp.similarSpecies}</div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      <strong>How to Distinguish: </strong> {comp.howToDistinguish}
                    </p>
                    {comp.californiaRisk && (
                      <p className="text-amber-300 text-[11px] bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                        Legal Risk: {comp.californiaRisk}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CULINARY PROFILE */}
          <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-xl space-y-2 text-xs">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Utensils className="w-4 h-4 text-emerald-400" />
              Table Edibility & Health Advisories
            </h3>

            <div className="rounded-xl bg-slate-950 p-3 border border-white/[0.06] text-slate-300">
              <div className="font-semibold text-slate-100 mb-1">
                Culinary Rating: {culinaryProfile.tasteAndTextureRating}
              </div>
              {culinaryProfile.californiaHealthAdvisory && (
                <div className="text-[11px] text-slate-400 mt-2 pt-2 border-t border-white/[0.06]">
                  <strong className="text-cyan-400">OEHHA Advisory: </strong>
                  {culinaryProfile.californiaHealthAdvisory}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
