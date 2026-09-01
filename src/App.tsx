import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Globe2,
  Hammer,
  Leaf,
  LockKeyhole,
  MapPin,
  Menu,
  Mic,
  Phone,
  ShieldCheck,
  Sparkles,
  Tractor,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Role = 'worker' | 'employer';
type Language = 'English' | 'हिंदी';

type Copy = {
  navHow: string;
  navWork: string;
  navSafety: string;
  login: string;
  eyebrow: string;
  headlineOne: string;
  headlineTwo: string;
  description: string;
  jobTitle: string;
  jobDescription: string;
  workerTitle: string;
  workerDescription: string;
  employerTitle: string;
  employerDescription: string;
  trust: string;
  modalWorker: string;
  modalEmployer: string;
  name: string;
  phone: string;
  village: string;
  submitWorker: string;
  submitEmployer: string;
  saved: string;
  close: string;
};

const copy: Record<Language, Copy> = {
  English: {
    navHow: 'How it works', navWork: 'Work types', navSafety: 'Safety', login: 'Login',
    eyebrow: 'Verified local work, without middlemen', headlineOne: 'Get hired near you.', headlineTwo: 'Paid the same day.',
    description: 'QuickHire shows verified work in your radius — agriculture, construction and daily labour. Employers get vetted workers nearby, paid through UPI.',
    jobTitle: 'I Want a Job', jobDescription: 'Verified work near you. Negotiate wages, get paid in your bank.',
    workerTitle: 'Find work', workerDescription: 'Search nearby jobs and get started today.',
    employerTitle: 'I Want a Worker', employerDescription: 'Post a job in 30 seconds. Get matched with verified local workers.',
    trust: 'Login with mobile number only. Works offline.', modalWorker: 'Find work near you', modalEmployer: 'Find workers near you',
    name: 'Your name', phone: 'Mobile number', village: 'Village or area', submitWorker: 'Show me nearby work', submitEmployer: 'Start hiring nearby', saved: 'You’re on the list', close: 'Close',
  },
  'हिंदी': {
    navHow: 'कैसे काम करता है', navWork: 'काम के प्रकार', navSafety: 'सुरक्षा', login: 'लॉगिन',
    eyebrow: 'बिना बिचौलिये के, आपके पास प्रमाणित काम', headlineOne: 'अपने पास काम पाएं।', headlineTwo: 'उसी दिन भुगतान पाएं।',
    description: 'QuickHire आपके आस-पास खेती, निर्माण और दिहाड़ी के प्रमाणित काम दिखाता है। नियोक्ताओं को पास के भरोसेमंद कामगार मिलते हैं और UPI से भुगतान होता है।',
    jobTitle: 'मुझे काम चाहिए', jobDescription: 'अपने पास प्रमाणित काम पाएं। मजदूरी तय करें और बैंक में भुगतान पाएं।',
    workerTitle: 'काम खोजें', workerDescription: 'पास के काम खोजें और आज ही शुरू करें।',
    employerTitle: 'मुझे कामगार चाहिए', employerDescription: '30 सेकंड में काम पोस्ट करें और पास के प्रमाणित कामगार पाएं।',
    trust: 'सिर्फ मोबाइल नंबर से लॉगिन। ऑफलाइन भी काम करता है।', modalWorker: 'अपने पास काम खोजें', modalEmployer: 'अपने पास कामगार खोजें',
    name: 'आपका नाम', phone: 'मोबाइल नंबर', village: 'गांव या क्षेत्र', submitWorker: 'पास का काम दिखाएं', submitEmployer: 'पास में भर्ती शुरू करें', saved: 'आप सूची में हैं', close: 'बंद करें',
  },
};

const workTypes = [
  { label: 'Agriculture', icon: Leaf, color: 'green' },
  { label: 'Construction', icon: Hammer, color: 'amber' },
  { label: 'Daily labour', icon: Users, color: 'blue' },
];

function App() {
  const [language, setLanguage] = useState<Language>('English');
  const [role, setRole] = useState<Role | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [form, setForm] = useState({ name: '', phone: '', village: '' });
  const t = copy[language];

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const openRole = (selectedRole: Role) => {
    setRole(selectedRole);
    setSaved(false);
    setForm({ name: '', phone: '', village: '' });
  };

  const submitInterest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!role || !form.name.trim() || !form.phone.trim() || !form.village.trim()) return;
    const payload = { role, name: form.name.trim(), phone: form.phone.trim(), village: form.village.trim() };
    localStorage.setItem('quickhire_interest', JSON.stringify(payload));
    if (supabase && online) {
      const { error } = await supabase.from('quickhire_interest').insert(payload);
      if (error) console.warn('QuickHire interest could not sync', error.message);
    }
    setSaved(true);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfcf8] text-[#18201b]">
      {!online && <div className="offline-bar"><Bell size={15} /> Offline mode — your details will sync when you’re back online.</div>}
      <nav className="nav-shell">
        <a className="brand" href="#top" aria-label="QuickHire home">
          <span className="brand-mark"><Check size={20} strokeWidth={3} /></span>
          <span>Quick <b>Hire</b></span>
        </a>
        <div className="desktop-nav">
          <a href="#how">{t.navHow}</a><a href="#work">{t.navWork}</a><a href="#safety">{t.navSafety}</a>
        </div>
        <div className="nav-actions">
          <button className="language-pill" onClick={() => setLanguage(language === 'English' ? 'हिंदी' : 'English')} aria-label="Change language">
            <Globe2 size={18} /><span>{language}</span><ChevronDown size={15} />
          </button>
          <button className="login-button" onClick={() => openRole('worker')}>{t.login}</button>
          <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"><Menu size={23} /></button>
        </div>
        {menuOpen && <div className="mobile-nav"><a href="#how" onClick={() => setMenuOpen(false)}>{t.navHow}</a><a href="#work" onClick={() => setMenuOpen(false)}>{t.navWork}</a><a href="#safety" onClick={() => setMenuOpen(false)}>{t.navSafety}</a></div>}
      </nav>

      <section id="top" className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse-dot" />{t.eyebrow}</div>
          <h1>{t.headlineOne}<br /><span>{t.headlineTwo}</span></h1>
          <p className="hero-description">{t.description}</p>
          <div className="choice-grid">
            <button className="choice-card worker-card" onClick={() => openRole('worker')}>
              <span className="choice-icon green-icon"><Tractor size={25} /></span>
              <span className="choice-content"><strong>{t.jobTitle}</strong><small>{t.jobDescription}</small><em>{t.workerTitle} <ArrowRight size={17} /></em></span>
            </button>
            <button className="choice-card employer-card" onClick={() => openRole('employer')}>
              <span className="choice-icon amber-icon"><WalletCards size={25} /></span>
              <span className="choice-content"><strong>{t.employerTitle}</strong><small>{t.employerDescription}</small><em>{t.submitEmployer.replace('Start hiring nearby', 'Post a job')} <ArrowRight size={17} /></em></span>
            </button>
          </div>
          <div className="trust-line"><LockKeyhole size={16} />{t.trust}</div>
        </div>

        <div className="hero-visual" aria-label="QuickHire platform benefits">
          <div className="glow glow-a" /><div className="glow glow-b" />
          <div className="visual-grid" />
          <div className="floating-card job-float"><span className="float-icon green-icon"><Leaf size={20} /></span><span><b>Harvesting work</b><small>Starts today · 6:30 AM</small></span><label>Agriculture <i>₹450/day</i></label></div>
          <div className="floating-card sos-float"><span className="float-icon red-icon"><Bell size={19} /></span><span><b>SOS</b><small>One-tap help</small></span></div>
          <div className="floating-card payment-float"><WalletCards size={18} /><span><b>₹850</b><small>via UPI</small></span></div>
          <div className="floating-card workers-float"><div className="avatars"><span>RS</span><span>AK</span><span>MP</span></div><b>3 workers matched</b><small>within 8 km <MapPin size={14} /></small></div>
          <div className="visual-caption"><Sparkles size={15} /> <span>Local work, made simple</span></div>
        </div>
      </section>

      <section id="work" className="work-strip"><div><span className="section-kicker">BUILT FOR REAL WORK</span><h2>From first tap to fair pay.</h2></div><div className="work-types">{workTypes.map(({ label, icon: Icon, color }) => <div className="type-item" key={label}><span className={`type-icon ${color}-icon`}><Icon size={20} /></span><span>{label}</span></div>)}</div></section>
      <section id="how" className="steps-section"><div className="section-heading"><span className="section-kicker">HOW IT WORKS</span><h2>Work that comes closer to home.</h2><p>Simple tools for workers and employers, built for every network and every village.</p></div><div className="steps-grid"><div><strong>01</strong><h3>Choose your path</h3><p>Tell us if you are looking for work or looking for people.</p></div><div><strong>02</strong><h3>Get matched nearby</h3><p>See verified opportunities within your chosen travel radius.</p></div><div><strong>03</strong><h3>Get paid fairly</h3><p>Agree on a wage and receive your payment through UPI or cash.</p></div></div></section>
      <footer id="safety"><div className="footer-brand"><span className="brand-mark"><Check size={18} strokeWidth={3} /></span><span>Quick <b>Hire</b></span></div><p><ShieldCheck size={17} /> Designed for safe, dignified local work.</p><span className="footer-help"><CircleHelp size={17} /> Need help? <u>Talk to us</u></span></footer>

      {role && <div className="modal-backdrop" onMouseDown={() => setRole(null)}><section className="interest-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close-button" onClick={() => setRole(null)} aria-label={t.close}><X size={20} /></button>{saved ? <div className="success-state"><span className="success-icon"><Check size={28} /></span><h2>{t.saved}</h2><p>{role === 'worker' ? 'We’ll show you verified opportunities near your village.' : 'We’ll help you find verified workers near your worksite.'}</p><button className="primary-submit" onClick={() => setRole(null)}>{t.close} <ArrowRight size={17} /></button></div> : <><div className="modal-icon">{role === 'worker' ? <Tractor size={27} /> : <Users size={27} />}</div><span className="section-kicker">QUICK START</span><h2>{role === 'worker' ? t.modalWorker : t.modalEmployer}</h2><p className="modal-intro">A few details help us show the right local match.</p><form onSubmit={submitInterest}><label>{t.name}<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={language === 'English' ? 'e.g. Ramesh Kumar' : 'जैसे रमेश कुमार'} /></label><label>{t.phone}<div className="phone-input"><span>+91</span><input required type="tel" inputMode="numeric" pattern="[0-9]{10}" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="98765 43210" /></div></label><label>{t.village}<input required value={form.village} onChange={(event) => setForm({ ...form, village: event.target.value })} placeholder={language === 'English' ? 'e.g. Nashik, Maharashtra' : 'जैसे नासिक, महाराष्ट्र'} /></label><button className="primary-submit" type="submit">{role === 'worker' ? t.submitWorker : t.submitEmployer} <ArrowRight size={18} /></button></form><div className="modal-note"><Phone size={15} /> No spam. We only use your number to connect you locally.</div></>}</section></div>}
    </main>
  );
}

export default App;
