import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Upload,
  RotateCw,
  Ruler,
  MapPin,
  Check,
  Fish,
  AlertTriangle,
  Cpu,
  Scan,
  Crosshair,
} from 'lucide-react';
import { FishAnalysisResult } from '../types';

interface FishScannerProps {
  onAnalysisComplete: (result: FishAnalysisResult, imageUrl: string) => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (analyzing: boolean) => void;
  analysisError: string | null;
  setAnalysisError: (err: string | null) => void;
}

const REFERENCE_OPTIONS = [
  { id: 'auto', label: 'Auto YOLO Proportion', desc: 'Neural anatomy aspect ratio' },
  { id: 'dollar', label: 'Dollar Bill (6.14")', desc: 'Standard US currency beside fish' },
  { id: 'can', label: 'Soda Can (4.83")', desc: '12 oz aluminum soda can' },
  { id: 'pliers', label: 'Fishing Pliers (~7.5")', desc: 'Standard saltwater pliers' },
  { id: 'rod', label: 'Rod Handle (~12-14")', desc: 'Cork or EVA foam rod grip' },
  { id: 'ruler', label: 'Measuring Tape / Board', desc: 'Ruler or deck decal in frame' },
  { id: 'custom', label: 'Known Measured Length', desc: 'Manual tape measure entry' },
];

export const FishScanner: React.FC<FishScannerProps> = ({
  onAnalysisComplete,
  isAnalyzing,
  setIsAnalyzing,
  analysisError,
  setAnalysisError,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [waterType, setWaterType] = useState<string>('California Ocean / Coastal Waters');
  const [referenceObj, setReferenceObj] = useState<string>('auto');
  const [manualLengthInput, setManualLengthInput] = useState<string>('');
  const [locationNotes, setLocationNotes] = useState<string>('');
  const [loadingStep, setLoadingStep] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAnalyzing) {
      setLoadingStep(1);
      timer = setInterval(() => {
        setLoadingStep((prev) => (prev < 3 ? prev + 1 : prev));
      }, 700);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  const startCamera = async () => {
    try {
      setAnalysisError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      setAnalysisError('Unable to access camera. Please allow camera permissions or upload a photo.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const switchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    stopCamera();
    setTimeout(() => startCamera(), 200);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setSelectedImage(dataUrl);
      stopCamera();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSelectedImage(event.target?.result as string);
        setAnalysisError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const runAnalysis = async () => {
    if (!selectedImage) {
      setAnalysisError('Please take a photo or select an image first.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const refLabel =
        referenceObj === 'custom' && manualLengthInput
          ? `User measured length: ${manualLengthInput} inches`
          : REFERENCE_OPTIONS.find((r) => r.id === referenceObj)?.label || 'Auto visual estimation';

      const response = await fetch('/api/identify-fish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: selectedImage,
          waterType,
          userLengthEstimate: manualLengthInput ? parseFloat(manualLengthInput) : undefined,
          referenceObject: refLabel,
          locationNotes,
          useLocalModel: true,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Fish analysis failed.');
      }

      onAnalysisComplete(data.data, selectedImage);
    } catch (err: any) {
      setAnalysisError(err.message || 'Error running local fish detection.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner HUD */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-950/90 border border-white/[0.08] p-5 shadow-2xl backdrop-blur-xl overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-mono font-bold">
                <Cpu className="w-3.5 h-3.5" />
                YOLOv8-CalFish Local Vision
              </span>
              <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                • 100% Standalone Offline
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              California Catch Scanner & Size Calibrator
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 max-w-2xl">
              Real-time YOLO classification, snout-to-tail millimeter estimation, and automated California CDFW Title 14 legal size and hazard evaluation.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 text-xs font-mono">
              <span className="text-slate-400 text-[10px] block uppercase font-bold">
                Mandatory CA Limits
              </span>
              <span className="text-cyan-400 font-bold">
                Halibut 22&quot; • Lingcod 22&quot; • Bass 14&quot;
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Scanner Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Viewfinder (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative rounded-2xl bg-slate-950 border border-white/[0.08] p-4 shadow-2xl overflow-hidden"
          >
            {/* Live Camera View */}
            {cameraActive ? (
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

                {/* Cyberpunk Reticle HUD */}
                <div className="absolute inset-0 pointer-events-none p-5 flex flex-col justify-between">
                  <div className="flex justify-between text-cyan-400/60 font-mono text-xs">
                    <span>┌ CAL_TARGET</span>
                    <span>FLIGHT_READY ┐</span>
                  </div>
                  <div className="self-center bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs text-cyan-300 font-mono border border-cyan-500/30">
                    Align fish horizontally: snout left, tail right
                  </div>
                  <div className="flex justify-between text-cyan-400/60 font-mono text-xs">
                    <span>└ SNOUT [0.0&quot;]</span>
                    <span>TAIL TIP ┘</span>
                  </div>
                </div>

                {/* Camera Action Buttons */}
                <div className="absolute bottom-5 inset-x-0 flex items-center justify-center gap-4">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={switchCamera}
                    className="p-3 rounded-full bg-slate-900/90 text-white hover:bg-slate-800 border border-white/10 shadow-lg cursor-pointer backdrop-blur-md"
                  >
                    <RotateCw className="w-5 h-5" />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={capturePhoto}
                    className="p-4 rounded-full bg-cyan-400 text-slate-950 font-bold shadow-[0_0_25px_rgba(6,182,212,0.6)] cursor-pointer"
                  >
                    <Camera className="w-6 h-6" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={stopCamera}
                    className="px-4 py-2 rounded-xl bg-rose-600/90 text-white text-xs font-bold hover:bg-rose-500 shadow-lg cursor-pointer"
                  >
                    Cancel
                  </motion.button>
                </div>
              </div>
            ) : selectedImage ? (
              /* Selected Image with High-Tech Laser Scanning Overlay */
              <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-white/[0.08]">
                <img src={selectedImage} alt="Catch" className="w-full h-full object-contain" />

                {/* Laser Scanning Animation */}
                {isAnalyzing && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <motion.div
                      animate={{ y: ['0%', '100%', '0%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_#22d3ee]"
                    />
                    <div className="absolute inset-0 bg-cyan-500/5 animate-pulse" />
                  </div>
                )}

                {/* Reticle Brackets */}
                <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between opacity-80">
                  <div className="flex justify-between text-cyan-400 font-mono text-sm">
                    <span>┌</span>
                    <span>┐</span>
                  </div>
                  <div className="flex justify-between text-cyan-400 font-mono text-sm">
                    <span>└</span>
                    <span>┘</span>
                  </div>
                </div>

                {/* Top Overlay Actions */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-xs font-bold text-slate-200 hover:text-white border border-white/10 shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Change
                  </button>
                  <button
                    onClick={startCamera}
                    className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-xs font-bold text-slate-200 hover:text-white border border-white/10 shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Camera
                  </button>
                </div>

                {/* Reference Tag */}
                <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded-md text-[11px] text-slate-300 font-mono flex items-center gap-2 border border-white/10">
                  <Ruler className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ref: {REFERENCE_OPTIONS.find((r) => r.id === referenceObj)?.label}</span>
                </div>
              </div>
            ) : (
              /* High-Tech Empty State Viewfinder */
              <div className="rounded-xl border border-dashed border-white/10 hover:border-cyan-500/40 transition-colors p-10 text-center flex flex-col items-center justify-center min-h-[320px] bg-white/[0.01]">
                <div className="relative w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                  <Crosshair className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">
                  Upload Fish Photo or Launch Camera
                </h3>
                <p className="text-xs text-slate-400 max-w-sm mb-6">
                  Position fish flat with mouth closed. Include a reference object (pliers, soda can, dollar bill, ruler) for precise millimeter calibration.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    Select Image File
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={startCamera}
                    className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold text-xs flex items-center gap-2 border border-white/10 transition-all cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Open Live Camera
                  </motion.button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            )}

            {/* Error Notification */}
            <AnimatePresence>
              {analysisError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Scanner Alert:</span>
                    {analysisError}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Right Settings & Calibration (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl bg-slate-900/90 border border-white/[0.08] p-5 shadow-2xl backdrop-blur-xl space-y-5"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              California Habitat & Optical Scale
            </h3>

            {/* California Habitat */}
            <div>
              <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Habitat / Fishing Zone
              </label>
              <select
                value={waterType}
                onChange={(e) => setWaterType(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="California Ocean / Coastal Waters">
                  California Ocean / Saltwater (Coastal & Island Reefs)
                </option>
                <option value="California Freshwater Lake / Reservoir">
                  California Freshwater (Lakes, Reservoirs, Trout Streams)
                </option>
                <option value="Sacramento-San Joaquin Delta / Rivers">
                  Sacramento-San Joaquin Delta & Anadromous Rivers
                </option>
                <option value="California Bay / Estuary (SF Bay / San Diego Bay)">
                  California Bays & Estuaries (SF Bay, San Diego, Newport)
                </option>
              </select>
            </div>

            {/* Reference Object Selection */}
            <div>
              <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Reference Marker for Length Calibration
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REFERENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReferenceObj(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      referenceObj === opt.id
                        ? 'bg-cyan-500/10 border-cyan-400/50 text-white shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span>{opt.label}</span>
                      {referenceObj === opt.id && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Length Input if chosen */}
            {referenceObj === 'custom' && (
              <div className="bg-slate-950 p-3 rounded-xl border border-white/10">
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Enter Your Measured Length (inches):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="100"
                    placeholder="e.g. 21.5"
                    value={manualLengthInput}
                    onChange={(e) => setManualLengthInput(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs font-bold text-cyan-400 font-mono">in</span>
                </div>
              </div>
            )}

            {/* Optional Location Notes */}
            <div>
              <label className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Port / GPS / Location Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Monterey Bay, Catalina Kelp, Lake Shasta"
                value={locationNotes}
                onChange={(e) => setLocationNotes(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Primary Action Button */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={runAnalysis}
              disabled={isAnalyzing || !selectedImage}
              className={`w-full py-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xl ${
                isAnalyzing || !selectedImage
                  ? 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 text-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.4)]'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span className="font-mono">
                    {loadingStep === 1 && 'Extracting YOLOv8 Features...'}
                    {loadingStep === 2 && 'Calibrating Snout-to-Tail Calipers...'}
                    {loadingStep >= 3 && 'Evaluating CDFW Title 14 Legal Rules...'}
                  </span>
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4" />
                  <span>Scan Catch with Local YOLO</span>
                </>
              )}
            </motion.button>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
