# 02 — Technology Stack & Dependencies

## 1. Runtime Environment & Toolchain

| Component | Verified Specification | Notes |
|---|---|---|
| **Node.js Runtime** | Node.js `>= 18.0.0` (Recommended: Node.js 20 LTS) | Required for ESNext module support and Vite 5. |
| **Package Manager** | `npm` `>= 9.0.0` | Uses standard `package-lock.json` lockfile version 3. |
| **Build System** | [Vite 5.4.2](https://vitejs.dev/) with `@vitejs/plugin-react 4.3.1` | Instant HMR, ESM bundling, and PostCSS integration. |
| **Language** | [TypeScript 5.5.3](https://www.typescriptlang.org/) | Strict mode enabled, `isolatedModules: true`. |
| **Frontend Framework** | [React 18.3.1](https://react.dev/) & [React DOM 18.3.1](https://react.dev/) | Client-side rendering with `StrictMode` and code-splitting (`lazy`/`Suspense`). |
| **Styling Engine** | [Tailwind CSS 3.4.1](https://tailwindcss.com/) with PostCSS 8 & Autoprefixer | Custom color tokens, Manrope and DM Sans typography. |
| **Animation Library** | [Framer Motion 13.4.6](https://www.framer.com/motion/) | Tab switching, micro-interactions, modal transitions. |
| **Iconography** | [Lucide React 0.446.0](https://lucide.dev/) | Tree-shaken SVG icon collection. |
| **Backend & Database** | [Supabase Client 2.117.2](https://supabase.com/) | PostgreSQL 15+, Row Level Security (RLS), Supabase Auth. |
| **SMS Gateway** | [Fast2SMS](https://www.fast2sms.com/) Bulk V2 API | Native Indian mobile OTP dispatch. |
| **Audio Synthesis** | Browser Web Speech API (`window.speechSynthesis`) | Zero external SDK weight, native offline/device TTS. |
| **Testing Framework** | [Vitest 2.1.9](https://vitest.dev/) with `jsdom 29.1.1` & `@testing-library/react 16.3.3` | 468+ automated unit and integration tests. |

---

## 2. Production Dependencies (`dependencies`)

The following packages are installed as direct runtime dependencies in `package.json`:

| Package Name | Specified Version | Purpose in Application |
|---|---|---|
| `@supabase/supabase-js` | `^2.117.2` | Supabase API client for database operations, authentication sessions, and real-time queries. |
| `framer-motion` | `^13.4.6` | Powers smooth tab switches, modal entrance/exit animations, floating voice bar collapse, and pulse indicators. |
| `lucide-react` | `^0.446.0` | Modern SVG icons for agriculture, construction, emergency SOS, bank details, audio speakers, and status badges. |
| `react` | `^18.3.1` | Core React component architecture, hooks (`useState`, `useEffect`, `useCallback`, `lazy`, `Suspense`). |
| `react-dom` | `^18.3.1` | React DOM rendering engine mounted to `<div id="root"></div>`. |

---

## 3. Development Dependencies (`devDependencies`)

The following packages are required for compiling, linting, testing, and bundling the application:

| Package Name | Specified Version | Purpose |
|---|---|---|
| `@eslint/js` | `^9.9.1` | ESLint JavaScript core recommended rules. |
| `@testing-library/jest-dom` | `^7.0.1` | Custom jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`) for Vitest assertions. |
| `@testing-library/react` | `^16.3.3` | React component testing utilities (`render`, `screen`, `fireEvent`, `waitFor`). |
| `@types/react` | `^18.3.5` | TypeScript type definitions for React. |
| `@types/react-dom` | `^18.3.0` | TypeScript type definitions for React DOM. |
| `@vitejs/plugin-react` | `^4.3.1` | Vite plugin providing Babel/Fast Refresh support for React. |
| `autoprefixer` | `^10.4.18` | PostCSS plugin to parse CSS and add vendor prefixes. |
| `eslint` | `^9.9.1` | Next-generation flat config linter. |
| `eslint-plugin-react-hooks` | `^5.1.0-rc.0` | Enforces the Rules of Hooks. |
| `eslint-plugin-react-refresh` | `^0.4.11` | Validates components for hot module reloading. |
| `globals` | `^15.9.0` | Browser globals list for ESLint flat config. |
| `jsdom` | `^29.1.1` | Pure-JavaScript DOM implementation for running tests in Node.js. |
| `postcss` | `^8.4.35` | CSS transformation pipeline executing Tailwind CSS and Autoprefixer. |
| `tailwindcss` | `^3.4.1` | Utility-first CSS framework engine. |
| `typescript` | `^5.5.3` | TypeScript compiler and language server. |
| `typescript-eslint` | `^8.3.0` | TypeScript parsing and tooling for ESLint. |
| `vite` | `^5.4.2` | Frontend development server and production bundler. |
| `vitest` | `^2.1.9` | High-performance test runner built on Vite. |

---

## 4. Package Scripts Reference

Defined in `package.json`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit -p tsconfig.app.json",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Usage Commands:
```bash
# 1. Install all dependencies from package-lock.json
npm install

# 2. Start local development server (defaults to http://localhost:5173)
npm run dev

# 3. Type check the application code without emitting output
npm run typecheck

# 4. Run ESLint across the codebase
npm run lint

# 5. Execute all 468+ automated unit and integration tests
npm test

# 6. Run automated tests in interactive watch mode
npm run test:watch

# 7. Compile and bundle for production into /dist
npm run build

# 8. Locally preview the production bundle
npm run preview
```

---

## 5. Toolchain Configuration Files

### 1. `vite.config.ts`
- **Plugin:** `@vitejs/plugin-react`
- **Path Alias:** Resolves `@/` to `./src/`
- **Dependency Optimization:** Excludes `lucide-react` from pre-bundling to ensure dynamic tree-shaking:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
```

### 2. `vitest.config.ts`
- **Environment:** `jsdom`
- **Globals:** `true` (enables `describe`, `it`, `expect`, `vi` without imports)
- **Setup Files:** Points to `./src/test/setup.ts` (mocks browser `window.speechSynthesis`)
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### 3. `tailwind.config.js`
- **Content Paths:** `"./index.html"`, `"./src/**/*.{js,ts,jsx,tsx}"`
- **Custom Color Palette:**
  - `brand`: 50 (`#eef8f4`), 100 (`#d7efe6`), 200 (`#b0dfcf`), 300 (`#7ec6b0`), 500 (`#007a5b`), 600 (`#05684d`), 700 (`#13795f`), 800 (`#0b5240`)
  - `surface`: `#fbfcf8`
  - `borderLight`: `#e4e7ec`
  - `ink`: `primary` (`#18201b`), `muted` (`#5c6460`), `light` (`#8d9590`)
- **Custom Font Families:**
  - `sans`: `['DM Sans', 'sans-serif']`
  - `heading`: `['Manrope', 'sans-serif']`

### 4. `postcss.config.js`
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 5. `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- **Target:** `ES2020` / `ES2022`
- **Module Resolution:** `bundler`
- **JSX:** `react-jsx`
- **Strict Mode:** `true`
- **Path Aliases:** `@/*` -> `src/*`
- **Unused Locals/Params:** Configured non-blocking (`false`) to ensure resilient rapid prototyping without stopping compilation.

### 6. `.vscode/settings.json`
```json
{
  "css.lint.unknownAtRules": "ignore"
}
```
*Prevents CSS language server warnings when importing Tailwind CSS.*
