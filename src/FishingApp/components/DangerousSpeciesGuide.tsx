import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Flame, Zap, ShieldAlert, LifeBuoy, HeartPulse, Thermometer } from 'lucide-react';

export const DangerousSpeciesGuide: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-900/80 to-red-950/80 border border-amber-500/30 p-5 shadow-2xl backdrop-blur-xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
            California Marine Danger & Venomous Fish Field Manual
          </h2>
          <p className="text-xs text-amber-200/90 mt-0.5">
            Emergency venom neutralization first aid protocols, safe unhooking techniques, and barotrauma descending procedures for California anglers.
          </p>
        </div>
      </div>

      {/* Critical Highlight Card: California Scorpionfish / Sculpin */}
      <motion.div
        whileHover={{ scale: 1.005 }}
        className="rounded-3xl bg-slate-900/90 border-2 border-red-500/40 p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 bg-red-600 text-slate-950 text-[10px] font-mono font-black px-3 py-1 rounded-bl-xl tracking-wider uppercase">
          #1 Angler Sting Danger in California
        </div>

        <div className="flex flex-col md:flex-row items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0 shadow-[0_0_20px_rgba(239,68,68,0.3)]">
            <Flame className="w-7 h-7" />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-black text-white">
                  California Scorpionfish (Sculpin) — Scorpaena guttata
                </h3>
                <span className="text-[11px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/10">
                  CCR Title 14 § 28.50 (Min 10&quot;)
                </span>
              </div>
              <p className="text-xs text-red-200/90 mt-1 leading-relaxed">
                Sculpin are acclaimed as California&apos;s finest fish taco meat, but their dorsal, anal, and pelvic fin spines inject a potent heat-sensitive neurotoxin. Punctures trigger agonizing, throbbing pain, severe swelling, nausea, and cardiac distress.
              </p>
            </div>

            {/* Hot Water First Aid HUD */}
            <div className="rounded-2xl bg-black/50 border border-red-500/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-red-400" />
                  <span>HOT WATER VENOM NEUTRALIZATION PROTOCOL</span>
                </div>
                <span className="font-mono text-cyan-400 text-xs px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
                  110°F – 113°F (43°C – 45°C)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
                <div className="rounded-xl bg-white/[0.02] p-3 border border-white/[0.06]">
                  <strong className="text-white block mb-1">1. Hot Water Soak:</strong>
                  Immerse the affected limb immediately in water as hot as bearable without scalding.
                </div>
                <div className="rounded-xl bg-white/[0.02] p-3 border border-white/[0.06]">
                  <strong className="text-white block mb-1">2. Denatures Venom:</strong>
                  The scorpionfish venom is a heat-labile protein. Heat breaks down the protein within minutes.
                </div>
                <div className="rounded-xl bg-white/[0.02] p-3 border border-white/[0.06]">
                  <strong className="text-white block mb-1">3. Maintain 30–90 Min:</strong>
                  Continue hot water soak until pain subsides. Clean with antiseptic to prevent secondary infection.
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 bg-white/[0.02] p-3 rounded-xl border border-white/[0.06]">
              <strong className="text-emerald-400">Boat Handling Tip: </strong>
              Never hold with bare hands. Use long pliers or lip gripper. If keeping, snip off all dorsal and anal spines with wire snips before dropping into the cooler.
            </div>
          </div>
        </div>
      </motion.div>

      {/* Grid of Other Marine Hazards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Round Stingray */}
        <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-xl backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Round Stingray & Bat Ray</h4>
              <span className="text-[10px] text-slate-400 font-mono">Barbed Venomous Tail Spine</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Stingrays have serrated barbed spines midway along their tail that reflexively whip when touched. Punctures inject venom. First aid: soak immediately in 110°F–115°F hot water.
          </p>
        </div>

        {/* Pacific Electric Ray */}
        <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-xl backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Pacific Electric Ray</h4>
              <span className="text-[10px] text-slate-400 font-mono">Up to 45V Electrical Shock</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Smooth flabby gray ray found on sand flats and kelp edges. Delivers up to 45 volts of severe shock. DO NOT TOUCH with bare hands or wet gloves. Cut leader with insulated tool.
          </p>
        </div>

        {/* Tooth Predators */}
        <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-xl backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Jaws & Gill-Plate Hazards</h4>
              <span className="text-[10px] text-slate-400 font-mono">Lingcod, Moray Eel, Barracuda, Halibut</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Lingcod and Halibut possess sharp canine teeth. California Moray eels have recurved fangs and anticoagulant saliva. Always use long dehookers and keep hands clear of gills and jaws.
          </p>
        </div>

        {/* Barotrauma & Descending Devices */}
        <div className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-xl backdrop-blur-xl space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Barotrauma & Descending Devices</h4>
              <span className="text-[10px] text-slate-400 font-mono">CDFW Conservation Requirement</span>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Rockfish and lingcod brought from depths over 50ft experience swim bladder expansion. Never pop the stomach! Recompress with an approved descending device to bottom depth to survive.
          </p>
        </div>
      </div>
    </motion.div>
  );
};
