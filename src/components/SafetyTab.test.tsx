import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { SafetyTab } from './SafetyTab';

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

describe('SafetyTab — Emergency Helplines & SOS Translation Verification', () => {
  it('renders proper user-friendly SOS section title and subtitle without raw translation keys', () => {
    const { container } = render(<SafetyTab currentLang="English" />);

    // Section title and subtitle
    expect(screen.getByRole('heading', { level: 2, name: /Emergency Helplines/i })).toBeInTheDocument();
    expect(screen.getByText(/Important emergency and support numbers available across India/i)).toBeInTheDocument();

    // Ensure raw keys are NOT present
    expect(container.textContent).not.toContain('sosTitle');
    expect(container.textContent).not.toContain('sosSubtitle');
  });

  it('renders all four emergency helpline cards with readable titles and descriptions', () => {
    const { container } = render(<SafetyTab currentLang="English" />);

    // Card 1: 112
    expect(screen.getByText('112')).toBeInTheDocument();
    expect(screen.getByText('National Emergency Helpline')).toBeInTheDocument();
    expect(screen.getByText('Police, fire and other emergencies.')).toBeInTheDocument();

    // Card 2: 108
    expect(screen.getByText('108')).toBeInTheDocument();
    expect(screen.getByText('Ambulance Emergency Service')).toBeInTheDocument();
    expect(screen.getByText('Medical emergencies and ambulance assistance.')).toBeInTheDocument();

    // Card 3: 1091
    expect(screen.getByText('1091')).toBeInTheDocument();
    expect(screen.getByText("Women's Helpline")).toBeInTheDocument();
    expect(screen.getByText('Assistance for women in distress.')).toBeInTheDocument();

    // Card 4: 1800-180-1551
    expect(screen.getByText('1800-180-1551')).toBeInTheDocument();
    expect(screen.getByText('Kisan Call Centre')).toBeInTheDocument();
    expect(screen.getByText('Agricultural information and support for farmers.')).toBeInTheDocument();

    // Ensure no raw card keys exist
    expect(container.textContent).not.toContain('sos112Title');
    expect(container.textContent).not.toContain('sos112Desc');
    expect(container.textContent).not.toContain('sos108Title');
    expect(container.textContent).not.toContain('sos108Desc');
    expect(container.textContent).not.toContain('sos1091Title');
    expect(container.textContent).not.toContain('sos1091Desc');
    expect(container.textContent).not.toContain('sosKisanTitle');
    expect(container.textContent).not.toContain('sosKisanDesc');
  });

  it('renders proper call button labels matching services and forbids "Call Worker" in SOS section', () => {
    const { container } = render(<SafetyTab currentLang="English" />);

    // Emergency Helpline Call Buttons
    expect(screen.getByText('Call Emergency Helpline — 112')).toBeInTheDocument();
    expect(screen.getByText('Call Ambulance — 108')).toBeInTheDocument();
    expect(screen.getByText("Call Women's Helpline — 1091")).toBeInTheDocument();
    expect(screen.getByText('Call Kisan Call Centre')).toBeInTheDocument();
    expect(screen.getByText('Call 14434')).toBeInTheDocument();

    // Forbid "Call Worker" anywhere in the Emergency Helplines section
    expect(container.textContent).not.toContain('Call Worker: 112');
    expect(container.textContent).not.toContain('Call Worker: 108');
    expect(container.textContent).not.toContain('Call Worker: 1091');
    expect(container.textContent).not.toContain('Call Worker');
  });

  it('ensures all emergency call buttons have correct tel: destinations and accessible attributes', () => {
    render(<SafetyTab currentLang="English" />);

    const call112 = screen.getByRole('link', { name: /Call Emergency Helpline — 112/i });
    expect(call112).toHaveAttribute('href', 'tel:112');

    const call108 = screen.getByRole('link', { name: /Call Ambulance — 108/i });
    expect(call108).toHaveAttribute('href', 'tel:108');

    const call1091 = screen.getByRole('link', { name: /Call Women's Helpline — 1091/i });
    expect(call1091).toHaveAttribute('href', 'tel:1091');

    const callKisan = screen.getByRole('link', { name: /Call Kisan Call Centre/i });
    expect(callKisan).toHaveAttribute('href', 'tel:18001801551');

    const callShramik = screen.getByRole('link', { name: /Call 14434/i });
    expect(callShramik).toHaveAttribute('href', 'tel:14434');
  });

  it('translates emergency helpline section and cards properly when language is set to Hindi', () => {
    const { container } = render(<SafetyTab currentLang="हिंदी (Hindi)" />);

    // Hindi Section Title & Cards
    expect(screen.getByText('आपातकालीन हेल्पलाइन')).toBeInTheDocument();
    expect(screen.getByText('राष्ट्रीय आपातकालीन हेल्पलाइन')).toBeInTheDocument();
    expect(screen.getByText('एम्बुलेंस आपातकालीन सेवा')).toBeInTheDocument();
    expect(screen.getByText('महिला हेल्पलाइन')).toBeInTheDocument();
    expect(screen.getByText('किसान कॉल सेंटर')).toBeInTheDocument();

    // Hindi Button Labels
    expect(screen.getByText('आपातकालीन हेल्पलाइन पर कॉल करें — 112')).toBeInTheDocument();
    expect(screen.getByText('एम्बुलेंस को कॉल करें — 108')).toBeInTheDocument();
    expect(screen.getByText('महिला हेल्पलाइन पर कॉल करें — 1091')).toBeInTheDocument();
    expect(screen.getByText('किसान कॉल सेंटर पर कॉल करें')).toBeInTheDocument();

    // Zero raw keys
    expect(container.textContent).not.toContain('sosTitle');
    expect(container.textContent).not.toContain('sosSubtitle');
    expect(container.textContent).not.toContain('sos112Title');
    expect(container.textContent).not.toContain('callEmergency112');
  });
});

