import { useState, useEffect } from 'react';
import { formatLocalizedNumber, getTranslation } from '../lib/translations';
import { Turtle, Rabbit } from 'lucide-react';
import { Volume2, VolumeX, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import {
  speakText,
  stopSpeaking,
  subscribeToSpeech,
  getTabSummarySpeechText,
  getGlobalSpeechRate,
  setGlobalSpeechRate,
  getVoiceAssistanceEnabled,
  subscribeToVoiceAssistance,
  getLocaleForLanguage,
  normalizeLanguageKey,
} from '../lib/speech';

interface AccessibleVoiceBarProps {
  activeTab: string;
  currentLang: string;
}

export function AccessibleVoiceBar({ activeTab, currentLang }: AccessibleVoiceBarProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => getVoiceAssistanceEnabled());
  const [speechRate, setSpeechRate] = useState<number>(() => getGlobalSpeechRate());
  const [isExpanded, setIsExpanded] = useState(true);
  const t = (key: string) => getTranslation(currentLang, key);

  useEffect(() => subscribeToVoiceAssistance(setVoiceEnabled), []);

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
      userInitiated: true,
    });
  };

  const handleToggleSpeed = () => {
    const newRate = speechRate === 0.8 ? 0.7 : 0.8;
    setSpeechRate(newRate);
    setGlobalSpeechRate(newRate);
  };

  const buttonText = t('voiceReadScreen');
  const locale = getLocaleForLanguage(currentLang);

  if (!voiceEnabled) return null;

  return (
    <aside
      aria-label={t('voiceAccessibilityLabel')}
      className="fixed bottom-20 md:bottom-4 right-3 sm:right-4 z-30 max-w-[calc(100vw-24px)] sm:max-w-sm"
    >
      <div className="bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl rounded-2xl p-2.5 sm:p-3 transition-all duration-200 flex flex-col gap-2">
        {/* TOP BAR / TOGGLE */}
        <div className="flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <span className="p-1 rounded-md bg-emerald-100 text-emerald-800">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-brand-700">
              {t('voiceHelper')}
            </span>
            <span className="text-[10px] font-semibold text-slate-400">({locale})</span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? t('voiceCollapse') : t('voiceExpand')}
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
                  <span>{t('voiceStopAudio')}</span>
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
              title={`${t('voiceSpeechRate')}: ${formatLocalizedNumber(speechRate, currentLang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`}
              className="px-2.5 py-2 rounded-xl text-[11px] font-extrabold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors shrink-0"
            >
              {speechRate === 0.7 ? <><Turtle className="inline h-3.5 w-3.5" /> {formatLocalizedNumber(0.7, currentLang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</> : <><Rabbit className="inline h-3.5 w-3.5" /> {formatLocalizedNumber(0.8, currentLang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</>}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
