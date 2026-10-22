import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import { User } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Briefcase,
  Sparkles,
  Check,
  Globe2,
  UserCheck,
  PhoneCall,
  Menu,
  X,
  Building2,
  Phone,
  AlertTriangle,
  Landmark
} from 'lucide-react';
import { Auth } from './components/Auth';
import { WorkerDiscoveryModal, WorkerItem } from './components/WorkerDiscoveryModal';
import { WorkerProfileModal } from './components/WorkerProfileModal';
import { PostEquipmentModal, EquipmentItem } from './components/PostEquipmentModal';
import { DirectPaymentModal } from './components/DirectPaymentModal';
import { speakText, getVoiceGuidance } from './lib/speech';
import { VoiceSpeakerButton } from './components/VoiceSpeakerButton';
import { AccessibleVoiceBar } from './components/AccessibleVoiceBar';
import {
  isLiveSmsEnabled,
  toggleLiveSms,
  subscribeToSmsConfig,
  getSmsStatusLabel
} from './lib/smsConfig';
import { extractErrorMessage } from './lib/errorHandler';

// Lazy-loaded tabs
const HomeTab = lazy(() => import('./components/HomeTab'));
const WorkersTab = lazy(() => import('./components/WorkersTab'));
const EquipmentRentalTab = lazy(() => import('./components/EquipmentRentalTab'));
const PostJobTab = lazy(() => import('./components/PostJobTab'));
const DashboardTab = lazy(() => import('./components/DashboardTab'));
const BankDetailsTab = lazy(() => import('./components/BankDetailsTab'));
const SafetyTab = lazy(() => import('./components/SafetyTab'));

type WorkerCategory = 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed';
type ActiveTab = 'home' | 'workers' | 'equipment' | 'post-job' | 'my-jobs' | 'dashboard' | 'bank' | 'safety';

interface JobItem {
  id: string;
  title: string;
  category: WorkerCategory;
  required_skills: string[];
  offered_wages: number;
  description: string | null;
  status: string | null;
  created_at: string;
  employer_id: string;
}

interface JobRecordItem {
  id: string;
  worker_id?: string;
  status: string;
  created_at: string;
  workers?: {
    id?: string;
    profiles?: {
      id?: string;
      phone_number?: string | null;
      full_name?: string | null;
    } | null;
  } | null;
}

interface PostedJobItem {
  id: string;
  title: string;
  category: WorkerCategory;
  offered_wages: number;
  description: string | null;
  status: string;
  created_at: string;
  job_records?: JobRecordItem[];
}

import { translations } from './lib/translations';

interface SmsAdminToggleBadgeProps {
  onToggled?: (isLive: boolean) => void;
  className?: string;
}

export function SmsAdminToggleBadge({ onToggled, className = '' }: SmsAdminToggleBadgeProps) {
  const [isLive, setIsLive] = useState<boolean>(() => isLiveSmsEnabled());

  useEffect(() => {
    setIsLive(isLiveSmsEnabled());
    return subscribeToSmsConfig((enabled) => {
      setIsLive(enabled);
    });
  }, []);

  const handleClick = () => {
    const next = toggleLiveSms();
    setIsLive(next);
    if (onToggled) {
      onToggled(next);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Admin Control: Click to toggle between Live Fast2SMS delivery and SMS Demo Mode (saves credits)"
      aria-label="Toggle Fast2SMS Provider Mode"
      className={`group px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-2 cursor-pointer select-none shadow-lg border backdrop-blur-md ${
        isLive
          ? 'bg-slate-900/95 text-emerald-300 border-emerald-500/60 hover:bg-slate-900 hover:border-emerald-400 hover:shadow-emerald-950/40 ring-1 ring-emerald-500/20'
          : 'bg-slate-900/95 text-slate-200 border-slate-700 hover:bg-slate-800 hover:border-slate-500 hover:shadow-slate-900/40 ring-1 ring-slate-700/20'
      } ${className}`}
    >
      <span className="relative flex h-2.5 w-2.5 items-center justify-center shrink-0">
        {isLive ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
        )}
      </span>
      <span className="tracking-tight whitespace-nowrap">
        {getSmsStatusLabel(isLive)}
      </span>
    </button>
  );
}

const COMMON_SKILLS_BY_CATEGORY: Record<WorkerCategory, string[]> = {
  Agriculture: ['Harvesting', 'Tractor Driving', 'Crop Sowing', 'Weeding', 'Pesticide Spraying', 'Orchard Pruning'],
  Construction: ['Masonry', 'Plastering', 'Concrete Mixing', 'Tile Laying', 'Bar Bending', 'Scaffolding'],
  'Daily work': ['Loading / Unloading', 'Market Porter', 'Warehouse Helper', 'Field Clearing', 'Packaging'],
  'Skilled self-employed': ['Electrician', 'Plumber', 'Carpenter', 'Welder', 'Borewell Mechanic', 'Painter']
};

const INITIAL_EQUIPMENT_DATA: EquipmentItem[] = [
  {
    id: 'equip-agri-1',
    owner_id: 'owner-ramesh-1',
    title: 'Mahindra 575 DI Tractor with Rotavator & Plough',
    category: 'Agriculture',
    daily_rent: 1800,
    deposit_required: 2000,
    location: 'Rampur Village, Block 4',
    status: 'available',
    description: '45 HP Diesel Tractor with 6-feet rotavator, well-serviced. Experienced driver available on request.',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    owner_name: 'Rameshwar Patil',
    owner_phone: '9822012345',
  },
  {
    id: 'equip-agri-2',
    owner_id: 'owner-suresh-2',
    title: 'High-Pressure 500L Orchard Power Sprayer (Tractor Mounted)',
    category: 'Agriculture',
    daily_rent: 900,
    deposit_required: 1000,
    location: 'Shivar Mala, Sector B',
    status: 'available',
    description: '500-liter chemical tank with 150m delivery hose, perfect for pomegranate and mango orchards.',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    owner_name: 'Suresh More',
    owner_phone: '9421098765',
  },
  {
    id: 'equip-const-1',
    owner_id: 'owner-ganesh-3',
    title: 'Heavy-Duty 1-Bag Concrete Mixer Machine (Diesel Engine)',
    category: 'Construction',
    daily_rent: 1400,
    deposit_required: 1500,
    location: 'Bypass Road, Ward 2',
    status: 'available',
    description: 'Greaves 5HP diesel engine, tilt drum, mobile towing wheels for house foundations and slab casting.',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    owner_name: 'Ganesh Construction Works',
    owner_phone: '9890123456',
  },
  {
    id: 'equip-const-2',
    owner_id: 'owner-santosh-4',
    title: 'Concrete Needle Vibrator & Earth Compactor Plate',
    category: 'Construction',
    daily_rent: 650,
    deposit_required: 500,
    location: 'Khadki Gate, Main Bazar',
    status: 'available',
    description: 'Petrol engine plate rammer for trench compaction and 40mm poker vibrator.',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    owner_name: 'Santosh Jadhav',
    owner_phone: '9765432109',
  },
  {
    id: 'equip-daily-1',
    owner_id: 'owner-anil-5',
    title: 'Hydraulic Pallet Jack & 1.5-Ton Heavy Material Trolley',
    category: 'Daily work',
    daily_rent: 400,
    deposit_required: 500,
    location: 'Market Yard Warehouse Road',
    status: 'available',
    description: 'Heavy duty steel hand pallet truck for APMC market grains, godown unloading, and bag transport.',
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    owner_name: 'Anil Grain Transport',
    owner_phone: '9922334455',
  },
  {
    id: 'equip-skilled-1',
    owner_id: 'owner-pravin-6',
    title: '250A Portable Arc Inverter Welding Machine & Cutting Set',
    category: 'Skilled self-employed',
    daily_rent: 550,
    deposit_required: 500,
    location: 'MIDC Gate, Industrial Colony',
    status: 'available',
    description: 'Single phase IGBT inverter welder with 10m heavy cables, chipping hammer, and face shield.',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    owner_name: 'Pravin Welding & Fabrication',
    owner_phone: '9860112233',
  },
  {
    id: 'equip-skilled-2',
    owner_id: 'owner-vikram-7',
    title: 'Rotary Hammer Drill & 1500W Demolition Breaker',
    category: 'Skilled self-employed',
    daily_rent: 600,
    deposit_required: 800,
    location: 'Navi Peth, Main Square',
    status: 'available',
    description: 'Bosch heavy breaker with pointed and flat chisels for wall breaking and electrical channelling.',
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    owner_name: 'Vikram Electricals',
    owner_phone: '9823456780',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [currentLang, setCurrentLang] = useState<string>(() => {
    return localStorage.getItem('quickhire_lang') || 'English';
  });
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Modals state
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isJobModalOpen, setIsJobModalOpen] = useState(false);
  const [showEmployerDashboard, setShowEmployerDashboard] = useState(false);
  const [discoveryCategory, setDiscoveryCategory] = useState<string>('All');
  const [discoverySkill, setDiscoverySkill] = useState<string>('');

  // Compatibility aliases
  const setIsWorkerProfileOpen = setIsWorkerModalOpen;

  // Auth & user state
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [userRole, setUserRole] = useState<'worker' | 'employer' | null>(null);

  // Workers directory state
  const [directoryWorkers, setDirectoryWorkers] = useState<WorkerItem[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Equipment tab state
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [selectedEquipCategory, setSelectedEquipCategory] = useState<string>('All');
  const [equipSearchQuery, setEquipSearchQuery] = useState('');
  const [isPostEquipModalOpen, setIsPostEquipModalOpen] = useState(false);

  // Direct Bank Settlement Modal state
  const [directPaymentModal, setDirectPaymentModal] = useState<{
    isOpen: boolean;
    recipientId: string;
    recipientName: string;
    recipientPhone?: string | null;
    paymentForType: 'worker_wage' | 'machine_rental';
    referenceId?: string | null;
    defaultAmount?: number;
  }>({
    isOpen: false,
    recipientId: '',
    recipientName: '',
    paymentForType: 'worker_wage',
    defaultAmount: 500,
  });

  interface ToastItem {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // GIGW Accessibility Font Size state ('normal' | 'large' | 'larger')
  const [fontSizeZoom, setFontSizeZoom] = useState<'normal' | 'large' | 'larger'>('normal');

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success', speak = true) => {
      const id = 'toast_' + Date.now();
      setToasts((prev) => [...prev, { id, message, type }]);
      if (speak) {
        speakText(message, currentLang);
      }
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    [currentLang]
  );

  // Real-time SMS toggle toast notification handler
  const handleSmsToggleNotice = useCallback((isLive: boolean) => {
    if (isLive) {
      showToast('Live SMS: ON 🟢 — Fast2SMS active. Real text messages enabled.', 'success');
    } else {
      showToast('SMS Demo Mode ⚪ — Network calls skipped. OTP shown on-screen (wallet credits saved).', 'info');
    }
  }, [showToast]);

  // Jobs feed state
  const [activeJobs, setActiveJobs] = useState<JobItem[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());

  // Post a Job form state
  const [employerTitle, setEmployerTitle] = useState('');
  const [employerCategory, setEmployerCategory] = useState<WorkerCategory>('Agriculture');
  const [employerSkills, setEmployerSkills] = useState('');
  const [employerWage, setEmployerWage] = useState('');
  const [employerCount, setEmployerCount] = useState('1');
  const [employerLocation, setEmployerLocation] = useState('');
  const [employerDescription, setEmployerDescription] = useState('');
  const [isPostingJob, setIsPostingJob] = useState(false);

  // Employer Dashboard state
  const [myPostedJobs, setMyPostedJobs] = useState<PostedJobItem[]>([]);
  const [loadingMyJobs, setLoadingMyJobs] = useState(false);

  const languages = ['English', 'हिंदी (Hindi)', 'मराठी (Marathi)', 'বাংলা (Bengali)', 'తెలుగు (Telugu)'];
  const t = useCallback((key: string): string => {
    return translations[currentLang]?.[key] || translations['English'][key] || key;
  }, [currentLang]);

  const handleLangChange = (lang: string) => {
    setCurrentLang(lang);
    localStorage.setItem('quickhire_lang', lang);
    setLangMenuOpen(false);

    // Provide immediate audio confirmation in the newly chosen language
    const langConfirmations: Record<string, string> = {
      English: 'English language selected.',
      'हिंदी (Hindi)': 'हिंदी भाषा चुनी गई है।',
      'मराठी (Marathi)': 'मराठी भाषा निवडली आहे.',
      'বাংলা (Bengali)': 'বাংলা ভাষা নির্বাচিত হয়েছে।',
      'తెలుగు (Telugu)': 'తెలుగు భాష ఎంపిక చేయబడింది.',
    };
    if (langConfirmations[lang]) {
      speakText(langConfirmations[lang], lang);
    }
  };

  // Fetch open jobs
  const fetchOpenJobs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, category, required_skills, offered_wages, description, status, created_at, employer_id')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setActiveJobs(data as unknown as JobItem[]);
      }
    } catch {
      // Ignore network errors gracefully
    }
  }, []);

  // Fetch directory workers
  const fetchWorkers = useCallback(async () => {
    setWorkersLoading(true);
    try {
      let query = supabase
        .from('workers')
        .select(`
          id, category, skills, experience_years, daily_wage, experience_description, preferred_work_location, availability_status, average_rating, is_available,
          profiles ( id, full_name, phone_number, is_assisted_profile, location, village, district, state )
        `)
        .eq('is_available', true);

      if (selectedCategory !== 'All') {
        query = query.eq('category', selectedCategory as WorkerCategory);
      }

      let { data, error } = await query;
      if (error && (error.code === '42703' || String(error.message).includes('column'))) {
        const fallbackRes = await supabase
          .from('workers')
          .select(`
            id, category, skills, experience_years, average_rating, is_available,
            profiles ( id, full_name, phone_number, is_assisted_profile )
          `)
          .eq('is_available', true);
        data = fallbackRes.data as any;
        error = fallbackRes.error;
      }

      if (!error && data) {
        setDirectoryWorkers(data as unknown as WorkerItem[]);
      }
    } catch {
      // Ignore network errors gracefully
    } finally {
      setWorkersLoading(false);
    }
  }, [selectedCategory]);

  // Fetch jobs posted by the logged-in employer
  const fetchMyPostedJobs = useCallback(async (currentUserId: string) => {
    setLoadingMyJobs(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id, title, category, offered_wages, description, status, created_at,
          job_records (
            id, status, created_at,
            workers (
              profiles ( phone_number, full_name )
            )
          )
        `)
        .eq('employer_id', currentUserId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setMyPostedJobs(data as unknown as PostedJobItem[]);
      }
    } catch {
      // Ignore network errors gracefully
    } finally {
      setLoadingMyJobs(false);
    }
  }, []);

  interface RawEquipmentQuery {
    id: string;
    owner_id: string;
    title: string;
    category: WorkerCategory;
    description: string | null;
    daily_rent?: number | null;
    daily_rate?: number | null;
    deposit_required?: number | null;
    location: string;
    status?: string | null;
    created_at: string;
    profiles?: {
      id?: string;
      full_name?: string | null;
      phone_number?: string | null;
    } | null;
  }

  // Fetch equipment listings
  const fetchEquipment = useCallback(async () => {
    setEquipmentLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          id, owner_id, title, category, description, daily_rent, deposit_required, location, status, created_at, updated_at,
          profiles:owner_id ( id, full_name, phone_number, upi_id, bank_account_no, bank_ifsc, bank_name )
        `)
        .order('created_at', { ascending: false });

      let localEquip: EquipmentItem[] = [];
      try {
        const stored = localStorage.getItem('quickhire_user_equipment');
        if (stored) localEquip = JSON.parse(stored);
      } catch {
        // Ignore
      }

      if (error || !data || data.length === 0) {
        const merged = [...localEquip];
        for (const item of INITIAL_EQUIPMENT_DATA) {
          if (!merged.some((m) => m.id === item.id)) {
            merged.push(item);
          }
        }
        setEquipmentList(merged);
      } else {
        const mapped: EquipmentItem[] = (data as unknown as RawEquipmentQuery[]).map((d) => ({
          id: d.id,
          owner_id: d.owner_id,
          title: d.title,
          category: d.category,
          description: d.description,
          daily_rent: Number(d.daily_rent ?? d.daily_rate ?? 0),
          deposit_required: d.deposit_required ? Number(d.deposit_required) : 0,
          daily_rate: Number(d.daily_rent ?? d.daily_rate ?? 0),
          security_deposit: d.deposit_required ? Number(d.deposit_required) : 0,
          location: d.location,
          status: (d.status as 'available' | 'rented' | 'maintenance') || 'available',
          created_at: d.created_at || new Date().toISOString(),
          owner_name: d.profiles?.full_name || 'Verified Machine Owner',
          owner_phone: d.profiles?.phone_number || '',
          profiles: d.profiles,
        }));

        const merged = [...localEquip];
        for (const item of mapped) {
          if (!merged.some((m) => m.id === item.id)) {
            merged.push(item);
          }
        }
        for (const seed of INITIAL_EQUIPMENT_DATA) {
          if (!merged.some((m) => m.id === seed.id)) {
            merged.push(seed);
          }
        }
        setEquipmentList(merged);
      }
    } catch {
      setEquipmentList(INITIAL_EQUIPMENT_DATA);
    } finally {
      setEquipmentLoading(false);
    }
  }, []);

  // Authenticated data fetcher - ONLY runs after user is authenticated
  const fetchUserData = useCallback(async (activeUser: User) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, account_status')
        .eq('id', activeUser.id)
        .single();
      if (profile?.role) {
        setUserRole(profile.role as 'worker' | 'employer');
      }

      // Restore applied jobs from database so interest remains persistent across logins & reloads
      const { data: appliedRecords } = await supabase
        .from('job_records')
        .select('job_id')
        .eq('worker_id', activeUser.id);
      if (appliedRecords && appliedRecords.length > 0) {
        setAppliedJobIds(new Set(appliedRecords.map((r) => r.job_id)));
      } else {
        setAppliedJobIds(new Set());
      }

      if (profile?.account_status === 'deactivated') {
        // Soft-delete restoration: restore account_status to active
        await supabase
          .from('profiles')
          .update({ account_status: 'active' })
          .eq('id', activeUser.id);

        if (profile.role === 'worker') {
          await supabase
            .from('workers')
            .update({ is_available: true })
            .eq('id', activeUser.id);
        }
        showToast(t('accountRestoredSuccess'), 'success');
      }
    } catch {
      // Ignore
    }
    fetchOpenJobs();
    fetchWorkers();
    fetchEquipment();
    fetchMyPostedJobs(activeUser.id);
  }, [fetchOpenJobs, fetchWorkers, fetchEquipment, fetchMyPostedJobs, showToast, t]);

  // Handle soft-delete account deactivation with data retention
  const handleDeactivateAccount = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('quickhire_user_session');
      localStorage.removeItem('quickhire_user_role');
      setUser(null);
      setUserRole(null);
      setAppliedJobIds(new Set());
      setMyPostedJobs([]);
      setDirectoryWorkers([]);
      setEquipmentList([]);
      setActiveJobs([]);
      setIsWorkerModalOpen(false);
      showToast(t('accountDeactivatedSuccess'), 'info');
    } catch (err) {
      console.error('Error during deactivation sign out:', err);
    }
  }, [showToast, t]);

  // Auth listener & session check
  useEffect(() => {
    const getStoredFallbackUser = (): User | null => {
      try {
        const stored = localStorage.getItem('quickhire_user_session');
        if (stored) return JSON.parse(stored);
      } catch {
        // Ignore JSON error
      }
      return null;
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? getStoredFallbackUser();
      setUser(currentUser);
      setAuthChecking(false);
      if (currentUser) {
        fetchUserData(currentUser);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? getStoredFallbackUser();
      setUser(currentUser);
      setAuthChecking(false);
      if (currentUser) {
        fetchUserData(currentUser);
      } else {
        setUserRole(null);
        setMyPostedJobs([]);
        setDirectoryWorkers([]);
        setEquipmentList([]);
        setActiveJobs([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  // Refetch workers on category change only if user is logged in
  useEffect(() => {
    if (user) {
      fetchWorkers();
    }
  }, [fetchWorkers, user]);

  // Handle worker expression of interest
  const handleApplyForJob = async (jobId: string) => {
    if (!user) {
      setIsLoginOpen(true);
      return;
    }

    try {
      const { error: applyError } = await supabase
        .from('job_records')
        .insert([{ job_id: jobId, worker_id: user.id, status: 'contacted' }]);

      if (applyError) {
        if (applyError.code === '23505') {
          showToast('You have already applied for this job!', 'info');
          setAppliedJobIds((prev) => new Set(prev).add(jobId));
        } else {
          throw applyError;
        }
      } else {
        showToast('Interest recorded! The employer can now call you directly.', 'success');
        setAppliedJobIds((prev) => new Set(prev).add(jobId));
      }
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Unknown error occurred while applying.');
      showToast('Error applying: ' + message, 'error');
    }
  };

  // Handle employer job submission
  const handleEmployerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setIsLoginOpen(true);
      return;
    }

    if (!employerTitle.trim() || !employerWage || !employerLocation.trim()) {
      showToast('Please fill out the Job Title, Daily Wage, and Location.', 'error');
      return;
    }

    setIsPostingJob(true);
    try {
      // Ensure employer profile exists in public.profiles to satisfy foreign key constraint
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();

      if (!profileCheck) {
        await supabase.from('profiles').upsert({
          id: user.id,
          role: 'employer',
          full_name: user.user_metadata?.full_name || 'QuickHire Employer',
          phone_number: user.phone || user.user_metadata?.phone_number || null,
          account_status: 'active',
        } as any);
      }

      const parsedSkills = employerSkills
        .split(/[,،、]/)
        .map((s) => s.trim().normalize('NFC'))
        .filter(Boolean);

      const cleanTitle = employerTitle.trim().normalize('NFC');
      const cleanLocation = employerLocation.trim().normalize('NFC');
      const cleanDescription = employerDescription.trim().normalize('NFC');

      const descriptionText = `Location: ${cleanLocation}${
        cleanDescription ? ' | ' + cleanDescription : ''
      } | Workers needed: ${employerCount}`;

      const { error: jobError } = await supabase.from('jobs').insert([
        {
          employer_id: user.id,
          title: cleanTitle,
          category: employerCategory,
          required_skills: parsedSkills,
          offered_wages: Number(employerWage),
          description: descriptionText,
          status: 'open',
        },
      ]);

      if (jobError) throw jobError;

      showToast('Job posted successfully! Discover matching workers now.', 'success');
      const savedCategory = employerCategory;
      const primarySkill = parsedSkills[0] || '';

      // Reset form
      setEmployerTitle('');
      setEmployerSkills('');
      setEmployerWage('');
      setEmployerLocation('');
      setEmployerDescription('');
      setEmployerCount('1');

      // Refresh data & switch to workers directory
      fetchOpenJobs();
      if (user) fetchMyPostedJobs(user.id);
      setSelectedCategory(savedCategory);
      setSearchQuery(primarySkill);
      setActiveTab('workers');
    } catch (err: unknown) {
      const message = extractErrorMessage(err, 'Failed to post job. Please try again.');
      showToast('Error posting job: ' + message, 'error');
    } finally {
      setIsPostingJob(false);
    }
  };

  const handleMarkJobCompleted = async (jobId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'completed' })
        .eq('id', jobId)
        .eq('employer_id', user.id);

      if (!error) {
        setMyPostedJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: 'completed' } : j))
        );
        fetchOpenJobs();
      }
    } catch {
      // Ignore
    }
  };

  const addSkillChip = (skill: string) => {
    const existing = employerSkills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!existing.includes(skill)) {
      existing.push(skill);
      setEmployerSkills(existing.join(', '));
    }
  };

  // Filtered directory workers
  const filteredWorkers = directoryWorkers.filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesSkill = w.skills?.some((s) => s.toLowerCase().includes(q));
    const matchesName = w.profiles?.full_name?.toLowerCase().includes(q);
    const matchesCategory = w.category?.toLowerCase().includes(q);
    return matchesSkill || matchesName || matchesCategory;
  });

  // Loading screen while session is being verified
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#fbfcf8] flex flex-col items-center justify-center p-6 text-slate-800 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 animate-bounce">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <div className="text-center">
            <h1 className="font-heading font-black text-2xl tracking-tight text-slate-900">
              Quick<span className="text-brand-500">Hire</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Verifying authentication & secure session...
            </p>
          </div>
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mt-2" />
        </div>
      </div>
    );
  }

  // MANDATORY LOGIN-FIRST AUTHENTICATION GATE
  if (!user) {
    return (
      <div className="relative">
        {/* FLOATING TOAST NOTIFICATIONS (ALSO FOR LOGIN GATE) */}
        <div className="fixed top-4 right-4 z-[120] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          <AnimatePresence>
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className={`p-4 rounded-2xl shadow-xl border flex items-center justify-between gap-3 pointer-events-auto backdrop-blur-md ${
                  toast.type === 'error'
                    ? 'bg-rose-50/95 text-rose-900 border-rose-200'
                    : toast.type === 'info'
                    ? 'bg-amber-50/95 text-amber-900 border-amber-200'
                    : 'bg-emerald-50/95 text-emerald-950 border-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {toast.type === 'error' ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  ) : toast.type === 'info' ? (
                    <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  <span className="text-xs sm:text-sm font-bold leading-snug">{toast.message}</span>
                </div>
                <button
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="text-slate-400 hover:text-slate-600 p-1 text-xs"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* FLOATING ADMIN SMS TOGGLE BADGE ON LOGIN GATE */}
        <div className="fixed bottom-4 left-4 z-[999]">
          <SmsAdminToggleBadge onToggled={handleSmsToggleNotice} />
        </div>

        <Auth
          isGate={true}
          currentLang={currentLang}
          onLangChange={handleLangChange}
          onLoginSuccess={(loggedInUser, role) => {
            setUser(loggedInUser);
            setUserRole(role);
            fetchUserData(loggedInUser);
          }}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-[#0f2942] selection:text-white overflow-x-hidden w-full ${
      fontSizeZoom === 'larger' ? 'text-base' : fontSizeZoom === 'large' ? 'text-[15px]' : 'text-sm'
    }`}>
      {/* FLOATING TOAST NOTIFICATIONS */}
      <div className="fixed top-24 right-4 z-[120] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`p-4 rounded-2xl shadow-xl border flex items-center justify-between gap-3 pointer-events-auto backdrop-blur-md ${
                toast.type === 'error'
                  ? 'bg-rose-50/95 text-rose-900 border-rose-200'
                  : toast.type === 'info'
                  ? 'bg-amber-50/95 text-amber-900 border-amber-200'
                  : 'bg-emerald-50/95 text-emerald-950 border-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {toast.type === 'error' ? (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                ) : toast.type === 'info' ? (
                  <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                )}
                <span className="text-xs sm:text-sm font-bold leading-snug">{toast.message}</span>
              </div>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-slate-600 p-1 text-xs"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* MODALS */}
      <Auth
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        currentLang={currentLang}
        onLoginSuccess={(loggedInUser, role) => {
          setUser(loggedInUser);
          setUserRole(role);
          fetchUserData(loggedInUser);
          setIsLoginOpen(false);
        }}
      />
      <WorkerDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        initialCategory={discoveryCategory}
        initialSkillSearch={discoverySkill}
        currentLang={currentLang}
      />
      <WorkerProfileModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        user={user}
        onSaved={() => fetchWorkers()}
        currentLang={currentLang}
        onDeactivateAccount={handleDeactivateAccount}
      />
      <PostEquipmentModal
        isOpen={isPostEquipModalOpen}
        onClose={() => setIsPostEquipModalOpen(false)}
        user={user}
        currentLang={currentLang}
        onEquipmentPosted={(newItem) => {
          setEquipmentList((prev) => [newItem, ...prev]);
        }}
        onRequireLogin={() => setIsLoginOpen(true)}
      />
      <DirectPaymentModal
        isOpen={directPaymentModal.isOpen}
        onClose={() => setDirectPaymentModal((prev) => ({ ...prev, isOpen: false }))}
        currentUser={user}
        recipientId={directPaymentModal.recipientId}
        recipientName={directPaymentModal.recipientName}
        recipientPhone={directPaymentModal.recipientPhone}
        paymentForType={directPaymentModal.paymentForType}
        referenceId={directPaymentModal.referenceId}
        defaultAmount={directPaymentModal.defaultAmount}
        currentLang={currentLang}
        onRequireLogin={() => setIsLoginOpen(true)}
      />

      {/* QUICK JOB POSTING MODAL */}
      <AnimatePresence>
        {isJobModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsJobModalOpen(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setIsJobModalOpen(false)}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
              >
                ✕
              </button>
              <div className="flex items-center gap-3 mb-2 pr-8">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-heading font-extrabold text-2xl text-slate-900">
                    {t('postJobTitle')}
                  </h2>
                  <p className="text-xs text-slate-500">{t('postJobSub')}</p>
                </div>
              </div>

              <form
                onSubmit={async (e) => {
                  await handleEmployerSubmit(e);
                  setIsJobModalOpen(false);
                }}
                className="space-y-4 pt-4"
              >
                {/* 1. Job Title */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {t('jobTitleLabel')} *
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('jobTitle', currentLang)}
                      lang={currentLang}
                      label="Listen to job title instructions"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={employerTitle}
                    onClick={() => speakText(getVoiceGuidance('jobTitle', currentLang), currentLang)}
                    onFocus={() => speakText(getVoiceGuidance('jobTitle', currentLang), currentLang)}
                    onChange={(e) => setEmployerTitle(e.target.value)}
                    placeholder={t('jobTitlePlaceholder')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* 2. Category & Worker Count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {t('categoryLabel')} *
                      </label>
                      <VoiceSpeakerButton
                        text={getVoiceGuidance('jobCategory', currentLang)}
                        lang={currentLang}
                        label="Listen to category instructions"
                      />
                    </div>
                    <select
                      value={employerCategory}
                      onClick={() => speakText(getVoiceGuidance('jobCategory', currentLang), currentLang)}
                      onFocus={() => speakText(getVoiceGuidance('jobCategory', currentLang), currentLang)}
                      onChange={(e) => setEmployerCategory(e.target.value as WorkerCategory)}
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-brand-500 shadow-2xs"
                    >
                      <option value="Agriculture">{t('catAgri')}</option>
                      <option value="Construction">{t('catConst')}</option>
                      <option value="Daily work">{t('catDaily')}</option>
                      <option value="Skilled self-employed">{t('catSkilled')}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {t('workersNeededLabel')} *
                      </label>
                      <VoiceSpeakerButton
                        text={getVoiceGuidance('workersCount', currentLang)}
                        lang={currentLang}
                        label="Listen to workers needed instructions"
                      />
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={employerCount}
                      onClick={() => speakText(getVoiceGuidance('workersCount', currentLang), currentLang)}
                      onFocus={() => speakText(getVoiceGuidance('workersCount', currentLang), currentLang)}
                      onChange={(e) => setEmployerCount(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                    />
                  </div>
                </div>

                {/* 3. Required Skills */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {t('skillsLabel')}
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('workerSkillsRequired', currentLang)}
                      lang={currentLang}
                      label="Listen to skills instructions"
                    />
                  </div>
                  <input
                    type="text"
                    value={employerSkills}
                    onClick={() => speakText(getVoiceGuidance('workerSkillsRequired', currentLang), currentLang)}
                    onFocus={() => speakText(getVoiceGuidance('workerSkillsRequired', currentLang), currentLang)}
                    onChange={(e) => setEmployerSkills(e.target.value)}
                    placeholder={t('skillsPlaceholder')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* 4. Daily Wage */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {t('wageLabel')} *
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('dailyWage', currentLang)}
                      lang={currentLang}
                      label="Listen to wage instructions"
                    />
                  </div>
                  <input
                    type="number"
                    required
                    min="100"
                    step="50"
                    value={employerWage}
                    onClick={() => speakText(getVoiceGuidance('dailyWage', currentLang), currentLang)}
                    onFocus={() => speakText(getVoiceGuidance('dailyWage', currentLang), currentLang)}
                    onChange={(e) => setEmployerWage(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                  />
                </div>

                {/* 5. Location */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {t('pincodeLabel')} *
                    </label>
                    <VoiceSpeakerButton
                      text={getVoiceGuidance('jobLocation', currentLang)}
                      lang={currentLang}
                      label="Listen to location instructions"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={employerLocation}
                    onClick={() => speakText(getVoiceGuidance('jobLocation', currentLang), currentLang)}
                    onFocus={() => speakText(getVoiceGuidance('jobLocation', currentLang), currentLang)}
                    onChange={(e) => setEmployerLocation(e.target.value)}
                    placeholder={t('pincodePlaceholder')}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 outline-none focus:border-brand-500 shadow-2xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPostingJob}
                  className="w-full py-3.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-70 mt-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isPostingJob ? t('postingBtn') : t('postSubmitBtn')}</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QUICK EMPLOYER DASHBOARD MODAL */}
      <AnimatePresence>
        {showEmployerDashboard && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmployerDashboard(false)}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden border border-slate-200 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-heading font-extrabold text-2xl text-slate-900">
                      {t('dashboardTitle')}
                    </h2>
                    <p className="text-xs text-slate-500">{t('dashboardSub')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEmployerDashboard(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  ✕
                </button>
              </div>

              {!user ? (
                <div className="text-center py-8 space-y-4">
                  <p className="text-sm text-slate-600 max-w-md mx-auto">{t('loginDashboardSub')}</p>
                  <button
                    onClick={() => {
                      setShowEmployerDashboard(false);
                      setIsLoginOpen(true);
                    }}
                    className="px-6 py-3 bg-brand-500 text-white rounded-xl text-sm font-bold shadow-xs hover:bg-brand-600 transition-colors"
                  >
                    {t('login')}
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                      <span className="text-[11px] font-bold text-slate-400 block uppercase">{t('totalJobsPosted')}</span>
                      <span className="font-heading font-black text-2xl text-slate-900">{myPostedJobs.length}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                      <span className="text-[11px] font-bold text-slate-400 block uppercase">{t('activeListings')}</span>
                      <span className="font-heading font-black text-2xl text-emerald-600">
                        {myPostedJobs.filter((j) => j.status === 'open').length}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                      <span className="text-[11px] font-bold text-slate-400 block uppercase">{t('totalApplicants')}</span>
                      <span className="font-heading font-black text-2xl text-amber-600">
                        {myPostedJobs.reduce((acc, j) => acc + (j.job_records?.length || 0), 0)}
                      </span>
                    </div>
                  </div>

                  {myPostedJobs.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      {t('noJobsPosted')}
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                      {myPostedJobs.map((job) => {
                        const applicants = job.job_records || [];
                        return (
                          <div key={job.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200 mr-2">
                                  {job.category}
                                </span>
                                <span className="font-bold text-slate-900 text-sm">{job.title}</span>
                              </div>
                              <span className="text-xs font-extrabold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                                ₹{job.offered_wages} / day
                              </span>
                            </div>
                            <div className="pt-2 border-t border-slate-200 space-y-2">
                              <span className="text-xs font-bold text-slate-700 block">
                                {t('interestedWorkersList')} ({applicants.length})
                              </span>
                              {applicants.length === 0 ? (
                                <p className="text-xs text-slate-400">{t('noApplicantsYet')}</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {applicants.map((rec) => {
                                    const workerName = rec.workers?.profiles?.full_name || t('interestedWorkerFallback');
                                    const phone = rec.workers?.profiles?.phone_number;
                                    return (
                                      <div key={rec.id} className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs gap-2">
                                        <span className="font-bold text-slate-800 truncate">{workerName}</span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {phone ? (
                                            <a href={`tel:${phone}`} className="px-2.5 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold flex items-center gap-1">
                                              <PhoneCall className="w-3 h-3" />
                                              <span>{t('call')}</span>
                                            </a>
                                          ) : (
                                            <span className="text-slate-400 text-[10px]">{t('numberNotShared')}</span>
                                          )}
                                          <button
                                            onClick={() => {
                                              setShowEmployerDashboard(false);
                                              setDirectPaymentModal({
                                                isOpen: true,
                                                recipientId: rec.workers?.profiles?.id || rec.worker_id || rec.workers?.id || '',
                                                recipientName: workerName,
                                                recipientPhone: phone,
                                                paymentForType: 'worker_wage',
                                                referenceId: job.id,
                                                defaultAmount: job.offered_wages || 500,
                                              });
                                            }}
                                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg font-bold flex items-center gap-1 border border-emerald-200"
                                          >
                                            <Landmark className="w-3 h-3 text-emerald-700" />
                                            <span>₹ {t('payWageToBank')}</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <button
                      onClick={() => {
                        setShowEmployerDashboard(false);
                        setIsJobModalOpen(true);
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs"
                    >
                      {t('postAnotherJob')}
                    </button>
                    <button
                      onClick={() => {
                        setShowEmployerDashboard(false);
                        setActiveTab('my-jobs');
                      }}
                      className="text-xs font-bold text-brand-600 hover:text-brand-700"
                    >
                      Open Full Dashboard Page →
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LAYER 1: TOP TRICOLOR & GIGW ACCESSIBILITY STRIP */}
      <div className="bg-slate-900 text-white text-xs py-1.5 border-t-4 border-t-[#FF9933] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] sm:text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#FF9933]" />
              <span className="w-2 h-2 rounded-full bg-[#FFFFFF]" />
              <span className="w-2 h-2 rounded-full bg-[#138808]" />
            </span>
            <span className="font-semibold text-slate-200">
              ग्रामीण रोजगार एवं श्रम कल्याण पोर्टल | Rural Employment & Workforce Welfare Initiative — Direct 0% Commission Platform
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] shrink-0">
            {/* Skip to Main Content */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:inline-block focus:bg-[#FF9933] focus:text-slate-900 px-2 py-0.5 rounded text-xs font-bold"
            >
              Skip to Main Content
            </a>

            {/* Font Size Accessibility Controls */}
            <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold mr-1 hidden sm:inline">Font:</span>
              <button
                onClick={() => setFontSizeZoom('normal')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors ${
                  fontSizeZoom === 'normal'
                    ? 'bg-[#FF9933] text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Default font size"
              >
                A-
              </button>
              <button
                onClick={() => setFontSizeZoom('large')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors ${
                  fontSizeZoom === 'large'
                    ? 'bg-[#FF9933] text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Large font size"
              >
                A
              </button>
              <button
                onClick={() => setFontSizeZoom('larger')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors ${
                  fontSizeZoom === 'larger'
                    ? 'bg-[#FF9933] text-slate-900'
                    : 'text-slate-300 hover:text-white'
                }`}
                title="Extra large font size"
              >
                A+
              </button>
            </div>

            <span className="hidden md:inline-flex items-center gap-1.5 bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>🔊 Voice Guidance Active</span>
            </span>

            <a
              href="tel:18001801551"
              className="flex items-center gap-1 text-amber-300 hover:text-amber-200 font-bold tracking-wide"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Toll-Free: 1800-180-1551</span>
            </a>
          </div>
        </div>
      </div>

      {/* LAYER 2: INSTITUTIONAL BRANDING BAR */}
      <div className="bg-white border-b border-slate-200 py-3.5 w-full shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          {/* Left: Formal Emblem & Institutional Title */}
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 cursor-pointer group shrink-0"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#0f2942] to-[#1a3d60] text-white flex flex-col items-center justify-center shadow-md border-2 border-[#FF9933]/60 group-hover:scale-105 transition-transform">
              <Landmark className="w-5 h-5 text-amber-300" />
              <span className="text-[7px] font-black tracking-widest uppercase text-emerald-300">DPI</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-xl sm:text-2xl tracking-tight text-[#0f2942]">
                  Quick<span className="text-[#138808]">Hire</span>
                </span>
                <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-sm bg-[#0f2942] text-white">
                  Portal
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-[#138808]" />
                  Direct Benefit & Wage Settlement
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 font-medium">
                National Rural Workforce, Skill Discovery & Agricultural Equipment Registry
              </p>
            </div>
          </div>

          {/* Right: Language Selector, User Role Badge, Profile, Logout */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Discreet Header Admin SMS Provider Toggle Badge */}
            <SmsAdminToggleBadge onToggled={handleSmsToggleNotice} className="hidden lg:flex" />

            {/* 5-Language Selector */}
            <div className="relative shrink-0">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors shadow-2xs"
              >
                <Globe2 className="w-4 h-4 text-[#0f2942]" />
                <span className="hidden sm:inline">{currentLang}</span>
                <span className="sm:hidden">{currentLang.slice(0, 2).toUpperCase()}</span>
              </button>

              <AnimatePresence>
                {langMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 z-50 overflow-hidden text-slate-800"
                  >
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                      Select Portal Language
                    </div>
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => handleLangChange(lang)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm rounded-xl text-left transition-colors ${
                          currentLang === lang
                            ? 'bg-emerald-50 text-[#138808] font-bold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{lang}</span>
                        {currentLang === lang && <Check className="w-4 h-4 text-[#138808] stroke-[3]" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User Role Badge */}
            {user && (
              userRole === 'employer' ? (
                <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 whitespace-nowrap">
                  <Building2 className="w-3.5 h-3.5 text-amber-700" />
                  <span>Employer / नियोक्ता</span>
                </span>
              ) : (
                <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-900 border border-emerald-300 whitespace-nowrap">
                  <UserCheck className="w-3.5 h-3.5 text-[#138808]" />
                  <span>Worker / कामगार</span>
                </span>
              )
            )}

            {/* Worker Profile Button */}
            {user && (
              <button
                onClick={() => setIsWorkerProfileOpen(true)}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-50 hover:bg-emerald-100 text-[#138808] border border-emerald-300 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#138808]" />
                <span className="hidden md:inline">Worker Profile</span>
                <span className="md:hidden">Profile</span>
              </button>
            )}

            {/* Logout / Login Button */}
            {user ? (
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  localStorage.removeItem('quickhire_user_session');
                  localStorage.removeItem('quickhire_user_role');
                  setUser(null);
                  setUserRole(null);
                }}
                className="px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors whitespace-nowrap"
              >
                {t('logout')}
              </button>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#0f2942] hover:bg-[#1a3d60] text-white transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{t('login')}</span>
              </button>
            )}

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100"
              title="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* LAYER 3: BOTTOM OFFICIAL NAVIGATION BAR (ZERO HORIZONTAL OVERFLOW) */}
      <div className="bg-[#0f2942] text-white sticky top-0 z-40 border-b-2 border-b-[#FF9933] shadow-md w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <nav className="flex items-center overflow-x-auto no-scrollbar py-0.5 gap-1 sm:gap-1.5 w-full">
            {/* Tab 1: 🏛️ Home / Portal Overview */}
            <button
              onClick={() => setActiveTab('home')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${
                activeTab === 'home'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🏛️</span>
              <span>{t('tabHome')}</span>
            </button>

            {/* Tab 2: 👥 Workers Directory */}
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${
                activeTab === 'workers'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>👥</span>
              <span>{t('tabWorkers')}</span>
            </button>

            {/* Tab 3: 🚜 Equipment & Tool Bank */}
            <button
              onClick={() => setActiveTab('equipment')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${
                activeTab === 'equipment'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🚜</span>
              <span>{t('tabEquipment')}</span>
            </button>

            {/* Tab 4: 📋 Post Employment */}
            <button
              onClick={() => setActiveTab('post-job')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${
                activeTab === 'post-job'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>📋</span>
              <span>{t('tabPostJob')}</span>
            </button>

            {/* Tab 5: 📊 Citizen Dashboard */}
            <button
              onClick={() => setActiveTab('my-jobs')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 relative ${
                activeTab === 'my-jobs'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>📊</span>
              <span>{t('tabMyJobs')}</span>
              {myPostedJobs.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FF9933] text-slate-900 text-[10px] font-black flex items-center justify-center">
                  {myPostedJobs.length}
                </span>
              )}
            </button>

            {/* Tab 6: 🏦 Bank & DBT Payouts */}
            <button
              onClick={() => setActiveTab('bank')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${
                activeTab === 'bank'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🏦</span>
              <span>{t('tabBank')}</span>
            </button>

            {/* Tab 7: 🛡️ Grievance & SOS Helplines */}
            <button
              onClick={() => setActiveTab('safety')}
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${
                activeTab === 'safety'
                  ? 'border-b-[#FF9933] bg-white/15 text-white'
                  : 'border-b-transparent text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>🛡️</span>
              <span>{t('tabSafety')}</span>
            </button>
          </nav>
        </div>

        {/* Mobile Slide-Down Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-slate-700 bg-[#0f2942] px-4 py-3 space-y-1.5 shadow-lg overflow-hidden text-white"
            >
              <button
                onClick={() => {
                  setActiveTab('home');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'home' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>🏛️</span>
                <span>{t('tabHome')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('workers');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'workers' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>👥</span>
                <span>{t('tabWorkers')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('equipment');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'equipment' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>🚜</span>
                <span>{t('tabEquipment')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('post-job');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'post-job' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>📋</span>
                <span>{t('tabPostJob')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('my-jobs');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'my-jobs' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span>📊</span>
                  <span>{t('tabMyJobs')}</span>
                </div>
                {myPostedJobs.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-[#FF9933] text-slate-900 text-[10px] font-black flex items-center justify-center">
                    {myPostedJobs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab('bank');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'bank' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>🏦</span>
                <span>{t('tabBank')}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('safety');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${
                  activeTab === 'safety' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <span>🛡️</span>
                <span>{t('tabSafety')}</span>
              </button>
              {user && (
                <button
                  onClick={() => {
                    setIsWorkerProfileOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-600/50 hover:bg-emerald-900/60 transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>Citizen Profile & Settings</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

            {/* MAIN CONTENT AREA PER ACTIVE TAB WITH CODE SPLITTING & SUSPENSE */}
      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
        <Suspense
          fallback={
            <div className="flex justify-center items-center h-64 text-emerald-600 font-medium">
              Loading QuickHire...
            </div>
          }
        >
          {activeTab === 'home' && (
            <HomeTab
              currentLang={currentLang}
              onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
              user={user}
              onRequireLogin={() => setIsLoginOpen(true)}
              onOpenWorkerProfile={() => {
                if (!user) {
                  setIsLoginOpen(true);
                } else {
                  setIsWorkerModalOpen(true);
                }
              }}
              onOpenDiscovery={(category, skill) => {
                setDiscoveryCategory(category || 'All');
                setDiscoverySkill(skill || '');
                setIsDiscoveryOpen(true);
              }}
              activeJobs={activeJobs}
              appliedJobIds={appliedJobIds}
              onApplyForJob={handleApplyForJob}
              onSelectCategory={(category) => {
                setSelectedCategory(category);
                setActiveTab('workers');
              }}
            />
          )}

          {activeTab === 'workers' && (
            <WorkersTab
              currentLang={currentLang}
              workersLoading={workersLoading}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              filteredWorkers={filteredWorkers}
              user={user}
              onRequireLogin={() => setIsLoginOpen(true)}
              onRegisterSkillProfile={() => {
                if (!user) {
                  setIsLoginOpen(true);
                } else {
                  setIsWorkerModalOpen(true);
                }
              }}
              onOpenDirectPayment={(recipientId, recipientName, recipientPhone) => {
                setDirectPaymentModal({
                  isOpen: true,
                  recipientId,
                  recipientName,
                  recipientPhone,
                  paymentForType: 'worker_wage',
                  defaultAmount: 500,
                });
              }}
              onOpenWorkerDiscovery={(category, skill) => {
                setDiscoveryCategory(category);
                setDiscoverySkill(skill);
                setIsDiscoveryOpen(true);
              }}
            />
          )}

          {activeTab === 'equipment' && (
            <EquipmentRentalTab
              equipmentList={equipmentList}
              equipmentLoading={equipmentLoading}
              selectedCategory={selectedEquipCategory}
              onSelectCategory={setSelectedEquipCategory}
              searchQuery={equipSearchQuery}
              onSearchQueryChange={setEquipSearchQuery}
              onPostEquipmentClick={() => setIsPostEquipModalOpen(true)}
              onPayRentClick={(item) => {
                setDirectPaymentModal({
                  isOpen: true,
                  recipientId: item.owner_id,
                  recipientName: item.owner_name || 'Machine Owner',
                  recipientPhone: item.owner_phone,
                  paymentForType: 'machine_rental',
                  referenceId: item.id,
                  defaultAmount: item.daily_rent ?? item.daily_rate ?? 1000,
                });
              }}
              onRequireLogin={() => setIsLoginOpen(true)}
              isLoggedIn={Boolean(user)}
              currentLang={currentLang}
            />
          )}

          {activeTab === 'post-job' && (
            <PostJobTab
              currentLang={currentLang}
              employerTitle={employerTitle}
              setEmployerTitle={setEmployerTitle}
              employerCategory={employerCategory}
              setEmployerCategory={setEmployerCategory}
              employerCount={employerCount}
              setEmployerCount={setEmployerCount}
              employerSkills={employerSkills}
              setEmployerSkills={setEmployerSkills}
              employerWage={employerWage}
              setEmployerWage={setEmployerWage}
              employerLocation={employerLocation}
              setEmployerLocation={setEmployerLocation}
              employerDescription={employerDescription}
              setEmployerDescription={setEmployerDescription}
              isPostingJob={isPostingJob}
              onSubmit={handleEmployerSubmit}
              addSkillChip={addSkillChip}
              commonSkillsByCategory={COMMON_SKILLS_BY_CATEGORY}
            />
          )}

          {(activeTab === 'dashboard' || activeTab === 'my-jobs') && (
            <DashboardTab
              currentLang={currentLang}
              user={user}
              userRole={userRole}
              myPostedJobs={myPostedJobs}
              loadingMyJobs={loadingMyJobs}
              onNavigateTab={(tab) => setActiveTab(tab as ActiveTab)}
              onRequireLogin={() => setIsLoginOpen(true)}
              onMarkJobCompleted={handleMarkJobCompleted}
              onOpenWorkerProfile={() => setIsWorkerModalOpen(true)}
              onBrowseWorkers={(category) => {
                setSelectedCategory(category);
                setActiveTab('workers');
              }}
              onPayWage={(recipientId, recipientName, recipientPhone, jobId, amount) => {
                setDirectPaymentModal({
                  isOpen: true,
                  recipientId,
                  recipientName,
                  recipientPhone,
                  paymentForType: 'worker_wage',
                  referenceId: jobId,
                  defaultAmount: amount || 500,
                });
              }}
            />
          )}

          {activeTab === 'bank' && (
            <BankDetailsTab
              user={user}
              currentLang={currentLang}
              onRequireLogin={() => setIsLoginOpen(true)}
            />
          )}

          {activeTab === 'safety' && <SafetyTab currentLang={currentLang} />}
        </Suspense>
      </main>

      {/* OFFICIAL MULTI-COLUMN GOVERNMENT FOOTER */}
      <footer className="mt-auto w-full bg-[#0f2942] text-white py-12 border-t-4 border-t-[#FF9933]">
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Column 1: Institutional DPI Branding & Mission */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white to-slate-200 text-[#0f2942] flex items-center justify-center font-heading font-black shadow-sm border border-amber-400">
                  <Landmark className="w-6 h-6 text-[#0f2942]" />
                </div>
                <div>
                  <span className="font-heading font-black text-xl tracking-tight text-white">
                    Quick<span className="text-[#FF9933]">Hire</span>
                  </span>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                    National Rural DPI Portal
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                National Digital Public Infrastructure for rural workforce registration, agricultural machinery sharing, and direct-to-bank wage settlement without middlemen.
              </p>
              <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>0% Commission · 100% Direct Citizen Transfer</span>
              </div>
            </div>

            {/* Column 2: Portal Navigation */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF9933] block mb-3">
                🏛️ Citizen Services & Navigation
              </span>
              <ul className="space-y-2 text-xs text-slate-300 font-medium">
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('home');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    🏛️ {t('tabHome')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('workers');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    👥 {t('tabWorkers')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('equipment');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    🚜 {t('tabEquipment')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('post-job');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    📋 {t('tabPostJob')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('my-jobs');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    📊 {t('tabMyJobs')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('bank');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    🏦 {t('tabBank')}
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => {
                      setActiveTab('safety');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="hover:text-white transition-colors"
                  >
                    🛡️ {t('tabSafety')}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3: Emergency & Labor Helplines */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF9933] block mb-3">
                📞 Emergency & Labor Helplines
              </span>
              <div className="space-y-2.5 text-xs text-slate-300">
                <div className="flex items-center justify-between pb-1 border-b border-slate-700/60">
                  <span>🚨 All-in-One Emergency:</span>
                  <a href="tel:112" className="font-bold text-white hover:text-amber-300">112</a>
                </div>
                <div className="flex items-center justify-between pb-1 border-b border-slate-700/60">
                  <span>🚑 Medical Ambulance:</span>
                  <a href="tel:108" className="font-bold text-white hover:text-amber-300">108</a>
                </div>
                <div className="flex items-center justify-between pb-1 border-b border-slate-700/60">
                  <span>🌾 Kisan Call Center:</span>
                  <a href="tel:18001801551" className="font-bold text-amber-300 hover:text-white">1800-180-1551</a>
                </div>
                <div className="flex items-center justify-between pb-1 border-b border-slate-700/60">
                  <span>👷 National Labor Helpline:</span>
                  <a href="tel:14434" className="font-bold text-white hover:text-amber-300">14434</a>
                </div>
                <div className="flex items-center justify-between">
                  <span>🛡️ Women Safety Helpline:</span>
                  <a href="tel:1091" className="font-bold text-white hover:text-amber-300">1091</a>
                </div>
              </div>
            </div>

            {/* Column 4: Supported Regional Languages */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF9933] block mb-3">
                🌐 Multilingual Audio Guidance
              </span>
              <p className="text-xs text-slate-300 leading-relaxed">
                Full voice guidance enabled across 5 regional languages with instant text-to-speech feedback.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {languages.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleLangChange(lang)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                      currentLang === lang
                        ? 'bg-[#FF9933] text-slate-900 font-bold'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <span>Designed for Rural Digital Empowerment • Accessible Voice-Enabled Interface • 0% Commission Direct Settlement</span>
            <span>© {new Date().getFullYear()} QuickHire National Rural Portal. All Rights Reserved.</span>
          </div>
        </div>
      </footer>

      {/* FLOATING ADMIN SMS TOGGLE BADGE */}
      <div className="fixed bottom-4 left-4 z-[999]">
        <SmsAdminToggleBadge onToggled={handleSmsToggleNotice} />
      </div>

      {/* FLOATING ACCESSIBLE VOICE HELPER */}
      <AccessibleVoiceBar activeTab={activeTab} currentLang={currentLang} />
    </div>
  );
}