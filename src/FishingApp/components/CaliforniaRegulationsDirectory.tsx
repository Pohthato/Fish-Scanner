import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ShieldAlert, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { CALIFORNIA_SPECIES_DIRECTORY, CDFW_MEASUREMENT_GUIDELINES } from '../data/californiaRegulationsData';

export const CaliforniaRegulationsDirectory: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = CALIFORNIA_SPECIES_DIRECTORY.filter((item) => {
    const matchesSearch =
      item.commonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.scientificName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.cdfwCodeSection.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCat =
      selectedFilter === 'all'
        ? true
        : selectedFilter === 'protected'
        ? item.legalStatus === 'PROTECTED_STRICTLY_PROHIBITED'
        : selectedFilter === 'danger'
        ? item.dangerLevel !== 'SAFE'
        : selectedFilter === 'size'
        ? item.minimumSizeInches > 0
        : true;

    return matchesSearch && matchesCat;
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Directory Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/90 border border-white/[0.08] p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-bold mb-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              California Code of Regulations (CCR) Title 14
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              Sport Fishing Regulations & Size Limits Directory
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
              Official legal size requirements, daily bag limits, and protected species enforcement codes for California ocean, coastal, and inland waters.
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2.5 text-xs font-mono text-slate-300 shrink-0">
            <span className="text-slate-400 block text-[10px]">CDFW Enforcement Hotline</span>
            <span className="text-amber-400 font-bold">1-888-334-CalTIP (2258)</span>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search California species (Halibut, Sculpin, Lingcod, Giant Sea Bass)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          <div className="md:col-span-6 flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All Species' },
              { id: 'size', label: 'Size Limits (>0")' },
              { id: 'protected', label: 'Strictly Protected' },
              { id: 'danger', label: 'Venomous / Hazards' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setSelectedFilter(btn.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  selectedFilter === btn.id
                    ? 'bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                    : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.08]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Measurement Standards Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-900/80 border border-white/[0.08] p-4 text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-cyan-400 font-bold font-mono">
            <span>Total Length (TL) — CCR Title 14 § 1.62</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            {CDFW_MEASUREMENT_GUIDELINES.totalLength.definition}
          </p>
          <div className="text-[10px] text-slate-400 font-mono">
            Halibut (22&quot;), White Seabass (28&quot;), Lingcod (22&quot;), Calico Bass (14&quot;), Sculpin (10&quot;).
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-white/[0.08] p-4 text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-amber-400 font-bold font-mono">
            <span>Fork Length (FL) — CCR Title 14 § 1.88</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            {CDFW_MEASUREMENT_GUIDELINES.forkLength.definition}
          </p>
          <div className="text-[10px] text-slate-400 font-mono">
            California Yellowtail (24&quot; fork length min), Pacific Bonito, Albacore & Bluefin Tuna.
          </div>
        </div>
      </div>

      {/* Species Accordion List */}
      <div className="space-y-2.5">
        {filtered.map((item) => {
          const isExp = expandedId === item.id;
          const isProt = item.legalStatus === 'PROTECTED_STRICTLY_PROHIBITED';
          const isDang = item.dangerLevel !== 'SAFE';

          return (
            <motion.div
              key={item.id}
              layout
              className={`rounded-2xl border transition-all overflow-hidden backdrop-blur-xl ${
                isProt
                  ? 'bg-slate-900/80 border-rose-500/40 hover:border-rose-500/60'
                  : isDang
                  ? 'bg-slate-900/80 border-amber-500/40 hover:border-amber-500/60'
                  : 'bg-slate-900/80 border-white/[0.08] hover:border-white/20'
              }`}
            >
              <div
                onClick={() => setExpandedId(isExp ? null : item.id)}
                className="p-4 flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isProt
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        : isDang
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                    }`}
                  >
                    {isProt ? (
                      <ShieldAlert className="w-4 h-4" />
                    ) : isDang ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{item.commonName}</h4>
                      <span className="text-[10px] text-slate-500 font-mono italic hidden md:inline">
                        ({item.scientificName})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {item.cdfwCodeSection} • {item.bagLimit}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.minimumSizeInches > 0 ? (
                    <div className="text-right">
                      <span className="text-sm font-black font-mono text-amber-300">
                        {item.minimumSizeInches}&quot;
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono ml-1">
                        {item.measurementType.includes('Fork') ? 'FL' : 'TL'}
                      </span>
                    </div>
                  ) : (
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        isProt
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-white/[0.04] text-slate-400'
                      }`}
                    >
                      {isProt ? 'PROHIBITED (0)' : 'NO MIN'}
                    </span>
                  )}

                  <motion.div
                    animate={{ rotate: isExp ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </motion.div>
                </div>
              </div>

              {/* Expanded Details Body */}
              <AnimatePresence>
                {isExp && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 bg-slate-950/90 border-t border-white/[0.06] text-xs space-y-3"
                  >
                    {item.dangerNotes && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                        <strong className="text-amber-300 block mb-0.5">Hazard Warning:</strong>
                        <p className="text-[11px] leading-relaxed">{item.dangerNotes}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <strong className="text-slate-200 block mb-1">Visual ID Marks:</strong>
                        <ul className="space-y-1 text-slate-400">
                          {item.identificationTips.map((tip, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="text-cyan-400 mt-0.5">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <strong className="text-slate-200 block">Safe Handling:</strong>
                          <span className="text-slate-400">{item.safeHandlingTips}</span>
                        </div>
                        <div>
                          <strong className="text-slate-200 block">Culinary & Health:</strong>
                          <span className="text-slate-400">{item.culinaryNotes}</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};
