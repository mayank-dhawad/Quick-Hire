import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getVoiceAssistanceEnabled, setVoiceAssistanceEnabled, subscribeToVoiceAssistance } from '../lib/speech';

const labels: Record<string, { name: string; on: string; off: string }> = {
  English: { name: 'Voice assistance', on: 'On', off: 'Off' },
  'हिंदी (Hindi)': { name: 'आवाज़ सहायता', on: 'चालू', off: 'बंद' },
  'मराठी (Marathi)': { name: 'आवाज सहाय्य', on: 'चालू', off: 'बंद' },
  'বাংলা (Bengali)': { name: 'ভয়েস সহায়তা', on: 'চালু', off: 'বন্ধ' },
  'తెలుగు (Telugu)': { name: 'వాయిస్ సహాయం', on: 'ఆన్', off: 'ఆఫ్' },
};

export function VoiceAssistanceToggle({ currentLang = 'English' }: { currentLang?: string }) {
  const [enabled, setEnabled] = useState(() => getVoiceAssistanceEnabled());
  useEffect(() => subscribeToVoiceAssistance(setEnabled), []);
  const copy = labels[currentLang] || labels.English;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={copy.name}
      onClick={() => setVoiceAssistanceEnabled(!enabled)}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
      title={`${copy.name}: ${enabled ? copy.on : copy.off}`}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      <span className="hidden sm:inline">{copy.name}</span>
      <span>{enabled ? copy.on : copy.off}</span>
    </button>
  );
}
