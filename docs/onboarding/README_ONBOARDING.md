# Onboarding Documentation

## Executive Summary

RiplekApp is a full-stack TypeScript creator platform enabling coaches, mentors, and freelancers to build public profile pages with integrated booking, digital products, blog, and events. The tech stack is modern and well-chosen: React 18 with TanStack Query on the frontend, Express with Drizzle ORM on the backend, and Supabase for PostgreSQL database, authentication, and file storage. The codebase follows a clean monorepo structure (`frontend/`, `backend/`, `shared/`) with consistent patterns for data fetching, form handling, and UI components via shadcn/ui.

However, the project has accumulated technical debt that needs attention before scaling. The most pressing concerns are: (1) **security gaps**—no rate limiting, Helmet, or CORS middleware; (2) **a monolithic 3,500-line routes file** that should be split into domain modules; and (3) **zero test coverage**. The code quality is consistent (suggesting a single primary author) but has shortcuts like extensive `any` type usage and 200+ console.log statements. A new developer should start by reading the structure and data flow docs below, then review the assessment for prioritized improvement tasks.

---

## Table of Contents

| Document | Description |
|----------|-------------|
| [01_structure.md](./01_structure.md) | Tech stack, folder hierarchy, entry points, configuration files |
| [02.1_data_flow_server.md](./02.1_data_flow_server.md) | Server request lifecycle, middleware, database access, external services |
| [02.2_data_flow_client.md](./02.2_data_flow_client.md) | React data fetching, authentication, mutations, routing, state management |
| [02.3_data_flow_shared.md](./02.3_data_flow_shared.md) | Drizzle schema, TypeScript types, Zod validation, currency utilities |
| [03_assessment.md](./03_assessment.md) | Technical debt, security risks, scalability concerns, quick wins checklist |

---

## Quick Start for New Developers

### 1. Read the Docs (30 min)
1. Start with **01_structure.md** to understand the project layout
2. Skim **02.1-02.3** for the layer you'll be working in
3. Review **03_assessment.md** for known issues and priorities

### 2. Run the Project
```bash
npm install
npm run dev          # Starts dev server on port 5000
npm run check        # TypeScript type checking
```

### 3. Key Files to Know
| Purpose | File |
|---------|------|
| API routes | `backend/routes.ts` |
| Database queries | `backend/storage.ts` |
| DB schema & types | `shared/schema.ts` |
| React entry | `frontend/src/App.tsx` |
| Auth hook | `frontend/src/hooks/useAuth.ts` |
| API helper | `frontend/src/lib/queryClient.ts` |

### 4. First Contribution Ideas
- Add Helmet middleware to `backend/index.ts`
- Replace a `console.log` with proper error handling
- Add Zod validation to an unvalidated route
- Write the first test file

---

## Document Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-19 | Claude Code | Initial creation of all onboarding docs |
