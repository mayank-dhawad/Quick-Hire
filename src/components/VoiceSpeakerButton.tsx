import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { speakText, stopSpeaking, subscribeToSpeech } from '../lib/speech';

interface VoiceSpeakerButtonProps {
  text: string;
  lang?: string;
  label?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
}

export function VoiceSpeakerButton({
  text,
  lang = 'English',
  label,
  className = '',
  size = 'sm',
  showLabel = false,
}: VoiceSpeakerButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const clean = text.trim();
    // Subscribe to global speech state so active buttons sync perfectly
    const unsubscribe = subscribeToSpeech((speakingText) => {
      setIsPlaying(Boolean(speakingText && speakingText === clean));
    });
    return unsubscribe;
  }, [text]);

  const handleSpeak = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPlaying) {
      stopSpeaking();
      return;
    }

    speakText(text, lang);
  };

  const sizeClasses = {
    xs: 'p-1 text-xs',
    sm: 'p-1.5 text-xs',
    md: 'px-2.5 py-1.5 text-xs font-semibold gap-1.5',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  return (
    <button
      type="button"
      onClick={handleSpeak}
      title={label || 'Listen aloud'}
      aria-label={label || 'Listen aloud in audio'}
      className={`inline-flex items-center justify-center rounded-lg transition-all focus:outline-hidden ${sizeClasses[size]} ${
        isPlaying
          ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400 scale-105 shadow-xs'
          : 'bg-emerald-50 hover:bg-emerald-100 text-brand-600 hover:text-brand-700'
      } ${className}`}
    >
      {isPlaying ? (
        <span className="flex items-center gap-1">
          <VolumeX className={`${iconSizes[size]} text-amber-700 shrink-0`} />
          {/* Animated sound wave bars */}
          <span className="flex items-center gap-0.5 h-3">
            <span className="w-0.5 h-2 bg-amber-600 animate-pulse rounded-full" />
            <span className="w-0.5 h-3 bg-amber-700 animate-bounce rounded-full" />
            <span className="w-0.5 h-1.5 bg-amber-600 animate-pulse rounded-full" />
          </span>
          {showLabel && <span className="font-bold text-[10px] text-amber-800">Playing</span>}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Volume2 className={iconSizes[size]} />
          {showLabel && <span className="text-[11px] font-medium">Listen</span>}
        </span>
      )}
    </button>
  );
}
