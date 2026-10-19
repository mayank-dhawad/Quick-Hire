import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock Web Speech API for JSDOM test environment
class MockSpeechSynthesisUtterance {
  text: string;
  lang: string = 'en-IN';
  pitch: number = 1.0;
  rate: number = 0.95;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(text: string = '') {
    this.text = text;
  }
}

const mockSpeechSynthesis = {
  speaking: false,
  paused: false,
  pending: false,
  cancel: vi.fn(),
  speak: vi.fn((utterance: MockSpeechSynthesisUtterance) => {
    mockSpeechSynthesis.speaking = true;
    setTimeout(() => {
      mockSpeechSynthesis.speaking = false;
      if (utterance.onend) utterance.onend();
    }, 10);
  }),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => [
    { name: 'Google हिन्दी', lang: 'hi-IN', default: false, localService: true, voiceURI: 'hi-IN' },
    { name: 'Google বাংলা', lang: 'bn-IN', default: false, localService: true, voiceURI: 'bn-IN' },
    { name: 'Google తెలుగు', lang: 'te-IN', default: false, localService: true, voiceURI: 'te-IN' },
    { name: 'Google Indian English', lang: 'en-IN', default: true, localService: true, voiceURI: 'en-IN' },
  ]),
};

Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: mockSpeechSynthesis,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  writable: true,
  value: MockSpeechSynthesisUtterance,
});
