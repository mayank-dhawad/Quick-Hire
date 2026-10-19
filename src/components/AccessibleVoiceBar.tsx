import { useState, useEffect } from 'react';
import { Volume2, VolumeX, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import {
  speakText,
  stopSpeaking,
  subscribeToSpeech,
  getTabSummarySpeechText,
  getGlobalSpeechRate,
  setGlobalSpeechRate,
  getLocaleForLanguage,
  normalizeLanguageKey,
} from '../lib/speech';

interface AccessibleVoiceBarProps {
  activeTab: string;
  currentLang: string;
}

export function AccessibleVoiceBar({ activeTab, currentLang }: AccessibleVoiceBarProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(() => getGlobalSpeechRate());
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToSpeech((speakingText) => {
      setIsSpeaking(Boolean(speakingText));
    });
    return unsubscribe;
  }, []);

  const handleReadScreen = () => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    const summaryText = getTabSummarySpeechText(activeTab, currentLang);
    speakText(summaryText, currentLang, {
      rate: speechRate,
    });
  };

  const handleToggleSpeed = () => {
    const newRate = speechRate === 0.8 ? 0.7 : 0.8;
    setSpeechRate(newRate);
    setGlobalSpeechRate(newRate);
  };

  const readLabels: Record<string, string> = {
    English: 'Read Screen Aloud',
    'हिंदी (Hindi)': 'यह स्क्रीन सुनें',
    'मराठी (Marathi)': 'हे पान ऐका',
    'বাংলা (Bengali)': 'এই পর্দা শুনুন',
    'తెలుగు (Telugu)': 'ఈ స్క్రీన్ వినండి',
  };

  const normalizedLang = normalizeLanguageKey(currentLang);
  const buttonText = readLabels[normalizedLang] || readLabels[currentLang] || readLabels['English'];
  const locale = getLocaleForLanguage(currentLang);

  return (
    <aside
      aria-label="Audio Accessibility Companion"
      className="fixed bottom-4 right-4 z-40 max-w-sm"
    >
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-2xl p-2.5 sm:p-3 transition-all duration-200 flex flex-col gap-2">
        {/* TOP BAR / TOGGLE */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <span className="p-1 rounded-md bg-emerald-100 text-emerald-800">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-brand-700">
              Voice Helper
            </span>
            <span className="text-[10px] font-semibold text-slate-400">({locale})</span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse voice bar' : 'Expand voice bar'}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {/* EXPANDABLE BODY */}
        {isExpanded && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            {/* MAIN READ SCREEN BUTTON */}
            <button
              type="button"
              onClick={handleReadScreen}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all shadow-xs ${
                isSpeaking
                  ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-300 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Stop Audio</span>
                  <span className="flex items-center gap-0.5 ml-1">
                    <span className="w-1 h-2 bg-white rounded-full animate-bounce" />
                    <span className="w-1 h-3 bg-white rounded-full animate-pulse" />
                  </span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{buttonText}</span>
                </>
              )}
            </button>

            {/* SPEED TOGGLE */}
            <button
              type="button"
              onClick={handleToggleSpeed}
              title={`Speech rate: ${speechRate}x. Click to toggle speed.`}
              className="px-2.5 py-2 rounded-xl text-[11px] font-extrabold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors shrink-0"
            >
              {speechRate === 0.7 ? '🐢 0.7x' : '🐇 0.8x'}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
