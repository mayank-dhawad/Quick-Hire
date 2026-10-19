import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeLanguageKey,
  getLocaleForLanguage,
  getVoiceGuidance,
  getJobSpeechText,
  getWorkerSpeechText,
  getTabSummarySpeechText,
  speakText,
  stopSpeaking,
  isSpeechSupported,
  setGlobalSpeechRate,
  getGlobalSpeechRate,
} from './speech';

describe('Voice & Accessibility Helper Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeLanguageKey', () => {
    it('accurately resolves variations of language names to canonical form', () => {
      expect(normalizeLanguageKey('English')).toBe('English');
      expect(normalizeLanguageKey('en')).toBe('English');
      expect(normalizeLanguageKey('hindi')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguageKey('hi-IN')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguageKey('हिंदी')).toBe('हिंदी (Hindi)');
      expect(normalizeLanguageKey('marathi')).toBe('मराठी (Marathi)');
      expect(normalizeLanguageKey('mr-IN')).toBe('मराठी (Marathi)');
      expect(normalizeLanguageKey('मराठी')).toBe('मराठी (Marathi)');
      expect(normalizeLanguageKey('bengali')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguageKey('bangla')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguageKey('bn-IN')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguageKey('বাংলা')).toBe('বাংলা (Bengali)');
      expect(normalizeLanguageKey('telugu')).toBe('తెలుగు (Telugu)');
      expect(normalizeLanguageKey('te-IN')).toBe('తెలుగు (Telugu)');
      expect(normalizeLanguageKey('తెలుగు')).toBe('తెలుగు (Telugu)');
      expect(normalizeLanguageKey('')).toBe('English');
      expect(normalizeLanguageKey('unsupported')).toBe('English');
    });
  });

  describe('getLocaleForLanguage', () => {
    it('returns the appropriate BCP 47 locale code for speech synthesis', () => {
      expect(getLocaleForLanguage('English')).toBe('en-IN');
      expect(getLocaleForLanguage('हिंदी (Hindi)')).toBe('hi-IN');
      expect(getLocaleForLanguage('मराठी (Marathi)')).toBe('mr-IN');
      expect(getLocaleForLanguage('বাংলা (Bengali)')).toBe('bn-IN');
      expect(getLocaleForLanguage('తెలుగు (Telugu)')).toBe('te-IN');
    });

    it('falls back to en-IN for unknown languages', () => {
      expect(getLocaleForLanguage('NonExistentLang')).toBe('en-IN');
    });
  });

  describe('getVoiceGuidance', () => {
    it('returns contextual guidance across all supported languages', () => {
      const guidanceEn = getVoiceGuidance('phoneInput', 'English');
      expect(guidanceEn).toContain('ten digit mobile phone number');

      const guidanceHi = getVoiceGuidance('phoneInput', 'हिंदी (Hindi)');
      expect(guidanceHi).toContain('मोबाइल फोन नंबर');

      const guidanceMr = getVoiceGuidance('bankAccountNo', 'मराठी (Marathi)');
      expect(guidanceMr.length).toBeGreaterThan(0);

      const guidanceBn = getVoiceGuidance('workerSkills', 'বাংলা (Bengali)');
      expect(guidanceBn.length).toBeGreaterThan(0);

      const guidanceTe = getVoiceGuidance('dailyWage', 'తెలుగు (Telugu)');
      expect(guidanceTe.length).toBeGreaterThan(0);
    });

    it('falls back gracefully to English guidance if language key is missing', () => {
      const fallback = getVoiceGuidance('phoneInput', 'UnknownLang');
      expect(fallback).toContain('ten digit mobile phone number');
    });
  });

  describe('Spoken text generators', () => {
    it('generates proper job announcement speech text with wages and location', () => {
      const sampleJob = {
        title: 'Tractor Driver Needed',
        category: 'Agriculture',
        offered_wages: 800,
        required_skills: ['Tractor Driving', 'Ploughing'],
        description: 'Location: Rampur Village | Workers needed: 2',
      };

      const speechTextEn = getJobSpeechText(sampleJob, 'English');
      expect(speechTextEn).toContain('Tractor Driver Needed');
      expect(speechTextEn).toContain('Agriculture');
      expect(speechTextEn).toContain('800');

      const speechTextHi = getJobSpeechText(sampleJob, 'हिंदी (Hindi)');
      expect(speechTextHi).toContain('800');
      expect(speechTextHi).toContain('Agriculture');
    });

    it('generates proper worker profile announcement speech text', () => {
      const sampleWorker = {
        category: 'Construction',
        skills: ['Masonry', 'Plastering'],
        experience_years: 5,
        profiles: { full_name: 'Suresh Kumar' },
      };

      const speechTextEn = getWorkerSpeechText(sampleWorker, 'English');
      expect(speechTextEn).toContain('Suresh Kumar');
      expect(speechTextEn).toContain('Construction');
      expect(speechTextEn).toContain('5');

      const speechTextMr = getWorkerSpeechText(sampleWorker, 'मराठी (Marathi)');
      expect(speechTextMr).toContain('Suresh Kumar');
      expect(speechTextMr).toContain('5');
    });

    it('generates tab summary speech text for navigation aid', () => {
      const homeSummary = getTabSummarySpeechText('home', 'English');
      expect(homeSummary).toContain('QuickHire Home');

      const workersSummary = getTabSummarySpeechText('workers', 'हिंदी (Hindi)');
      expect(workersSummary).toContain('डायरेक्टरी');
    });
  });

  describe('speakText and speech rate control', () => {
    it('recognizes speech synthesis capability in test environment', () => {
      expect(isSpeechSupported()).toBe(true);
    });

    it('adjusts and preserves global speech rate', () => {
      setGlobalSpeechRate(0.85);
      expect(getGlobalSpeechRate()).toBe(0.85);

      setGlobalSpeechRate(1.1);
      expect(getGlobalSpeechRate()).toBe(1.1);
    });

    it('invokes window.speechSynthesis.speak with proper locale and rate', () => {
      speakText('नमस्ते QuickHire', 'हिंदी (Hindi)');

      expect(window.speechSynthesis.cancel).toHaveBeenCalled();
      expect(window.speechSynthesis.speak).toHaveBeenCalled();

      const lastCallArg = vi.mocked(window.speechSynthesis.speak).mock.calls[0][0];
      expect(lastCallArg.text).toBe('नमस्ते QuickHire');
      expect(lastCallArg.lang).toBe('hi-IN');
    });

    it('does not crash or speak on empty text', () => {
      speakText('   ', 'English');
      expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    });

    it('allows cancelling speech via stopSpeaking', () => {
      stopSpeaking();
      expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    });
  });
});
