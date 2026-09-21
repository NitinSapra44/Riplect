# Running RiplekApp Locally - Complete Guide

This guide explains how to run this Replit-based application on your local machine and deploy it independently.

---

## 1. Architecture Overview

RiplekApp is a **monolithic full-stack application** where a single Express server serves both the API and the React frontend.

```
┌─────────────────────────────────────────────────────────────┐
│                    Express Server (Port 5000)               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │   /api/* routes      │    │   Static Files / SPA      │  │
│  │   (API endpoints)    │    │   (React frontend)        │  │
│  └──────────────────────┘    └───────────────────────────┘  │
│           │                              │                  │
└───────────┼──────────────────────────────┼──────────────────┘
            │                              │
            ▼                              ▼
    ┌───────────────┐            ┌─────────────────┐
    │  /backend/     │            │   /frontend/      │
    │  routes.ts    │◄───────────│   React App     │
    │  db.ts        │  imports   │   (Wouter SPA)  │
    │  auth, etc.   │            │                 │
    └───────┬───────┘            └─────────────────┘
            │                              │
            │         ┌────────────────────┘
            │         │
            ▼         ▼
    ┌─────────────────────────┐
    │      /shared/           │
    │  schema.ts (Drizzle)    │
    │  currencies.ts          │
    └─────────────────────────┘
```

### Folder Responsibilities

| Folder | Purpose |
|--------|---------|
| `/server` | Express backend: API routes, database queries, auth middleware, file uploads, email service |
| `/client` | React frontend: pages, components, hooks, styling (Tailwind + shadcn/ui) |
| `/shared` | Code used by both: Drizzle ORM schema, type definitions, shared utilities |

### How They Interact

1. **Server imports shared schema** for database operations via Drizzle ORM
2. **Client imports shared types** for type-safe API responses
3. **In development**: Vite middleware handles frontend HMR through the Express server
4. **In production**: Express serves pre-built static files from `/dist/public/`

---

## 2. Local Readiness Assessment

### What Works Out of the Box
- Core application logic (routes, components, database queries)
- Build scripts (`npm run build`, `npm run dev`, `npm run start`)
- Database connection to Supabase
- Authentication via Supabase Auth
- Stripe payment integration
- File uploads via Supabase Storage

### What Requires Configuration
| Item | Issue | Solution |
|------|-------|----------|
| Environment variables | Not committed to repo | Create `.env` file manually |
| Port 5000 | Replit-specific (only non-firewalled port) | Works locally, change if needed |
| `trust proxy` | Set for Replit reverse proxy | Harmless locally, remove if not behind proxy |

### What Needs Adaptation
| Item | Replit Behavior | Local Adaptation |
|------|-----------------|------------------|
| **Resend Email** | Uses Replit Connectors API | Use `RESEND_API_KEY` env var directly |
| **Vite Plugins** | `runtimeErrorOverlay()`, `cartographer()` | Remove or conditionally load |
| **REPLIT_DOMAINS** | Auto-set by Replit | Set `APP_URL` manually |
| **Object Storage** | Replit object storage bucket | Not used (app uses Supabase Storage) |

---

## 3. Step-by-Step Local Setup

### Prerequisites

```bash
# Required
node --version  # v20.x or higher (project uses Node 20)
npm --version   # v9.x or higher

# Optional (for database management)
# PostgreSQL client for direct DB access
```

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd RiplekApp

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env  # If exists, otherwise create manually
```

### Environment Variables

Create a `.env` file in the project root:

```bash
# ===== REQUIRED =====

# Supabase (Database & Auth)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Stripe (Payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # For webhook verification

# ===== OPTIONAL =====

# Email Service (Resend)
RESEND_API_KEY=re_...  # Required for email functionality

# Google Maps
GOOGLE_MAPS_API_KEY=AIza...  # Required for location features

# App URL (defaults to http://localhost:5000)
APP_URL=http://localhost:5000
```

**Where to get these values:**
- **Supabase**: Project Settings → API (URL, anon key, service role key)
- **Supabase Database URL**: Project Settings → Database → Connection String (use "URI" format)
- **Stripe**: Dashboard → Developers → API Keys
- **Resend**: API Keys in Resend dashboard
- **Google Maps**: Google Cloud Console → APIs & Services → Credentials

### Code Modifications for Local Development

#### 1. Fix Vite Config (Remove Replit Plugins)

Edit `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    // Remove these Replit-specific plugins:
    // runtimeErrorOverlay(),
    // cartographer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: true,
  },
});
```

#### 2. Fix Email Service (Direct Resend API)

Edit `backend/emailService.ts` to use direct API key:

```typescript
// Replace the Replit connector logic with direct API key usage
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Update APP_URL to use env var
const APP_URL = process.env.APP_URL || 'http://localhost:5000';
```

#### 3. Optional: Change Port

If port 5000 conflicts with another service, edit `backend/index.ts`:

```typescript
const port = process.env.PORT || 5000;  // Change 5000 to your preferred port
```

### Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# The app will be available at:
# http://localhost:5000

# Production build
npm run build

# Run production build
npm run start

# Type checking
npm run check

# Push schema changes to database
npm run db:push
```

### Database Setup

The app uses Supabase PostgreSQL. No local database setup required if using the cloud database.

**For schema changes:**
```bash
# Push Drizzle schema to Supabase
npm run db:push

# Generate migration files (if needed)
npx drizzle-kit generate
```

---

## 4. Replit-Specific Configurations to Adapt

### Files to Modify or Remove

| File | Action | Notes |
|------|--------|-------|
| `.replit` | **Ignore** | Only used by Replit, harmless locally |
| `replit.md` | **Ignore** | Documentation for Replit AI |
| `vite.config.ts` | **Modify** | Remove `runtimeErrorOverlay()` and `cartographer()` plugins |
| `backend/emailService.ts` | **Modify** | Replace Replit Connectors with direct API key |

### Code Patterns to Address

**1. REPLIT_DOMAINS usage** (in `backend/emailService.ts`):
```typescript
// Before (Replit)
const APP_URL = process.env.REPLIT_DOMAINS
  ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
  : "http://localhost:5000";

// After (Local/Production)
const APP_URL = process.env.APP_URL || "http://localhost:5000";
```

**2. Replit Connector for Resend** (in `backend/emailService.ts`):
```typescript
// Before (Replit) - fetches API key from Replit connector
const xReplitToken = process.env.REPL_IDENTITY...
const response = await fetch(`https://${hostname}/api/v2/connection...`);

// After (Local) - use direct API key
const resend = new Resend(process.env.RESEND_API_KEY);
```

**3. Trust Proxy Setting** (in `backend/index.ts`):
```typescript
// This is set for Replit's reverse proxy
app.set('trust proxy', true);

// For local development: can remove or keep (harmless)
// For production behind a load balancer: keep it
```

---

## 5. Environment Configuration Strategy

### Recommended Approach: Single `.env` File with Overrides

```bash
# .env.local (local development - gitignored)
NODE_ENV=development
APP_URL=http://localhost:5000
SUPABASE_URL=https://your-dev-project.supabase.co
# ... other dev values

# .env.production (production values - may be gitignored or in CI/CD)
NODE_ENV=production
APP_URL=https://your-production-domain.com
SUPABASE_URL=https://your-prod-project.supabase.co
# ... other prod values
```

### Environment Variable Loading Order

For local development, you may want to use `dotenv`:

```bash
npm install dotenv
```

Then in `backend/index.ts` (at the very top):
```typescript
import 'dotenv/config';
```

### Sensitive vs Non-Sensitive Variables

| Variable | Sensitive? | Can Commit? |
|----------|------------|-------------|
| `SUPABASE_URL` | No | Yes (in example file) |
| `SUPABASE_ANON_KEY` | No | Yes (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | **Never** |
| `SUPABASE_DATABASE_URL` | **Yes** | **Never** |
| `STRIPE_SECRET_KEY` | **Yes** | **Never** |
| `STRIPE_PUBLISHABLE_KEY` | No | Yes (public by design) |
| `RESEND_API_KEY` | **Yes** | **Never** |

---

## 6. Separate Deployment Strategy

### Can You Continue Using Replit for Development?

**Yes**, with considerations:

| Aspect | Feasibility | Notes |
|--------|-------------|-------|
| Rapid prototyping | Excellent | Replit's "vibe coding" workflow preserved |
| Code sync | Manual | Push to Git, pull locally or on deployment platform |
| Database | Shared | Both Replit and production use same Supabase |
| Different configs | Required | Environment variables differ per environment |

### Recommended Architecture: Split Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT (Replit)                         │
│  - Full app runs on Replit for rapid development                │
│  - Uses development Supabase project                            │
│  - Quick iteration, AI assistance, "vibe coding"                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ git push
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION (Split)                           │
├────────────────────────────┬────────────────────────────────────┤
│     Frontend (Vercel)      │       Backend (Render/Railway)     │
│  - Static React build      │  - Express API server              │
│  - Global CDN              │  - Connects to prod Supabase       │
│  - Automatic deploys       │  - Handles file uploads            │
└────────────────────────────┴────────────────────────────────────┘
```

### Required Changes for Split Deployment

#### 1. Separate the Frontend

Create `frontend/vite.config.ts` (standalone frontend config):

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
  },
  define: {
    // Inject API URL at build time
    'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || ''),
  },
});
```

#### 2. Update API Calls to Use External URL

Modify `frontend/src/lib/queryClient.ts`:

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '';

export async function apiRequest(method: string, url: string, data?: unknown) {
  const fullUrl = `${API_BASE}${url}`;
  // ... rest of the function
}
```

#### 3. Add CORS to Backend

Modify `backend/index.ts`:

```typescript
import cors from 'cors';

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
```

Install CORS package:
```bash
npm install cors
npm install -D @types/cors
```

#### 4. Remove Static File Serving in Production API

Modify `backend/index.ts` for API-only mode:

```typescript
if (process.env.API_ONLY !== 'true') {
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
}
```

#### 5. Create Separate Package.json Scripts

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx backend/index.ts",
    "dev:client": "cd client && vite",
    "dev:server": "NODE_ENV=development API_ONLY=true tsx backend/index.ts",
    "build": "vite build && esbuild backend/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "build:client": "cd client && vite build",
    "build:server": "esbuild backend/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "start:api": "NODE_ENV=production API_ONLY=true node dist/index.js"
  }
}
```

### Platform-Specific Deployment

#### Vercel (Frontend)

Create `vercel.json` in `/client`:
```json
{
  "buildCommand": "npm run build:client",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Environment variables in Vercel dashboard:
```
VITE_API_URL=https://your-api.onrender.com
```

#### Render (Backend)

Create `render.yaml` in root:
```yaml
services:
  - type: web
    name: riplek-api
    env: node
    buildCommand: npm install && npm run build:server
    startCommand: npm run start:api
    envVars:
      - key: NODE_ENV
        value: production
      - key: API_ONLY
        value: true
      - key: FRONTEND_URL
        value: https://your-app.vercel.app
      - key: SUPABASE_URL
        fromDatabase: false
      # Add other env vars...
```

### Workflow Summary

| Environment | Frontend | Backend | Database |
|-------------|----------|---------|----------|
| **Replit Dev** | Vite (integrated) | Express (integrated) | Supabase Dev |
| **Local Dev** | `npm run dev` (integrated) | Express (integrated) | Supabase Dev |
| **Production** | Vercel (static) | Render (API) | Supabase Prod |

---

## Quick Reference

### Common Commands

```bash
# Local development
npm run dev                 # Full app with HMR
npm run check              # TypeScript type check
npm run db:push            # Push schema to database

# Production
npm run build              # Build frontend + backend
npm run start              # Run production build

# Split development (if configured)
npm run dev:client         # Frontend only (Vite dev server)
npm run dev:server         # Backend only (API mode)
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 5000 in use | Kill process or change port in `backend/index.ts` |
| Database connection fails | Verify `SUPABASE_DATABASE_URL` is correct |
| Auth not working | Check `SUPABASE_URL` and `SUPABASE_ANON_KEY` |
| Emails not sending | Add `RESEND_API_KEY` and update `emailService.ts` |
| Vite plugins error | Remove Replit-specific plugins from `vite.config.ts` |
| CORS errors (split deploy) | Add CORS middleware with correct `FRONTEND_URL` |

---

## Summary

**To run locally (quick start):**
1. Clone repo and run `npm install`
2. Create `.env` with required variables
3. Remove Replit plugins from `vite.config.ts`
4. Update `emailService.ts` to use direct `RESEND_API_KEY`
5. Run `npm run dev`

**To deploy separately:**
1. Configure CORS and API_ONLY mode in backend
2. Update frontend API calls to use `VITE_API_URL`
3. Deploy frontend to Vercel with `VITE_API_URL` env var
4. Deploy backend to Render with all server env vars
5. Continue using Replit for development with full integrated app
