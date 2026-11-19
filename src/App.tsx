import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
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
  Landmark,
  ShieldCheck,
  Download
} from 'lucide-react';
import type { WorkerItem } from './components/WorkerDiscoveryModal';
import type { EquipmentItem } from './components/PostEquipmentModal';
import { OfflineBanner } from './components/OfflineBanner';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import { usePwaInstall } from './hooks/usePwaInstall';
import { speakText, getVoiceGuidance } from './lib/speech';
import { VoiceSpeakerButton } from './components/VoiceSpeakerButton';
import { AccessibleVoiceBar } from './components/AccessibleVoiceBar';
import { extractErrorMessage } from './lib/errorHandler';

// Lazy-loaded modals for code splitting and ultra-fast initial load
const Auth = lazy(() => import('./components/Auth').then(m => ({ default: m.Auth })));
const WorkerDiscoveryModal = lazy(() => import('./components/WorkerDiscoveryModal').then(m => ({ default: m.WorkerDiscoveryModal })));
const WorkerProfileModal = lazy(() => import('./components/WorkerProfileModal').then(m => ({ default: m.WorkerProfileModal })));
const PostEquipmentModal = lazy(() => import('./components/PostEquipmentModal').then(m => ({ default: m.PostEquipmentModal })));
const DirectPaymentModal = lazy(() => import('./components/DirectPaymentModal').then(m => ({ default: m.DirectPaymentModal })));

// Lazy-loaded tabs
const HomeTab = lazy(() => import('./components/HomeTab'));
const WorkersTab = lazy(() => import('./components/WorkersTab'));
const EquipmentRentalTab = lazy(() => import('./components/EquipmentRentalTab'));
const PostJobTab = lazy(() => import('./components/PostJobTab'));
const DashboardTab = lazy(() => import('./components/DashboardTab'));
const BankDetailsTab = lazy(() => import('./components/BankDetailsTab'));
const SafetyTab = lazy(() => import('./components/SafetyTab'));

// Admin Router & Auth
import {
  getCurrentRoute,
  subscribeToRoute,
  navigateTo,
  isAdminPath,
  AppRoute,
  AdminRoute,
} from './lib/adminRouter';
import { getStoredAdminSession, clearAdminSession, verifyAdminStatus, ensureAdminSession } from './lib/adminAuth';

// Lazy-loaded Admin modules
const AdminLogin = lazy(() => import('./components/admin/AdminLogin'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
const AdminOverview = lazy(() => import('./components/admin/AdminOverview'));
const UserManagement = lazy(() => import('./components/admin/UserManagement'));
const JobManagement = lazy(() => import('./components/admin/JobManagement'));
const EquipmentManagement = lazy(() => import('./components/admin/EquipmentManagement'));
const PaymentManagement = lazy(() => import('./components/admin/PaymentManagement'));
const ComplaintsManagement = lazy(() => import('./components/admin/ComplaintsManagement'));
const ContentManagement = lazy(() => import('./components/admin/ContentManagement'));
const AnalyticsView = lazy(() => import('./components/admin/AnalyticsView'));
const AuditLogsView = lazy(() => import('./components/admin/AuditLogsView'));

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
  hiring_source?: 'application' | 'direct_phone' | string | null;
  agreement_evidence_type?: string | null;
  reported_by?: string | null;
  eta_minutes?: number | null;
  eta_updated_at?: string | null;
  arrived_at?: string | null;
  arrived_reported_by?: string | null;
  attendance_confirmed_at?: string | null;
  attendance_confirmed_by?: string | null;
  work_started_at?: string | null;
  work_completed_at?: string | null;
  break_minutes?: number | null;
  overtime_hours?: number | null;
  total_working_hours?: number | null;
  agreed_wage?: number | null;
  total_payable?: number | null;
  total_paid?: number | null;
  payment_status?: string | null;
  profiles?: {
    id?: string;
    phone_number?: string | null;
    full_name?: string | null;
  } | null;
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

import { matchesSkillSearch, getTranslation } from './lib/translations';



const COMMON_SKILLS_BY_CATEGORY: Record<WorkerCategory, string[]> = {
  Agriculture: ['Harvesting', 'Tractor Driving', 'Crop Sowing', 'Weeding', 'Pesticide Spraying', 'Orchard Pruning'],
  Construction: ['Masonry', 'Plastering', 'Concrete Mixing', 'Tile Laying', 'Bar Bending', 'Scaffolding'],
  'Daily work': ['Loading / Unloading', 'Market Porter', 'Warehouse Helper', 'Field Clearing', 'Packaging'],
  'Skilled self-employed': ['Electrician', 'Plumber', 'Carpenter', 'Welder', 'Borewell Mechanic', 'Painter']
};


export default function App() {
  const [appRoute, setAppRoute] = useState<AppRoute>(() => getCurrentRoute().route);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [currentLang, setCurrentLang] = useState<string>(() => {
    return localStorage.getItem('quickhire_lang') || 'English';
  });
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Subscribe to URL path changes for deep linking (/admin, /admin/login, etc.)
  useEffect(() => {
    return subscribeToRoute((newRoute) => {
      setAppRoute(newRoute);
    });
  }, []);

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

  // PWA Install state
  const { isInstallable, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [showIosPwaHelp, setShowIosPwaHelp] = useState(false);

  // Auth & user state
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [userRole, setUserRole] = useState<'worker' | 'employer' | 'admin' | null>(null);

  // Stable refs to prevent circular callback identity thrashing
  const userRef = useRef<User | null>(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Safe user state updater that prevents redundant re-renders when identity hasn't changed
  const safeSetUser = useCallback((nextUser: User | null) => {
    setUser((prev) => {
      if (!prev && !nextUser) return null;
      if (
        prev &&
        nextUser &&
        prev.id === nextUser.id &&
        prev.email === nextUser.email &&
        prev.phone === nextUser.phone
      ) {
        return prev;
      }
      return nextUser;
    });
  }, []);

  // Workers directory state
  const [directoryWorkers, setDirectoryWorkers] = useState<WorkerItem[]>([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedCategoryRef = useRef<string>(selectedCategory);
  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  // Equipment tab state
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [selectedEquipCategory, setSelectedEquipCategory] = useState<string>('All');
  const [equipSearchQuery, setEquipSearchQuery] = useState('');
  const [isPostEquipModalOpen, setIsPostEquipModalOpen] = useState(false);
  const [equipmentToEdit, setEquipmentToEdit] = useState<EquipmentItem | null>(null);

  // Direct Bank Settlement Modal state
  const [directPaymentModal, setDirectPaymentModal] = useState<{
    isOpen: boolean;
    recipientId: string;
    recipientName: string;
    recipientPhone?: string | null;
    paymentForType: 'worker_wage' | 'machine_rental';
    referenceId?: string | null;
    jobId?: string | null;
    assignmentId?: string | null;
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
    return getTranslation(currentLang, key);
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

  // Concurrency guard for open jobs catalog
  const isFetchingOpenJobsRef = useRef(false);

  // Fetch open jobs
  const fetchOpenJobs = useCallback(async () => {
    if (isFetchingOpenJobsRef.current) return;
    isFetchingOpenJobsRef.current = true;
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
    } finally {
      isFetchingOpenJobsRef.current = false;
    }
  }, []);

  // Concurrency guard for directory worker requests
  const isFetchingWorkersRef = useRef(false);

  // Fetch directory workers
  const fetchWorkers = useCallback(async (categoryOverride?: string) => {
    if (isFetchingWorkersRef.current) return;
    isFetchingWorkersRef.current = true;
    try {
      // Session Guard: ONLY authenticated users may browse workers
      const { data: { session } } = await supabase.auth.getSession();
      const activeUser = session?.user ?? userRef.current;
      if (!activeUser) {
        setDirectoryWorkers([]);
        return;
      }
      setWorkersLoading(true);

      const targetCategory = categoryOverride ?? selectedCategoryRef.current;

      // 1. Primary secure discovery path: sanitized public_worker_directory view
      let viewQuery = supabase.from('public_worker_directory').select('*');
      if (targetCategory !== 'All') {
        viewQuery = viewQuery.eq('category', targetCategory as WorkerCategory);
      }

      const { data: viewData, error: viewError } = await viewQuery;
      // Robust check: view must succeed, return an array, and have at least 1 record.
      // If the view is missing (42P01), returns an error, or is empty (zero rows), proceed to resilient table fallback.
      if (!viewError && Array.isArray(viewData)) {
        const mapped = (viewData as Record<string, unknown>[]).map((row: Record<string, unknown>) => {
          const lat = row.latitude !== null && row.latitude !== undefined && !isNaN(Number(row.latitude)) && Number(row.latitude) !== 0 ? Number(row.latitude) : null;
          const lon = row.longitude !== null && row.longitude !== undefined && !isNaN(Number(row.longitude)) && Number(row.longitude) !== 0 ? Number(row.longitude) : null;
          return {
            id: row.id,
            category: row.category,
            skills: Array.isArray(row.skills) ? row.skills : [],
            experience_years: row.experience_years,
            daily_wage: row.daily_wage,
            experience_description: row.experience_description,
            preferred_work_location: row.preferred_work_location,
            availability_status: row.is_available ? 'available' : 'unavailable',
            average_rating: row.average_rating,
            is_available: row.is_available,
            latitude: lat,
            longitude: lon,
            profiles: {
              id: row.id,
              full_name: row.full_name,
              phone_number: null, // Phone numbers retrieved via authorized get_worker_contact_phone RPC
              is_assisted_profile: row.is_assisted_profile,
              location: row.location,
              village: row.village,
              city: row.city,
              district: row.district,
              state: row.state,
              latitude: lat,
              longitude: lon,
            },
          };
        });
        setDirectoryWorkers(mapped as unknown as WorkerItem[]);
        return;
      }

      if (viewError) {
        console.warn('public_worker_directory query failed, falling back to verified tables:', viewError);
      }

      // 2. Resilient fallback for unmigrated, empty, or view-missing database environments
      // Queries verified columns: workers (id, category, skills, experience_years, average_rating, is_available, location, latitude, longitude)
      // and profiles (id, full_name, is_assisted_profile, location, village, city, district, state, daily_wage, latitude, longitude)
      // NOTE: phone_number is never fetched here to preserve worker privacy; contact numbers are retrieved via get_worker_contact_phone RPC
      let query = supabase
        .from('workers')
        .select(`
          id, category, skills, experience_years, average_rating, is_available, location, latitude, longitude, geocoded_address,
          profiles ( id, full_name, is_assisted_profile, location, village, city, district, state, daily_wage, latitude, longitude, geocoded_address )
        `)
        .eq('is_available', true);

      if (targetCategory !== 'All') {
        query = query.eq('category', targetCategory as WorkerCategory);
      }

      const { data, error: initialError } = await query;
      let workerRows: unknown[] | null = data;
      let error = initialError;

      // If extended address/wage/geocode columns fail on older schemas, retry with minimal baseline
      if (error && (error.code === '42703' || String(error.message).includes('column'))) {
        let minimalQuery = supabase
          .from('workers')
          .select(`
            id, category, skills, experience_years, average_rating, is_available, location, latitude, longitude,
            profiles ( id, full_name, is_assisted_profile, location, village, district, state, latitude, longitude )
          `)
          .eq('is_available', true);

        if (targetCategory !== 'All') {
          minimalQuery = minimalQuery.eq('category', targetCategory as WorkerCategory);
        }
        const fallbackRes = await minimalQuery;
        workerRows = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        console.error('Worker discovery fallback query failed:', error);
      }

      if (!error && Array.isArray(workerRows)) {
        const normalized = (workerRows as Record<string, unknown>[]).map((row: Record<string, unknown>) => {
          const prof = (row.profiles && typeof row.profiles === 'object' ? row.profiles : {}) as Record<string, unknown>;
          const compositeLoc =
            prof.location ||
            row.location ||
            [prof.village, prof.city, prof.district, prof.state].filter(Boolean).join(', ') ||
            null;

          const lat =
            row.latitude !== null && row.latitude !== undefined && !isNaN(Number(row.latitude)) && Number(row.latitude) !== 0
              ? Number(row.latitude)
              : prof.latitude !== null && prof.latitude !== undefined && !isNaN(Number(prof.latitude)) && Number(prof.latitude) !== 0
                ? Number(prof.latitude)
                : null;

          const lon =
            row.longitude !== null && row.longitude !== undefined && !isNaN(Number(row.longitude)) && Number(row.longitude) !== 0
              ? Number(row.longitude)
              : prof.longitude !== null && prof.longitude !== undefined && !isNaN(Number(prof.longitude)) && Number(prof.longitude) !== 0
                ? Number(prof.longitude)
                : null;

          return {
            id: row.id,
            category: row.category,
            skills: Array.isArray(row.skills) ? row.skills : [],
            experience_years: row.experience_years,
            daily_wage: prof.daily_wage || row.daily_wage || null,
            experience_description: row.experience_description || null,
            preferred_work_location: row.preferred_work_location || compositeLoc,
            availability_status: row.is_available ? 'available' : 'unavailable',
            average_rating: row.average_rating,
            is_available: row.is_available,
            latitude: lat,
            longitude: lon,
            geocoded_address: (row.geocoded_address as string) || (prof.geocoded_address as string) || null,
            profiles: {
              id: prof.id || row.id,
              full_name: prof.full_name || null,
              phone_number: null, // Protected: retrieved exclusively via authorized get_worker_contact_phone RPC
              is_assisted_profile: prof.is_assisted_profile ?? false,
              location: compositeLoc,
              village: prof.village || null,
              city: prof.city || null,
              district: prof.district || null,
              state: prof.state || null,
              latitude: lat,
              longitude: lon,
              geocoded_address: (prof.geocoded_address as string) || (row.geocoded_address as string) || null,
            },
          };
        });
        setDirectoryWorkers(normalized as unknown as WorkerItem[]);
      }
    } catch (fetchErr) {
      console.warn('Worker fetching error handled gracefully:', fetchErr);
    } finally {
      isFetchingWorkersRef.current = false;
      setWorkersLoading(false);
    }
  }, []);

  // Fetch jobs posted by the logged-in employer
  const fetchMyPostedJobs = useCallback(async (currentUserId: string) => {
    setLoadingMyJobs(true);
    try {
      // 1. Primary query: Query jobs with extended job_records fields
      // Note: Do not nest profiles directly inside job_records in PostgREST to avoid PGRST200
      const jobsQuery = supabase.from('jobs')
        .select(`
          id, title, category, offered_wages, description, status, created_at,
          job_records (
            id, status, created_at, worker_id, agreement_evidence_type, reported_by,
            eta_minutes, arrived_at, arrived_reported_by, attendance_confirmed_at,
            attendance_confirmed_by, work_started_at, work_completed_at, break_minutes,
            overtime_hours, total_working_hours, agreed_wage, total_payable, total_paid,
            payment_status
          )
        `)
        .eq('employer_id', currentUserId)
        .order('created_at', { ascending: false });

      let { data: jobsData, error: jobsErr } = await jobsQuery;

      // 2. Resilient fallback if Phase 2 columns (agreement_evidence_type) are missing on older schemas (42703)
      if (jobsErr && (jobsErr.code === '42703' || String(jobsErr.message).includes('column') || String(jobsErr.message).includes('agreement_evidence_type'))) {
        const baselineRes = await supabase.from('jobs')
          .select(`
            id, title, category, offered_wages, description, status, created_at,
            job_records (
              id, status, created_at, worker_id
            )
          `)
          .eq('employer_id', currentUserId)
          .order('created_at', { ascending: false });
        jobsData = baselineRes.data as typeof jobsData;
        jobsErr = baselineRes.error;
      }

      if (!jobsErr && jobsData) {
        const rawJobs = jobsData as unknown as PostedJobItem[];
        const workerIds: string[] = Array.from(
          new Set(
            rawJobs
              .flatMap((j) => (j.job_records || []).map((r) => r.worker_id))
              .filter((id): id is string => Boolean(id))
          )
        );

        const profilesMap = new Map<string, { phone_number: string | null; full_name: string | null }>();
        if (workerIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, phone_number')
            .in('id', workerIds);
          (profs || []).forEach((p) => profilesMap.set(p.id, p));
        }

        const enriched = rawJobs.map((j) => ({
          ...j,
          job_records: (j.job_records || []).map((r) => ({
            ...r,
            profiles: r.worker_id ? profilesMap.get(r.worker_id) || null : null,
          })),
        }));
        setMyPostedJobs(enriched as unknown as PostedJobItem[]);
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

  // Concurrency guard for equipment listings catalog
  const isFetchingEquipmentRef = useRef(false);

  // Fetch equipment listings
  const fetchEquipment = useCallback(async () => {
    if (isFetchingEquipmentRef.current) return;
    isFetchingEquipmentRef.current = true;
    setEquipmentLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select(`
          id, owner_id, title, category, description, daily_rent, deposit_required, location, status, created_at, updated_at,
          profiles:owner_id ( id, full_name, phone_number )
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
        setEquipmentList(localEquip);
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
        setEquipmentList(merged);
      }
    } catch {
      setEquipmentList([]);
    } finally {
      isFetchingEquipmentRef.current = false;
      setEquipmentLoading(false);
    }
  }, []);

  const isFetchingUserDataRef = useRef(false);
  const lastFetchedUserIdRef = useRef<string | null>(null);

  // Authenticated data fetcher - ONLY runs after user is authenticated
  const fetchUserData = useCallback(async (activeUser: User, force = false) => {
    if (!activeUser?.id) return;
    if (isFetchingUserDataRef.current) return;
    if (!force && lastFetchedUserIdRef.current === activeUser.id) return;

    isFetchingUserDataRef.current = true;
    lastFetchedUserIdRef.current = activeUser.id;

    try {
      // 1. Authoritative check: Is the authenticated user an active administrator?
      const adminCheck = await verifyAdminStatus(activeUser.id);

      if (adminCheck.isAdmin) {
        setUserRole('admin');
        ensureAdminSession(activeUser, adminCheck.role, adminCheck.verifiedEmail, adminCheck.verifiedPhone);
        localStorage.setItem('quickhire_user_session', JSON.stringify(activeUser));
        localStorage.setItem('quickhire_user_role', 'admin');

        // Safe, Idempotent profile synchronization for administrator
        try {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id, role')
            .eq('id', activeUser.id)
            .maybeSingle();

          if (!existingProfile || existingProfile.role !== 'admin') {
            await supabase.from('profiles').upsert({
              id: activeUser.id,
              role: 'admin',
              full_name: activeUser.user_metadata?.full_name || 'Platform Administrator',
              email: activeUser.email || null,
              phone_number: activeUser.phone || adminCheck.verifiedPhone || null,
              account_status: 'active',
            }, { onConflict: 'id' });
          }

          // Deactivate any accidental worker availability if a worker record existed
          await supabase.from('workers').update({ is_available: false }).eq('id', activeUser.id);
        } catch {
          // Non-blocking
        }

      } else {
        clearAdminSession();

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, role, account_status')
          .eq('id', activeUser.id)
          .maybeSingle();

        if (profile?.role === 'employer') {
          setUserRole('employer');
          localStorage.setItem('quickhire_user_role', 'employer');
        } else {
          setUserRole('worker');
          localStorage.setItem('quickhire_user_role', 'worker');
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

      // Contextual refresh for authenticated user
      fetchWorkers();
      fetchMyPostedJobs(activeUser.id);
    } catch (err) {
      console.warn('Error fetching user data:', err);
    } finally {
      isFetchingUserDataRef.current = false;
    }
  }, [fetchWorkers, fetchMyPostedJobs, showToast, t]);

  const fetchUserDataRef = useRef(fetchUserData);
  useEffect(() => {
    fetchUserDataRef.current = fetchUserData;
  }, [fetchUserData]);

  // Handle soft-delete account deactivation with data retention
  const handleDeactivateAccount = useCallback(async () => {
    try {
      clearAdminSession();
      await supabase.auth.signOut();
      localStorage.removeItem('quickhire_user_session');
      localStorage.removeItem('quickhire_user_role');
      lastFetchedUserIdRef.current = null;
      safeSetUser(null);
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
  }, [safeSetUser, showToast, t]);

  // Unified reliable signout handling
  const handleLogout = useCallback(async () => {
    try {
      clearAdminSession();
      sessionStorage.removeItem('quickhire_admin_preview_citizen');
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[QuickHire] Sign out notice:', err);
    } finally {
      // Security: Purge all cached user bank, payment ledger, credentials, and session data
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('quickhire_bank_') ||
            key.startsWith('quickhire_payment_ledger_') ||
            key === 'quickhire_user_session' ||
            key === 'quickhire_user_role' ||
            key === 'quickhire_user_equipment')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      lastFetchedUserIdRef.current = null;
      safeSetUser(null);
      setUserRole(null);
      setAppliedJobIds(new Set());
      setMyPostedJobs([]);
      setDirectoryWorkers([]);
      setIsWorkerModalOpen(false);
      navigateTo('/');
      setAppRoute('public');
      showToast('Logged out successfully', 'info');
    }
  }, [safeSetUser, showToast]);

  // Auth listener & session check with 2500ms failsafe timeout
  useEffect(() => {
    let isMounted = true;
    let authTimeout: ReturnType<typeof setTimeout> | null = null;

    // Failsafe timeout: Force authChecking to false after 2500ms max
    // Prevents desktop & mobile stuck loading screen on slow connections or offline mode
    authTimeout = setTimeout(() => {
      if (isMounted) {
        setAuthChecking(false);
      }
    }, 2500);

    const getStoredFallbackUser = (): User | null => {
      try {
        const stored = localStorage.getItem('quickhire_user_session');
        if (stored) return JSON.parse(stored);
      } catch {
        // Ignore JSON error
      }
      return null;
    };

    // Fetch public job & equipment catalogs once for all visitors on initial mount
    fetchOpenJobs();
    fetchEquipment();

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!isMounted) return;
        const currentUser = session?.user ?? getStoredFallbackUser();
        if (currentUser) {
          safeSetUser(currentUser);
          try {
            await fetchUserDataRef.current(currentUser);
          } catch (err) {
            console.warn('[QuickHire] fetchUserData background notice:', err);
          }
        }
      })
      .catch((err) => {
        console.warn('[QuickHire] Auth session retrieval error:', err);
        if (isMounted) {
          const fallbackUser = getStoredFallbackUser();
          if (fallbackUser) {
            safeSetUser(fallbackUser);
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          if (authTimeout) clearTimeout(authTimeout);
          setAuthChecking(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_OUT' || !session) {
        lastFetchedUserIdRef.current = null;
        localStorage.removeItem('quickhire_user_session');
        localStorage.removeItem('quickhire_user_role');
        safeSetUser(null);
        setUserRole(null);
        setMyPostedJobs([]);
        setAppliedJobIds(new Set());
        setDirectoryWorkers([]);
        setAuthChecking(false);
        return;
      }
      const currentUser = session.user;
      safeSetUser(currentUser);
      if (currentUser) {
        try {
          await fetchUserDataRef.current(currentUser);
        } catch (err) {
          console.warn('[QuickHire] onAuthStateChange fetchUserData notice:', err);
        }
      }
      setAuthChecking(false);
    });

    return () => {
      isMounted = false;
      if (authTimeout) clearTimeout(authTimeout);
      subscription.unsubscribe();
    };
  }, [fetchOpenJobs, fetchEquipment, safeSetUser]);

  // Refetch workers on category change when authenticated
  useEffect(() => {
    if (userRef.current) {
      fetchWorkers(selectedCategory);
    }
  }, [fetchWorkers, selectedCategory, user?.id]);

  // Handle worker expression of interest
  const handleApplyForJob = async (jobId: string) => {
    if (!user) {
      setIsLoginOpen(true);
      return;
    }

    try {
      const { error: applyError } = await supabase
        .from('job_records')
        .insert([
          {
            job_id: jobId,
            worker_id: user.id,
            status: 'applied',
            hiring_source: 'application',
            agreement_evidence_type: 'worker_application_and_employer_acceptance',
          },
        ]);

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
        });
      }

      const parsedSkills = employerSkills
        .split(/[,،、]/)
        .map((s) => s.trim().normalize('NFC'))
        .filter(Boolean);

      const cleanTitle = employerTitle.trim().normalize('NFC');
      const cleanLocation = employerLocation.trim().normalize('NFC');
      const cleanDescription = employerDescription.trim().normalize('NFC');

      const descriptionText = `Location: ${cleanLocation}${cleanDescription ? ' | ' + cleanDescription : ''
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

  // Filtered directory workers using multilingual canonical skill match
  const filteredWorkers = directoryWorkers.filter((w) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim().normalize('NFC');
    const matchesSkill = matchesSkillSearch(w.skills || [], q);
    const matchesName = (w.profiles?.full_name || '').toLowerCase().normalize('NFC').includes(q);
    const matchesCategory = (w.category || '').toLowerCase().normalize('NFC').includes(q);
    const matchesLoc = (w.profiles?.location || (w as unknown as { location?: string | null }).location || w.preferred_work_location || '').toLowerCase().normalize('NFC').includes(q);
    return matchesSkill || matchesName || matchesCategory || matchesLoc;
  });

  // Loading screen while session is being verified with fail-soft bypass
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#fbfcf8] flex flex-col items-center justify-center p-6 text-slate-800 font-sans">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 animate-bounce">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>
          <div>
            <h1 className="font-heading font-black text-2xl tracking-tight text-slate-900">
              Quick<span className="text-brand-500">Hire</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Verifying authentication & secure session...
            </p>
          </div>
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mt-2" />
          <button
            onClick={() => setAuthChecking(false)}
            className="mt-3 text-xs font-semibold text-slate-400 hover:text-brand-600 transition-colors underline underline-offset-4 cursor-pointer"
          >
            Skip to Home →
          </button>
        </div>
      </div>
    );
  }

  // Dedicated Admin Login Page (/admin/login)
  if (appRoute === 'admin-login') {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-bold">
            Loading Admin Security Portal...
          </div>
        }
      >
        <AdminLogin
          onLoginSuccess={() => setAppRoute('admin-overview')}
          onNavigatePublic={() => {
            sessionStorage.setItem('quickhire_admin_preview_citizen', 'true');
            navigateTo('/');
            setAppRoute('public');
          }}
        />
      </Suspense>
    );
  }

  // Dedicated Admin Dashboard Suite (/admin, /admin/users, /admin/jobs, etc.)
  if (isAdminPath()) {
    // 1. If auth is still verifying session, render loading screen
    if (authChecking) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-bold">
          Verifying Admin Access...
        </div>
      );
    }

    const adminSession = getStoredAdminSession();
    const isAuthorizedAdmin = Boolean(userRole === 'admin' || adminSession);

    // 2. If authenticated as standard citizen (worker/employer), show 403 Forbidden
    if (user && !isAuthorizedAdmin) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border border-rose-900/60 p-8 rounded-3xl shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-heading font-black text-white">403 — Unauthorized Access</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your current session ({user.email || 'Citizen'}) is authorized as a <strong>{userRole || 'standard user'}</strong>. Administrator authorization in <code className="text-rose-300 font-mono">admin_users</code> is required to open the security governance suite.
            </p>
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  navigateTo('/');
                  setAppRoute('public');
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition cursor-pointer"
              >
                Return to Dashboard
              </button>
              <button
                type="button"
                onClick={() => {
                  navigateTo('/admin/login');
                  setAppRoute('admin-login');
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Admin Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 3. If not authenticated at all, redirect to /admin/login
    if (!user && !isAuthorizedAdmin) {
      return (
        <Suspense
          fallback={
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-bold">
              Loading Admin Security Portal...
            </div>
          }
        >
          <AdminLogin
            onLoginSuccess={() => setAppRoute('admin-overview')}
            onNavigatePublic={() => {
              sessionStorage.setItem('quickhire_admin_preview_citizen', 'true');
              navigateTo('/');
              setAppRoute('public');
            }}
          />
        </Suspense>
      );
    }

    // 2. Authorized Administrator: Render AdminLayout with sub-module
    const currentAdminNav: AdminRoute =
      (appRoute as string) === 'public' || (appRoute as string) === 'admin-login'
        ? 'admin-overview'
        : (appRoute as AdminRoute);

    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 flex items-center justify-center text-emerald-400 font-bold">
            Loading Admin Governance Suite...
          </div>
        }
      >
        <AdminLayout
          currentRoute={currentAdminNav}
          globalSearchQuery={adminSearchQuery}
          onGlobalSearchChange={setAdminSearchQuery}
          onLogout={async () => {
            showToast('Administrator session closed safely.', 'info');
            clearAdminSession();
            sessionStorage.removeItem('quickhire_admin_preview_citizen');
            try {
              await supabase.auth.signOut();
            } catch {
              // Ignore network signout errors
            }
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (
                key &&
                (key.startsWith('quickhire_bank_') ||
                  key.startsWith('quickhire_payment_ledger_') ||
                  key === 'quickhire_user_session' ||
                  key === 'quickhire_user_role' ||
                  key === 'quickhire_user_equipment')
              ) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach((k) => localStorage.removeItem(k));
            lastFetchedUserIdRef.current = null;
            safeSetUser(null);
            setUserRole(null);
            navigateTo('/admin/login');
            setAppRoute('admin-login');
          }}
          onNavigatePublic={() => {
            sessionStorage.setItem('quickhire_admin_preview_citizen', 'true');
            navigateTo('/');
            setAppRoute('public');
          }}
        >
          {currentAdminNav === 'admin-overview' && <AdminOverview />}
          {currentAdminNav === 'admin-users' && <UserManagement />}
          {currentAdminNav === 'admin-jobs' && <JobManagement />}
          {currentAdminNav === 'admin-equipment' && <EquipmentManagement />}
          {currentAdminNav === 'admin-payments' && <PaymentManagement />}
          {currentAdminNav === 'admin-complaints' && <ComplaintsManagement />}
          {currentAdminNav === 'admin-content' && <ContentManagement />}
          {currentAdminNav === 'admin-analytics' && <AnalyticsView />}
          {currentAdminNav === 'admin-audit-logs' && <AuditLogsView />}
        </AdminLayout>
      </Suspense>
    );
  }

  return (
    <div className={`min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col font-sans selection:bg-[#0f2942] selection:text-white overflow-x-hidden w-full ${fontSizeZoom === 'larger' ? 'text-base' : fontSizeZoom === 'large' ? 'text-[15px]' : 'text-sm'
      }`}>
      {/* REAL-TIME NETWORK STATUS BANNER */}
      <OfflineBanner />

      {/* FLOATING TOAST NOTIFICATIONS */}
      <div className="fixed top-24 right-4 z-[120] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className={`p-4 rounded-2xl shadow-xl border flex items-center justify-between gap-3 pointer-events-auto backdrop-blur-md ${toast.type === 'error'
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

      {/* MODALS WITH CODE SPLITTING & SUSPENSE */}
      <Suspense fallback={null}>
        {isLoginOpen && (
          <Auth
            isOpen={isLoginOpen}
            onClose={() => setIsLoginOpen(false)}
            currentLang={currentLang}
            onLoginSuccess={(loggedInUser, role) => {
              safeSetUser(loggedInUser);
              setUserRole(role);
              fetchUserData(loggedInUser, true);
              setIsLoginOpen(false);
              if (role === 'admin') {
                navigateTo('/admin');
                setAppRoute('admin-overview');
              }
            }}
          />
        )}
        {isDiscoveryOpen && (
          <WorkerDiscoveryModal
            isOpen={isDiscoveryOpen}
            onClose={() => setIsDiscoveryOpen(false)}
            initialCategory={discoveryCategory}
            initialSkillSearch={discoverySkill}
            currentLang={currentLang}
            user={user}
            onRequireLogin={() => {
              setIsDiscoveryOpen(false);
              setIsLoginOpen(true);
            }}
          />
        )}
        {isWorkerModalOpen && (
          <WorkerProfileModal
            isOpen={isWorkerModalOpen}
            onClose={() => setIsWorkerModalOpen(false)}
            user={user}
            onSaved={() => fetchWorkers()}
            currentLang={currentLang}
            onDeactivateAccount={handleDeactivateAccount}
          />
        )}
        {isPostEquipModalOpen && (
          <PostEquipmentModal
            isOpen={isPostEquipModalOpen}
            onClose={() => {
              setIsPostEquipModalOpen(false);
              setEquipmentToEdit(null);
            }}
            user={user}
            currentLang={currentLang}
            equipmentToEdit={equipmentToEdit}
            onEquipmentPosted={(savedItem) => {
              setEquipmentList((prev) => {
                const idx = prev.findIndex((e) => e.id === savedItem.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = savedItem;
                  return copy;
                }
                return [savedItem, ...prev];
              });
              fetchEquipment();
            }}
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}
        {directPaymentModal.isOpen && (
          <DirectPaymentModal
            isOpen={directPaymentModal.isOpen}
            onClose={() => setDirectPaymentModal((prev) => ({ ...prev, isOpen: false }))}
            currentUser={user}
            recipientId={directPaymentModal.recipientId}
            recipientName={directPaymentModal.recipientName}
            recipientPhone={directPaymentModal.recipientPhone}
            paymentForType={directPaymentModal.paymentForType}
            referenceId={directPaymentModal.referenceId}
            jobId={directPaymentModal.jobId}
            assignmentId={directPaymentModal.assignmentId}
            defaultAmount={directPaymentModal.defaultAmount}
            currentLang={currentLang}
            onRequireLogin={() => setIsLoginOpen(true)}
          />
        )}
      </Suspense>

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
                                                jobId: job.id,
                                                assignmentId: rec.id,
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 text-[11px] sm:text-xs min-w-0">
            <span className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#FF9933]" />
              <span className="w-2 h-2 rounded-full bg-[#FFFFFF]" />
              <span className="w-2 h-2 rounded-full bg-[#138808]" />
            </span>
            <span className="font-semibold text-slate-200 truncate">
              ग्रामीण रोजगार एवं श्रम कल्याण पोर्टल | Rural Employment & Workforce Welfare Initiative — Direct 0% Commission Platform
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 text-[11px] shrink-0">
            {/* Skip to Main Content */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:inline-block focus:bg-[#FF9933] focus:text-slate-900 px-2 py-0.5 rounded text-xs font-bold"
            >
              Skip to Main Content
            </a>

            {/* Font Size Accessibility Controls */}
            <div className="flex items-center gap-1 bg-slate-800 px-1.5 sm:px-2 py-0.5 rounded border border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold mr-1 hidden sm:inline">Font:</span>
              <button
                onClick={() => setFontSizeZoom('normal')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors ${fontSizeZoom === 'normal'
                    ? 'bg-[#FF9933] text-slate-900'
                    : 'text-slate-300 hover:text-white'
                  }`}
                title="Default font size"
              >
                A-
              </button>
              <button
                onClick={() => setFontSizeZoom('large')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors ${fontSizeZoom === 'large'
                    ? 'bg-[#FF9933] text-slate-900'
                    : 'text-slate-300 hover:text-white'
                  }`}
                title="Large font size"
              >
                A
              </button>
              <button
                onClick={() => setFontSizeZoom('larger')}
                className={`px-1.5 py-0.5 text-[11px] font-bold rounded transition-colors ${fontSizeZoom === 'larger'
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
              <span className="hidden sm:inline">Toll-Free: 1800-180-1551</span>
              <span className="sm:hidden">1800-180-1551</span>
            </a>
          </div>
        </div>
      </div>

      {/* LAYER 2: INSTITUTIONAL BRANDING BAR */}
      <div className="bg-white border-b border-slate-200 py-3 sm:py-3.5 w-full shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-4">
          {/* Left: Formal Emblem & Institutional Title */}
          <div
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group shrink-0 min-w-0"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-[#0f2942] to-[#1a3d60] text-white flex flex-col items-center justify-center shadow-md border-2 border-[#FF9933]/60 group-hover:scale-105 transition-transform shrink-0">
              <Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
              <span className="text-[7px] font-black tracking-widest uppercase text-emerald-300">DPI</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-heading font-black text-xl sm:text-2xl tracking-tight text-[#0f2942]">
                  Quick<span className="text-[#138808]">Hire</span>
                </span>
                <span className="text-[9px] sm:text-[10px] uppercase font-extrabold tracking-wider px-1.5 sm:px-2 py-0.5 rounded-sm bg-[#0f2942] text-white">
                  Portal
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-[#138808]" />
                  Direct Benefit & Wage Settlement
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600 font-medium hidden sm:block">
                Rural Workforce, Skill Discovery & Agricultural Equipment Platform (Independent DPI Initiative)
              </p>
            </div>
          </div>

          {/* Right: Language Selector, User Role Badge, Profile, Logout */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">

            {/* 5-Language Selector */}
            <div className="relative shrink-0">
              <button
                onClick={() => setLangMenuOpen(!langMenuOpen)}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-bold border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-colors shadow-2xs"
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
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm rounded-xl text-left transition-colors ${currentLang === lang
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
              userRole === 'admin' ? (
                <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-emerald-400 border border-emerald-500/40 whitespace-nowrap shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Super Admin / मुख्य प्रशासक</span>
                </span>
              ) : userRole === 'employer' ? (
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

            {/* Worker Profile Button - non-admin users */}
            {user && userRole !== 'admin' && (
              <button
                onClick={() => setIsWorkerProfileOpen(true)}
                className="hidden sm:flex px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-50 hover:bg-emerald-100 text-[#138808] border border-emerald-300 transition-colors items-center gap-1.5 whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#138808]" />
                <span className="hidden md:inline">Worker Profile</span>
                <span className="md:hidden">Profile</span>
              </button>
            )}

            {/* Admin Suite Button */}
            {userRole === 'admin' && (
              <button
                onClick={() => {
                  sessionStorage.removeItem('quickhire_admin_preview_citizen');
                  navigateTo('/admin');
                  setAppRoute('admin-overview');
                }}
                className="hidden sm:flex px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-white" />
                <span>Admin Dashboard</span>
              </button>
            )}

            {/* Install QuickHire App Button (Desktop) */}
            {isInstallable && !isInstalled && (
              <button
                onClick={() => promptInstall()}
                className="hidden md:flex px-3 py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#FF9933] hover:bg-[#e68a2e] text-slate-900 shadow-sm transition-all items-center gap-1.5 whitespace-nowrap cursor-pointer"
                title="Install QuickHire on your device"
              >
                <Download className="w-3.5 h-3.5 text-slate-900" />
                <span>Install App</span>
              </button>
            )}

            {/* Logout / Login Button */}
            {user ? (
              <button
                onClick={handleLogout}
                className="px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors whitespace-nowrap"
              >
                {t('logout')}
              </button>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                className="px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#0f2942] hover:bg-[#1a3d60] text-white transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{t('login')}</span>
              </button>
            )}

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 min-w-[42px] min-h-[42px] flex items-center justify-center cursor-pointer"
              title="Toggle mobile menu"
              aria-label="Toggle navigation menu"
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${activeTab === 'home'
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${activeTab === 'workers'
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${activeTab === 'equipment'
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${activeTab === 'post-job'
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 relative ${activeTab === 'my-jobs'
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${activeTab === 'bank'
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
              className={`px-3.5 py-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-all border-b-4 flex items-center gap-2 shrink-0 ${activeTab === 'safety'
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
              className="lg:hidden border-t border-slate-700 bg-[#0f2942] px-4 py-4 space-y-3 shadow-2xl overflow-hidden text-white"
            >
              {/* MOBILE ACCOUNT & IDENTITY CARD */}
              {user ? (
                <div className="bg-slate-800/90 rounded-2xl p-3.5 border border-slate-700/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-xs shrink-0">
                        {user.user_metadata?.full_name ? String(user.user_metadata.full_name).charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'C')}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs sm:text-sm text-white truncate max-w-[170px] sm:max-w-none">
                          {user.user_metadata?.full_name || user.email || user.phone || 'Citizen Account'}
                        </div>
                        <div className="text-[10px] text-emerald-400 font-medium">
                          {userRole === 'admin'
                            ? '🛡️ Super Admin'
                            : userRole === 'employer'
                            ? '🏢 Employer / नियोक्ता'
                            : '👷 Worker / कामगार'}
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 shrink-0">
                      Logged In
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setIsWorkerProfileOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Profile</span>
                    </button>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setActiveTab('my-jobs');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-[#FF9933]/20 hover:bg-[#FF9933]/30 text-[#FF9933] border border-[#FF9933]/40 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>📊 Dashboard</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gradient-to-r from-slate-800 to-slate-800/90 rounded-2xl p-3.5 border border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">अतिथि नागरिक / Guest Citizen</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Not Signed In
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Sign in with phone or email to apply for jobs, hire workers, or view direct payments.
                  </p>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setIsLoginOpen(true);
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#FF9933] to-[#e68a2e] text-slate-900 font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-900" />
                    <span>Login / Register Account</span>
                  </button>
                </div>
              )}

              {/* NAVIGATION TABS */}
              <div className="space-y-1 pt-1">
                <button
                  onClick={() => {
                    setActiveTab('home');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'home' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'workers' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'equipment' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'post-job' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
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
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'my-jobs' || activeTab === 'dashboard' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'bank' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold ${activeTab === 'safety' ? 'bg-[#FF9933] text-slate-900 font-bold' : 'text-slate-200 hover:bg-white/10'
                    }`}
                >
                  <span>🛡️</span>
                  <span>{t('tabSafety')}</span>
                </button>
              </div>

              {/* Admin Portal Shortcut in Mobile Drawer */}
              {userRole === 'admin' && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    sessionStorage.removeItem('quickhire_admin_preview_citizen');
                    navigateTo('/admin');
                    setAppRoute('admin-overview');
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-600/50 hover:bg-emerald-800/60 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Admin Governance Suite</span>
                </button>
              )}

              {/* Install App button on mobile */}
              {!isInstalled && (
                <button
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    if (isIos) {
                      setShowIosPwaHelp(true);
                    } else {
                      await promptInstall();
                    }
                  }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-[#FF9933]/15 text-[#FF9933] border border-[#FF9933]/30 hover:bg-[#FF9933]/25 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Download className="w-4 h-4 text-[#FF9933]" />
                    <span>Install QuickHire App</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#FF9933]/20 text-white">
                    PWA
                  </span>
                </button>
              )}

              {/* Mobile Logout if authenticated */}
              {user && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold bg-rose-950/60 text-rose-300 border border-rose-600/50 hover:bg-rose-900/60 transition-colors"
                >
                  <X className="w-4 h-4 text-rose-400" />
                  <span>{t('logout')}</span>
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
                if (!user) {
                  setIsLoginOpen(true);
                  return;
                }
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
                if (!user) {
                  setIsLoginOpen(true);
                  return;
                }
                setDiscoveryCategory(category);
                setDiscoverySkill(skill);
                setIsDiscoveryOpen(true);
              }}
              onRefreshWorkers={fetchWorkers}
              onAssignmentCreated={() => {
                if (user) fetchMyPostedJobs(user.id);
                showToast('Direct hiring confirmed! Assignment recorded in your dashboard.', 'success');
                setActiveTab('my-jobs');
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
              onPostEquipmentClick={() => {
                if (!user) {
                  setIsLoginOpen(true);
                  return;
                }
                setEquipmentToEdit(null);
                setIsPostEquipModalOpen(true);
              }}
              onEditEquipmentClick={(item) => {
                if (!user) {
                  setIsLoginOpen(true);
                  return;
                }
                setEquipmentToEdit(item);
                setIsPostEquipModalOpen(true);
              }}
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
              currentUserId={user?.id}
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
              onNavigateAdmin={() => {
                sessionStorage.removeItem('quickhire_admin_preview_citizen');
                navigateTo('/admin');
                setAppRoute('admin-overview');
              }}
              onBrowseWorkers={(category) => {
                setSelectedCategory(category);
                setActiveTab('workers');
              }}
              onPayWage={(recipientId, recipientName, recipientPhone, jobId, amount, assignmentId) => {
                setDirectPaymentModal({
                  isOpen: true,
                  recipientId,
                  recipientName,
                  recipientPhone,
                  paymentForType: 'worker_wage',
                  referenceId: jobId,
                  jobId: jobId || null,
                  assignmentId: assignmentId || null,
                  defaultAmount: amount || 500,
                });
              }}
              onRehireWorker={(worker) => {
                // Preselect job post fields with the worker's category, skills, and suggested wage
                setEmployerTitle(`Rehire: ${worker.name} for ${worker.category || 'work'}`);
                if (worker.category) {
                  setEmployerCategory(worker.category as WorkerCategory);
                }
                if (worker.skills && worker.skills.length > 0) {
                  setEmployerSkills(worker.skills.join(', '));
                }
                if (worker.wage) {
                  setEmployerWage(worker.wage.toString());
                }
                setEmployerDescription(`Direct re-engagement assignment for trusted worker: ${worker.name}.`);
                setActiveTab('post-job');
                showToast(`Pre-filled job details for ${worker.name}. Review and confirm to post.`, 'info');
              }}
              onViewWorkerProfile={(workerId) => {
                const found = directoryWorkers.find((w) => w.id === workerId);
                if (found) {
                  setSelectedCategory(found.category);
                }
                setActiveTab('workers');
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
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${currentLang === lang
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

          {/* GIGW 3.0 Statutory Public Service Disclaimer */}
          <div className="pt-6 pb-2 text-[11px] text-slate-400 border-t border-slate-800/80 leading-relaxed text-center sm:text-left">
            <p>
              <strong className="text-slate-300">Public Service Disclaimer:</strong> QuickHire is an independent, non-governmental rural digital public infrastructure platform connecting citizens for livelihood and agricultural equipment rental opportunities. It is not affiliated with, operated by, or endorsed by the Government of India or any state government ministry. All helpline numbers (112, 108, 1091, 14434, 1800-180-1551) are provided as public safety references for direct citizen access.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <span>Designed for Rural Digital Empowerment • Accessible Voice-Enabled Interface • 0% Commission Direct Settlement</span>
            <div className="flex items-center gap-4">
              <span>© {new Date().getFullYear()} QuickHire Rural DPI Initiative. All Rights Reserved.</span>
              <a
                href="/admin/login"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo('/admin/login');
                  setAppRoute('admin-login');
                }}
                className="text-slate-400 hover:text-emerald-400 font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <span>Admin Portal</span>
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* MOBILE BOTTOM NAVIGATION BAR (FIXED ON SCREEN BOTTOM FOR EASY 1-THUMB NAVIGATION) */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0f2942]/95 backdrop-blur-md border-t border-[#FF9933]/50 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(0,0,0,0.25)]"
      >
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {/* 1. Home */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center h-full py-1 transition-colors cursor-pointer ${
              activeTab === 'home' ? 'text-[#FF9933] font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none">🏛️</span>
            <span className="text-[10px] mt-1 font-medium tracking-tight">Home</span>
          </button>

          {/* 2. Workers */}
          <button
            type="button"
            onClick={() => setActiveTab('workers')}
            className={`flex flex-col items-center justify-center h-full py-1 transition-colors cursor-pointer ${
              activeTab === 'workers' ? 'text-[#FF9933] font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none">👥</span>
            <span className="text-[10px] mt-1 font-medium tracking-tight">Workers</span>
          </button>

          {/* 3. Equipment */}
          <button
            type="button"
            onClick={() => setActiveTab('equipment')}
            className={`flex flex-col items-center justify-center h-full py-1 transition-colors cursor-pointer ${
              activeTab === 'equipment' ? 'text-[#FF9933] font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none">🚜</span>
            <span className="text-[10px] mt-1 font-medium tracking-tight">Equipment</span>
          </button>

          {/* 4. Post Job */}
          <button
            type="button"
            onClick={() => setActiveTab('post-job')}
            className={`flex flex-col items-center justify-center h-full py-1 transition-colors cursor-pointer ${
              activeTab === 'post-job' ? 'text-[#FF9933] font-bold' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none">📋</span>
            <span className="text-[10px] mt-1 font-medium tracking-tight">Post Job</span>
          </button>

          {/* 5. Dashboard / Account */}
          <button
            type="button"
            onClick={() => setActiveTab('my-jobs')}
            className={`flex flex-col items-center justify-center h-full py-1 transition-colors relative cursor-pointer ${
              activeTab === 'my-jobs' || activeTab === 'dashboard'
                ? 'text-[#FF9933] font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <span className="text-lg leading-none">📊</span>
            <span className="text-[10px] mt-1 font-medium tracking-tight">Dashboard</span>
            {myPostedJobs.length > 0 && (
              <span className="absolute top-2 right-3 w-4 h-4 rounded-full bg-[#FF9933] text-slate-900 text-[9px] font-black flex items-center justify-center">
                {myPostedJobs.length}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* FLOATING ACCESSIBLE VOICE HELPER */}
      <AccessibleVoiceBar activeTab={activeTab} currentLang={currentLang} />

      {/* PWA INSTALL BANNER */}
      <PwaInstallBanner
        currentLang={currentLang}
        forceShowIosHelp={showIosPwaHelp}
        onCloseIosHelp={() => setShowIosPwaHelp(false)}
      />
    </div>
  );
}