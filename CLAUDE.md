# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RiplekApp is a creator platform for coaches, mentors, and small creators. It's a full-stack TypeScript monorepo enabling users to build public profile pages with booking, digital products, blogs, events, and expandable accordion sections.

## Commands

```bash
npm run dev        # Start development server (hot-reload)
npm run build      # Build for production (Vite frontend + esbuild backend)
npm run start      # Run production build
npm run check      # TypeScript type checking
npm run db:push    # Push Drizzle schema to Supabase
```

## Architecture

```
frontend/src/
├── pages/         # Route pages (lazy-loaded via Wouter)
├── components/    # React components (shadcn/ui based)
├── hooks/         # Custom React hooks (useAuth, useMobile, etc.)
├── lib/           # Utilities (queryClient, utils)
├── App.tsx        # Router and providers setup
└── main.tsx       # Entry point

backend/
├── index.ts       # Express server entry
├── routes.ts      # All API endpoints (~114 routes)
├── storage.ts     # File storage logic
├── db.ts          # Drizzle ORM connection
├── supabaseAuth.ts      # JWT verification middleware
├── supabaseStorage.ts   # Supabase file uploads
└── emailService.ts      # Resend email integration

shared/
├── schema.ts      # Drizzle ORM database schema
└── currencies.ts  # Multi-currency support
```

## Tech Stack

- **Frontend**: React 18, Wouter (routing), TanStack Query, Tailwind CSS, shadcn/ui (Radix)
- **Backend**: Express.js, Drizzle ORM, Multer (file uploads)
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth (Google OAuth + email/password)
- **Payments**: Stripe
- **Email**: Resend
- **Maps**: Google Maps API

## Key Patterns

### Path Aliases
- `@/*` → `frontend/src/*`
- `@shared/*` → `shared/*`

### API Routes Structure
- Public: `/api/profiles/:username/*` (products, blog, events, sessions)
- Protected: `/api/dashboard/*` (requires JWT via `requireAuth` middleware)
- Auth: `/api/auth/*`

### Authentication
Frontend uses `useAuth()` hook. Backend validates JWT with `requireAuth` middleware from `supabaseAuth.ts`.

### Database
- Use Drizzle ORM exclusively for queries
- Schema in `shared/schema.ts` - never use destructive operations (DROP, TRUNCATE)
- Add columns to Supabase first, then update Drizzle schema

### File Uploads
- Images: 5MB limit
- Product files: 100MB limit (PDF, video, images)
- Storage via Supabase Storage buckets

## Environment Variables

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DATABASE_URL
STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY
RESEND_API_KEY
GOOGLE_MAPS_API_KEY

# AI Profile (Design Brief generator) — see .env.example for full descriptions
ANTHROPIC_API_KEY          # required for /studio Generate + Rework (else returns 503)
ENABLE_AI_PROFILE          # server flag: gates publish + generate (feature ships dark)
VITE_ENABLE_AI_PROFILE     # client flag: gates the /studio editor
AI_PROFILE_GEN_MODEL       # optional, default claude-opus-4-8
AI_PROFILE_EDIT_MODEL      # optional, default claude-haiku-4-5-20251001
```

## Development Notes

- Server runs on port 5000 (only non-firewalled Replit port)
- Frontend and API served from same port
- Vite handles HMR in development
- Code splitting: vendor (React), query (TanStack), ui (Radix) chunks
