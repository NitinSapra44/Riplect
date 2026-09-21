# Project Structure Overview

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Wouter | Lightweight client-side routing |
| TanStack Query | Server state management & caching |
| Tailwind CSS | Utility-first styling |
| shadcn/ui (Radix) | Component library (47 UI primitives) |
| React Hook Form + Zod | Form handling & validation |
| Framer Motion | Animations |
| Vite | Build tool & dev server |

### Backend
| Technology | Purpose |
|------------|---------|
| Express.js | HTTP server |
| Drizzle ORM | Database queries & schema |
| Multer | File upload handling |
| Supabase Auth | Authentication (OAuth + email) |
| Stripe | Payment processing |
| Resend | Email notifications |

### Database & Infrastructure
| Technology | Purpose |
|------------|---------|
| Supabase PostgreSQL | Production database |
| Supabase Storage | File storage (images, products) |
| Google Maps API | Location services |

---

## Folder Hierarchy

| Folder | Description |
|--------|-------------|
| `frontend/` | Frontend React application |
| `frontend/src/pages/` | Route page components (13 pages, lazy-loaded) |
| `frontend/src/components/` | Feature components (42 custom + 47 UI primitives) |
| `frontend/src/components/ui/` | shadcn/ui base components |
| `frontend/src/hooks/` | Custom React hooks (5 hooks) |
| `frontend/src/lib/` | Utilities: queryClient, supabase client, helpers |
| `frontend/src/assets/` | Static assets (SVGs) |
| `frontend/public/` | Public static files (robots.txt) |
| `backend/` | Backend Express application |
| `shared/` | Shared types: Drizzle schema, currency definitions |
| `migrations/` | Drizzle database migration files |
| `attached_assets/` | Reference images and design assets |
| `dist/` | Production build output (gitignored) |

---

## Entry Points

### Client Entry Points

| File | Role |
|------|------|
| `frontend/index.html` | HTML shell, mounts React to `#root` |
| `frontend/src/main.tsx` | React bootstrap, renders `<App />` |
| `frontend/src/App.tsx` | Providers (QueryClient, Tooltip, UnsavedChanges) + Router |

### Server Entry Points

| File | Role |
|------|------|
| `backend/index.ts` | Express app init, middleware, starts server on port 5000 |
| `backend/routes.ts` | All API route definitions (~114 endpoints) |
| `backend/db.ts` | Drizzle ORM database connection |

### Shared Entry Points

| File | Role |
|------|------|
| `shared/schema.ts` | Drizzle ORM table definitions |
| `shared/currencies.ts` | Multi-currency support utilities |

---

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies & npm scripts |
| `tsconfig.json` | TypeScript config with path aliases (`@/*`, `@shared/*`) |
| `vite.config.ts` | Vite build config, chunk splitting, path aliases |
| `tailwind.config.ts` | Tailwind theme (CSS vars, brand colors, animations) |
| `drizzle.config.ts` | Drizzle ORM config, points to `shared/schema.ts` |
| `postcss.config.js` | PostCSS with Tailwind plugin |
| `components.json` | shadcn/ui component registry config |
| `.replit` | Replit deployment configuration |

---

## Client Routes

| Route | Page Component | Description |
|-------|----------------|-------------|
| `/` | `home.tsx` | Landing/home page |
| `/auth` | `auth.tsx` | Login/signup |
| `/auth/callback` | `auth-callback.tsx` | OAuth callback handler |
| `/auth/reset-password` | `auth-reset-password.tsx` | Password reset flow |
| `/dashboard` | `dashboard.tsx` | Authenticated user dashboard |
| `/contact` | `contact.tsx` | Contact form |
| `/:username` | `profile.tsx` | Public creator profile |
| `/:username/blog/:slug` | `blog-post.tsx` | Blog post detail |
| `/:username/product/:productId` | `product-detail.tsx` | Digital product detail |
| `/:username/event/:eventId` | `event-detail.tsx` | Event detail |
| `/:username/session/:sessionId` | `session-detail.tsx` | Booking session detail |

---

## Key Path Aliases

```typescript
"@/*"       → "./frontend/src/*"
"@shared/*" → "./shared/*"
"@assets"   → "./attached_assets"
```
