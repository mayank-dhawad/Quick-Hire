# 04 — UI & Design System Specification

## 1. Design Philosophy & Aesthetic Identity

**QuickHire** adopts an **institutional, accessible, rural-first design language**. The aesthetic combines:
- **Clean Government/DPI Institutional Trust:** Emulating official public infrastructure with structured badges, clear advisory headers, and high-contrast readable cards.
- **Earthy, Natural Agrarian Color Palette:** Anchored around deep forest and emerald greens (`#007a5b`, `#05684d`), warm parchment surfaces (`#fbfcf8`), and soft amber accents for alerts and warnings.
- **Inclusive Accessibility (GIGW Compliant):** Multi-level font sizing, prominent audio play buttons, high-contrast text, large tap targets (minimum 44x44px for mobile thumbs), and multi-lingual voice guidance.

---

## 2. Color System & Design Tokens

Configured in `tailwind.config.js` and `src/index.css`:

### 1. Brand Palette (Primary Emerald)
| Token | Hex Value | Role & Usage |
|---|---|---|
| `brand-50` | `#eef8f4` | Background tints, active chip backgrounds, light audio button state. |
| `brand-100` | `#d7efe6` | Badge backgrounds, secondary button borders, selected tabs. |
| `brand-200` | `#b0dfcf` | Subtle card borders, divider accents. |
| `brand-300` | `#7ec6b0` | Secondary highlights, audio waveform accents. |
| `brand-500` | `#007a5b` | **Primary Brand Color.** Primary CTAs, active buttons, main header accents. |
| `brand-600` | `#05684d` | Hover state for primary buttons, active icon badges. |
| `brand-700` | `#13795f` | Deep text headings, high-contrast labels. |
| `brand-800` | `#0b5240` | Footer accents, dark badges, dark contrast text. |

### 2. Neutral & Surface Palette
| Token | Hex Value | Role & Usage |
|---|---|---|
| `surface` | `#fbfcf8` | Document body background (warm, paper-like off-white). |
| `borderLight` | `#e4e7ec` | Card borders, table dividers, input borders. |
| `ink-primary` | `#18201b` | Primary text, titles, headings, body text. |
| `ink-muted` | `#5c6460` | Secondary text, subtitles, helper text. |
| `ink-light` | `#8d9590` | Placeholder text, disabled text, meta timestamps. |

### 3. Functional Status & Alert Palette
| Status | Background Token | Text / Icon Token | Usage |
|---|---|---|---|
| **Success** | `bg-emerald-50`, `border-emerald-200` | `text-emerald-700`, `text-emerald-800` | Verified workers, 0% commission badges, active SMS mode, saved bank details. |
| **Emergency / SOS** | `bg-rose-50`, `border-rose-200` | `text-rose-700`, `bg-rose-600` | 112 emergency cards, delete/deactivate confirmations, error alerts. |
| **Warning / Notice** | `bg-amber-50`, `border-amber-200` | `text-amber-900`, `text-amber-700` | Official citizen advisory marquee, playing audio speaker state, 108 ambulance card. |
| **Info / Demo** | `bg-slate-900/95`, `border-slate-700` | `text-slate-200` | Floating SMS Demo Mode badge, neutral status pills. |

---

## 3. Typography Hierarchy

Imported via Google Fonts in `src/index.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap');
```

- **Body Font (`font-sans`):** `DM Sans`, sans-serif (Clean, readable, highly legible at small sizes).
- **Heading Font (`font-heading`):** `Manrope`, sans-serif (Geometric, authoritative, high-impact titles).

### Typography Scale
| Element | Font Family | Size (Mobile -> Desktop) | Weight | Tailwind Classes |
|---|---|---|---|---|
| **Hero Title** | Manrope | 32px -> 52px | 800 (Extra Bold) | `font-heading font-extrabold text-3xl sm:text-5xl lg:text-[52px] leading-[1.14]` |
| **Section Titles (H1)** | Manrope | 24px -> 30px | 800 (Extra Bold) | `font-heading font-extrabold text-2xl sm:text-3xl text-slate-900` |
| **Card Headers (H2/H3)**| Manrope | 18px -> 20px | 700 (Bold) | `font-heading font-bold text-lg sm:text-xl text-slate-900` |
| **Item Titles** | Manrope | 15px -> 16px | 700 (Bold) | `font-heading font-bold text-base text-slate-900` |
| **Body Text** | DM Sans | 14px -> 16px | 400 (Regular) | `text-sm sm:text-base text-slate-600 leading-relaxed` |
| **Meta / Secondary** | DM Sans | 12px -> 13px | 500 (Medium) | `text-xs sm:text-sm text-slate-500` |
| **Badges / Chips** | DM Sans | 11px -> 12px | 700 (Bold) | `text-[11px] sm:text-xs font-bold uppercase tracking-wider` |

### GIGW Font Zoom Modes
State managed in `App.tsx`: `fontSizeZoom`:
- `'normal'`: Default root scale.
- `'large'`: Scales base typography up by ~15% for enhanced readability.
- `'larger'`: Scales base typography up by ~30% for vision-impaired users.

---

## 4. Spacing, Corner Radii & Borders

- **Border Radii:**
  - Extra Large Cards / Hero Containers: `rounded-3xl` (24px)
  - Standard Cards / Modals: `rounded-2xl` (16px)
  - Buttons / Inputs / Dropdowns: `rounded-xl` (12px)
  - Badges / Pill Toggles: `rounded-full` (9999px)
- **Borders:** Consistent `1px solid` with soft neutral borders (`border-slate-200` or `border-slate-300`).
- **Shadows:** Soft modern box shadows (`shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-xl` for floating modals).

---

## 5. Global Layout Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. GIGW ACCESSIBILITY STRIP (Font zoom A-/A/A+, Helpline quick dial: 112)   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. INSTITUTIONAL HEADER & NAVIGATION                                        │
│    [ QuickHire DPI Logo ]  [ Lang Switcher (5) ]  [ Live SMS Badge ]        │
│    [ Tabs: Home | Workers | Equipment | Post a Job | Dashboard | Bank | Safety ]
│    [ Worker Profile / Login Button ]                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. ACTIVE TAB CONTENT VIEW (Animated via Framer Motion AnimatePresence)     │
│    - HomeTab / WorkersTab / EquipmentRentalTab / PostJobTab / etc.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. INSTITUTIONAL FOOTER                                                     │
│    [ Mission & 0% Commission Notice ] [ Quick Links ] [ Emergency Helplines ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. FLOATING OVERLAYS                                                        │
│    - AccessibleVoiceBar (bottom-right floating screen reader companion)      │
│    - Toast Notifications Container (top-right stack)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Page-by-Page UI Component Specifications

### 1. Institutional Header & Navigation Bar
- **Logo:** `Briefcase` icon enclosed in a rounded emerald background, paired with `QuickHire` in Manrope bold and subtitle `Rural Employment & Equipment DPI`.
- **Language Switcher:** Dropdown button displaying current language with a globe icon (`Globe2`). When clicked, expands to show all 5 languages. Selecting a language triggers an immediate audio confirmation.
- **Admin SMS Toggle Badge:** Floating pill button:
  - *Live SMS Mode:* `bg-slate-900/95 text-emerald-300 border-emerald-500/60` with animated pulsing green dot and label `Live SMS: ON 🟢`.
  - *Demo Mode:* `bg-slate-900/95 text-slate-200 border-slate-700` with grey dot and label `SMS Demo Mode ⚪`.
- **Navigation Tabs:** Horizontal scrollable strip of tab pills (`Home`, `Workers Directory`, `Equipment Rental`, `Post a Job`, `My Dashboard`, `Bank & Payouts`, `Safety & SOS`). Active tab is highlighted in solid emerald with white text.

### 2. Home Tab (`HomeTab.tsx`)
- **Official Citizen Advisory Marquee:** Light amber alert banner at the very top: `📢 Official Advisory: QuickHire is a 100% Free Direct Employment & Equipment Portal. Never pay middlemen or commission fees...` with a `VoiceSpeakerButton`.
- **Hero Section:** Large gradient card (`from-brand-50/70 via-white to-amber-50/40`), pill badge `Direct Rural Employment · 0% Commission`, multi-line Manrope heading, subtitle, and primary CTAs:
  - Primary button: `Find Workers` (emerald).
  - Secondary button: `Post a Job (Free)` (amber).
  - Outline button: `Register as Worker` (white with border).
- **Trust Stats Strip:** 4 cards:
  - `0% Middleman Fees` (Direct employer-to-worker agreement).
  - `Direct Phone Calling` (One tap to call verified workers).
  - `Same-Day Daily Wages` (Paid directly on work completion).
  - `Assisted Profiles` (Supported for non-smartphone workers).
- **Categories Grid:** 4 large domain discovery cards with custom icons, descriptions, and action link:
  1. Agriculture (`🌾 Agriculture`)
  2. Construction (`🏗️ Construction`)
  3. Daily work (`📦 Daily work`)
  4. Skilled self-employed (`⚡ Skilled self-employed`)
- **How It Works:** 3-step numbered workflow cards.
- **Recent Job Openings Spotlight:** Cards displaying active job postings with wage tags, skill requirements, and direct `I'm Interested` button.

### 3. Workers Directory Tab (`WorkersTab.tsx`)
- **Directory Controls:** Category selector dropdown and real-time skill search input with NFC Unicode normalization.
- **Action Button:** `+ Register Skill Profile`.
- **Worker Cards Grid:** 1 to 3 columns responsive grid. Each card features:
  - Worker name, verified checkmark badge (`CheckCircle2`).
  - Domain category badge and "Assisted Profile" tag if applicable.
  - Skill chips (e.g., `Harvesting`, `Tractor Driver`).
  - Average rating star (`Star`) and years of experience.
  - Action buttons:
    - `Call Worker` (`PhoneCall` icon, opens `tel:<phone_number>`).
    - `Pay Direct` (`Landmark` icon, opens `DirectPaymentModal`).
    - `VoiceSpeakerButton` (reads worker details aloud).

### 4. Agricultural Equipment Rental Tab (`EquipmentRentalTab.tsx`)
- **Controls & Filters:** Category filter chips (`All`, `Agriculture`, `Construction`, etc.), search bar, and primary button `+ List Machinery / Tools`.
- **Machinery Cards Grid:** Features:
  - Machine title (e.g., `Mahindra 575 DI Tractor with Rotavator`).
  - Daily rental rate pill in bold emerald (`₹1,800 / day`).
  - Refundable security deposit tag (`Deposit: ₹2,000`).
  - Location badge with map pin (`MapPin`).
  - Status pill (`Available` in green, `Rented` in amber).
  - Direct call button (`Call Owner`).
  - Direct rental payment button (`Pay Rent`).

### 5. Post a Job Tab (`PostJobTab.tsx`)
- Centered container with clean white card form.
- Form Fields with integrated audio speaker buttons:
  - Job Title (input).
  - Work Domain (dropdown: Agriculture, Construction, Daily work, Skilled self-employed).
  - Number of Workers Needed (number input).
  - Required Skills (input with interactive localized suggestion chips that populate the input on click).
  - Offered Daily Wage in Rupees (input with currency symbol `₹`).
  - Work Location / Village (input).
  - Description & Timings (textarea).
- Primary submit button: `Publish Job Listing (Free)`.

### 6. Employer Dashboard Tab (`DashboardTab.tsx`)
- Displays statistics of posted jobs and applicants.
- Each job card shows:
  - Status badge (`Open` / `In Progress` / `Completed`).
  - Count of interested worker applicants.
  - Applicant list with direct phone call links.
  - Actions: `Mark as Completed` and `Pay Wage Direct`.

### 7. Bank Details & Passbook Tab (`BankDetailsTab.tsx`)
- **Section A: Bank & Direct Payout Configuration:**
  - Bank selector with 12 popular Indian banks (SBI, BOB, PNB, HDFC, ICICI, IPPB, etc.) and custom bank option.
  - Account Number and Confirm Account Number inputs.
  - IFSC Code input with uppercase transformation and strict regex validation (`^[A-Z]{4}0[A-Z0-9]{6}$`).
  - UPI ID input with format validation.
  - Save button with animated success feedback.
- **Section B: Passbook / Payment Ledger:**
  - Filter pills: `All Transactions`, `Received (Income)`, `Sent (Expenses)`.
  - Search transactions input.
  - Transaction list displaying timestamp, type (`Worker Wage` / `Machine Rental`), settlement method (`Direct UPI` / `Net Banking`), transaction reference UTR, and amount in bold rupees.

### 8. Safety & SOS Tab (`SafetyTab.tsx`)
- **Section 1: 24x7 Emergency Helplines:**
  - `112` — All-in-One Emergency SOS (`bg-rose-50`, `border-rose-200`, direct `tel:112`).
  - `108` — Medical Ambulance & Rural Health SOS (`bg-amber-50`, direct `tel:108`).
  - `1800-180-1551` — Kisan Call Center (Agri Advisory, direct `tel:18001801551`).
  - `14434` — National Labour Helpline (Wage rights, direct `tel:14434`).
  - `1091` — Women Safety & Rural Helpline (direct `tel:1091`).
- **Section 2: Workplace Safety & Fair Wage Standards:** Structured advisory cards for heat stroke prevention, pesticide safety, and same-day payment guarantees.

---

## 7. Interactive Modals

### 1. Dual Auth Modal (`Auth.tsx`)
- Sub-tab selector: `Mobile Phone (OTP)` vs `Email & Password`.
- Role selector toggle: `Worker` (श्रमिक) vs `Job Hirer / Farmer` (नियोक्ता).
- **Phone Tab:**
  - Clean 10-digit input with `+91` prefix.
  - Step 1: `Send Verification Code`.
  - Step 2: 6-digit OTP input.
  - **Demo Mode Card:** If Live SMS is disabled, renders an amber alert card with the generated 6-digit OTP and an **Auto-fill** button for instant 1-click verification.
- **Email Tab:** Email, password (min 6 chars), and toggle for Sign In vs Sign Up.

### 2. Worker Profile Modal (`WorkerProfileModal.tsx`)
- Full name, mobile number, village/district location.
- Category selector with localized skill chips that append to the skills input on tap.
- Assisted Profile checkbox.
- Soft-deactivation button at bottom (`Deactivate My Profile`) with double-confirmation dialog.

### 3. Direct Payment Modal (`DirectPaymentModal.tsx`)
- Tabs: `Direct UPI` vs `Net Banking (IMPS/NEFT)`.
- Shows recipient's verified UPI ID or Bank Account No + IFSC.
- Quick copy buttons with "Copied!" checkmark feedback.
- Net Banking tab provides direct launch links to major bank retail portals.
- Logging form: Amount, Payment Method, Transaction Reference (UTR), and `Confirm & Record Settlement` button.
