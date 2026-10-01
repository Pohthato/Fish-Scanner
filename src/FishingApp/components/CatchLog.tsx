import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Download, CheckCircle2, XCircle, ShieldAlert, Fish, Ruler } from 'lucide-react';
import { CatchLogEntry } from '../types';

interface CatchLogProps {
  catches: CatchLogEntry[];
  onDeleteCatch: (id: string) => void;
  onClearAll: () => void;
  onSelectCatch: (entry: CatchLogEntry) => void;
}

export const CatchLog: React.FC<CatchLogProps> = ({
  catches,
  onDeleteCatch,
  onClearAll,
}) => {
  const keepers = catches.filter((c) => c.verdict.canKeep).length;
  const released = catches.length - keepers;

  const exportCSV = () => {
    if (catches.length === 0) return;
    const headers = ['Date', 'Species', 'Scientific', 'Length (in)', 'Status', 'Can Keep'];
    const rows = catches.map((c) => [
      new Date(c.timestamp).toLocaleDateString(),
      `"${c.commonName}"`,
      `"${c.scientificName}"`,
      c.estimatedLengthInches,
      `"${c.legalStatus}"`,
      c.verdict.canKeep ? 'YES' : 'NO',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `california_catch_log.csv`;
    link.click();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Top Banner & Stats */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/90 border border-white/[0.08] p-5 shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
            California Angler Catch Journal
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs font-mono">
            <span className="text-slate-400">Total: <strong className="text-white">{catches.length}</strong></span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-bold">{keepers} Legal Keepers</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400 font-bold">{released} Released</span>
          </div>
        </div>

        {catches.length > 0 && (
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={exportCSV}
              className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-bold border border-white/10 flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export CSV</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClearAll}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Log</span>
            </motion.button>
          </div>
        )}
      </div>

      {catches.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-500 font-mono rounded-2xl bg-white/[0.01] border border-dashed border-white/10">
          No catch records yet. Scan fish with the camera or photo upload to begin your log.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {catches.map((entry) => {
              const isKeeper = entry.verdict.canKeep;
              const isProt = entry.legalStatus === 'PROTECTED_STRICTLY_PROHIBITED';

              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  whileHover={{ y: -3 }}
                  className="rounded-2xl bg-slate-900/90 border border-white/[0.08] overflow-hidden shadow-xl backdrop-blur-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                      <img
                        src={entry.imagePreview}
                        alt={entry.commonName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2.5 right-2.5">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-lg ${
                            isProt
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : isKeeper
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}
                        >
                          {isProt ? 'PROTECTED' : isKeeper ? 'KEEPER' : 'UNDERSIZED'}
                        </span>
                      </div>

                      <div className="absolute bottom-2.5 left-2.5 bg-black/80 px-2.5 py-1 rounded text-xs font-mono font-bold text-white flex items-center gap-1.5 border border-white/10">
                        <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{entry.estimatedLengthInches}&quot;</span>
                      </div>
                    </div>

                    <div className="p-4 space-y-1">
                      <h4 className="font-bold text-white text-sm">{entry.commonName}</h4>
                      <div className="text-[11px] text-slate-400 italic font-mono">
                        {entry.scientificName}
                      </div>
                      {entry.notes && (
                        <p className="text-[11px] text-slate-300 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04] mt-2">
                          &quot;{entry.notes}&quot;
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span className="text-[11px]">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => onDeleteCatch(entry.id)}
                      className="p-1 rounded-lg text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};
