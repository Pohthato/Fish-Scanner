import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { FishScanner } from './components/FishScanner';
import { AnalysisResultView } from './components/AnalysisResultView';
import { CaliforniaRegulationsDirectory } from './components/CaliforniaRegulationsDirectory';
import { DangerousSpeciesGuide } from './components/DangerousSpeciesGuide';
import { CatchLog } from './components/CatchLog';
import { FishAnalysisResult, CatchLogEntry } from './types';

const STORAGE_KEY = 'california_fishing_app_catches_v3';

export const FishingAppMain: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'scanner' | 'regulations' | 'dangerGuide' | 'catchLog'>('scanner');
  const [currentResult, setCurrentResult] = useState<FishAnalysisResult | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isCurrentSaved, setIsCurrentSaved] = useState<boolean>(false);

  // Catch Log state with local storage
  const [catches, setCatches] = useState<CatchLogEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse catch log:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(catches));
    } catch (e) {
      console.warn('Failed to save catches to localStorage:', e);
    }
  }, [catches]);

  const handleAnalysisComplete = (result: FishAnalysisResult, imageUrl: string) => {
    setCurrentResult(result);
    setCurrentImageUrl(imageUrl);
    setIsCurrentSaved(false);
  };

  const handleResetScan = () => {
    setCurrentResult(null);
    setCurrentImageUrl(null);
    setAnalysisError(null);
    setIsCurrentSaved(false);
  };

  const handleSaveToLog = (customNotes?: string) => {
    if (!currentResult || !currentImageUrl) return;

    const newEntry: CatchLogEntry = {
      id: 'catch-' + Date.now(),
      timestamp: new Date().toISOString(),
      imagePreview: currentImageUrl,
      commonName: currentResult.commonName,
      scientificName: currentResult.scientificName,
      estimatedLengthInches: currentResult.estimatedLengthInches,
      verdict: currentResult.verdict,
      legalStatus: currentResult.californiaRegulations.legalStatus,
      isDangerous: currentResult.isDangerousOrVenomous,
      locationNotes: currentResult.waterHabitat,
      notes: customNotes,
    };

    setCatches((prev) => [newEntry, ...prev]);
    setIsCurrentSaved(true);
  };

  const handleDeleteCatch = (id: string) => {
    setCatches((prev) => prev.filter((c) => c.id !== id));
  };

  const handleClearAllCatches = () => {
    if (window.confirm('Clear all entries from your catch log?')) {
      setCatches([]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        catchCount={catches.length}
      />

      {/* Main Container with AnimatePresence */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'scanner' && (
            <motion.div
              key="scanner-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {currentResult && currentImageUrl ? (
                <AnalysisResultView
                  result={currentResult}
                  imageUrl={currentImageUrl}
                  onReset={handleResetScan}
                  onSaveToLog={handleSaveToLog}
                  isSaved={isCurrentSaved}
                />
              ) : (
                <FishScanner
                  onAnalysisComplete={handleAnalysisComplete}
                  isAnalyzing={isAnalyzing}
                  setIsAnalyzing={setIsAnalyzing}
                  analysisError={analysisError}
                  setAnalysisError={setAnalysisError}
                />
              )}
            </motion.div>
          )}

          {activeTab === 'regulations' && (
            <motion.div
              key="regulations-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <CaliforniaRegulationsDirectory />
            </motion.div>
          )}

          {activeTab === 'dangerGuide' && (
            <motion.div
              key="danger-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <DangerousSpeciesGuide />
            </motion.div>
          )}

          {activeTab === 'catchLog' && (
            <motion.div
              key="log-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <CatchLog
                catches={catches}
                onDeleteCatch={handleDeleteCatch}
                onClearAll={handleClearAllCatches}
                onSelectCatch={() => {}}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modern High-Tech Footer */}
      <footer className="border-t border-white/[0.06] bg-slate-950/80 backdrop-blur-xl text-slate-500 py-4 text-xs font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-bold">FishingApp</span>
            <span>•</span>
            <span className="text-cyan-400">YOLOv8-CalFish Local Engine</span>
            <span>•</span>
            <span>CCR Title 14 Regulations Compliance</span>
          </div>

          <div className="text-[11px] text-slate-500 text-center sm:text-right">
            Always verify local CDFW marine district depths, Marine Protected Area (MPA) closures, and emergency notices before harvesting.
          </div>
        </div>
      </footer>
    </div>
  );
};
