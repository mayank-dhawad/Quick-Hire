import React, { useState } from 'react';
import { Download, X, Share, PlusSquare } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

interface PwaInstallBannerProps {
  currentLang?: string;
  forceShowIosHelp?: boolean;
  onCloseIosHelp?: () => void;
}

export function PwaInstallBanner({
  forceShowIosHelp = false,
  onCloseIosHelp,
}: PwaInstallBannerProps) {
  const { isInstallable, isIos, promptInstall, dismissPrompt } = usePwaInstall();
  const [showIosGuide, setShowIosGuide] = useState(forceShowIosHelp);
  const [installing, setInstalling] = useState(false);

  const shouldShow = isInstallable || forceShowIosHelp;

  if (!shouldShow && !showIosGuide) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
      return;
    }
    setInstalling(true);
    await promptInstall();
    setInstalling(false);
  };

  const handleDismiss = () => {
    dismissPrompt();
    setShowIosGuide(false);
    onCloseIosHelp?.();
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="bg-[#0f2942] text-white p-4 sm:p-5 rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF9933]/15 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white p-1 shrink-0 shadow-sm flex items-center justify-center">
              <img
                src="/icons/icon-192.png"
                alt="QuickHire App Logo"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-heading font-black text-sm sm:text-base text-white">
                  Quick<span className="text-[#FF9933]">Hire</span> App
                </h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Free
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 leading-snug">
                Install for instant offline access & 0% middleman commission.
              </p>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            aria-label="Dismiss installation prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* iOS Step-by-step Guide */}
        {(showIosGuide || isIos) && (
          <div className="mt-3 p-3 bg-white/10 rounded-xl border border-white/10 text-xs space-y-2 text-slate-200">
            <div className="font-bold text-white flex items-center gap-1.5">
              <span>Install on iPhone / iPad:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center font-bold text-[10px] text-white">
                1
              </span>
              <span className="flex items-center gap-1">
                Tap Safari&apos;s Share button <Share className="w-3.5 h-3.5 text-blue-400 inline mx-0.5" />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center font-bold text-[10px] text-white">
                2
              </span>
              <span className="flex items-center gap-1">
                Scroll and tap <strong className="text-white">Add to Home Screen</strong> <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline mx-0.5" />
              </span>
            </div>
          </div>
        )}

        {/* Action Button */}
        {!showIosGuide && !isIos && (
          <div className="mt-3.5 flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              disabled={installing}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-[#FF9933] to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-heading font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Download className="w-4 h-4" />
              <span>{installing ? 'Opening Installer...' : 'Install App to Device'}</span>
            </button>
            <button
              onClick={handleDismiss}
              className="py-2.5 px-3 bg-white/10 hover:bg-white/15 text-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

