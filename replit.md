# Riplek Platform - Replit Development Guide

## Overview
Riplek is a comprehensive creator platform for coaches, healers, mentors, freelancers, and small creators. It enables users to build personalized public profile pages with integrated features for booking, digital products, blogs, and events. The platform aims to provide a robust online presence for creators, simplifying their business operations and expanding their reach through expandable sections for a clean UI and progressive disclosure.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Design Principles
The application follows a traditional full-stack architecture with modern tooling, emphasizing type safety, developer experience, and user-friendly interfaces. Key architectural decisions include:
- **Monorepo Structure**: A unified TypeScript project with shared directories for frontend and backend.
- **Expandable Profile Sections**: Accordion-style sections on public profiles.
- **JWT-based Authentication**: Secure authentication via Supabase Auth.

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **Styling**: Tailwind CSS with shadcn/ui components
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite
- **Authentication**: Supabase Auth client

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Database**: Supabase PostgreSQL with Drizzle ORM via `postgres.js`.
- **Authentication**: Supabase Auth with JWT token verification.
- **API**: RESTful API with JSON responses.

### Database Architecture Overview

> **IMPORTANT — SUPABASE IS THE ONLY DATABASE.**
> Replit's built-in managed PostgreSQL is **not used by this project at all** — not in development, not in production, not for any feature. Every table (profiles, bookings, events, etc.) lives in **Supabase PostgreSQL** and is accessed via `SUPABASE_DATABASE_URL`. The Replit `execute_sql_tool` / `executeSql()` callback queries the Replit-managed database and will always return empty results for this project. To inspect or mutate data, use the **Supabase SQL editor** or the Supabase dashboard directly.

- **Sole Database**: Supabase PostgreSQL (`SUPABASE_DATABASE_URL`) for all application data — both development and production share the same Supabase project (different schemas/environments as needed).
- **Auth**: Supabase Auth (`auth.users`, `auth.identities`) — managed entirely by Supabase GoTrue.
- **Schema Changes**: Must be additive and non-destructive. Changes are applied directly in the **Supabase SQL editor**, then the Drizzle schema in `shared/schema.ts` is updated to match. Drizzle migrations (`drizzle-kit push` / `generate`) are **not** used for production schema changes.

#### Standing policies — Drizzle ↔ Supabase sync

> **These rules are non-negotiable. Violating them will cause orphaned data and FK errors on account deletion.**

1. **Schema must always be in sync.** Every table, column, and constraint declared in `shared/schema.ts` must exist in the live Supabase database with identical definitions. When adding a table or column: apply the DDL in the Supabase SQL editor first, then update `shared/schema.ts` to match.

2. **FK `onDelete` must match exactly.** Every foreign key to `profiles.id` (or any parent table) must declare `onDelete` in Drizzle and have an identical `ON DELETE` clause in Supabase. The two canonical actions used in this project are:
   - `ON DELETE CASCADE` — all profile-owned data (sessions, bookings, events, products, wallet, notifications, etc.). These 20 tables are confirmed in sync as of May 2025.
   - `ON DELETE SET NULL` — records intentionally preserved after the creator deletes their account: `digital_product_purchases.buyer_profile_id` (purchase history kept), `guest_profiles.origin_coach_id` (guests preserved), `tags.created_by` (tags preserved).

3. **Account deletion cascades automatically.** Deleting a `profiles` row removes all child data via the FK cascade chain — no manual cleanup is needed or allowed. Additionally, an `AFTER DELETE` trigger on `auth.users` (`handle_auth_user_deleted`) propagates auth user deletion to `public.profiles`, which then cascades to all child tables. This means deleting an account from the Supabase dashboard or API cleans up everything automatically.

4. **Never leave orphaned FKs.** If you add a new table that references `profiles.id`, you must: (a) declare `onDelete: "cascade"` in the Drizzle schema, (b) include `ON DELETE CASCADE` in the Supabase `CREATE TABLE` DDL, (c) verify with `SELECT ... FROM information_schema.referential_constraints` that the constraint exists with the correct `delete_rule`.

### Key Features
- **Authentication System**: Supabase Auth for various methods (Google OAuth, email/password) and JWT-based authorization, with a unified identity model (one `auth.users` row with verified email and phone).
- **Profile System**: Public profiles, demo profiles, social media, and custom links.
- **Booking Calendar**: Session scheduling, custom booking questions, mentor availability, pending coach confirmation, and in-app coach notifications via SSE.
- **Guest Portal System**: Unified guest profiles, `origin_coach_id` tracking, multiple authentication methods, and activity feed.
- **Bio Management**: Short/long bio sections supporting images/videos and professional titles.
- **Digital Products**: PDF, video, and image products with free/paid toggles, secure upload to Supabase private storage, purchase tracking, and secure download.
- **Other Modules**: Blog System, Events & Workshops (with recurring events), Gallery, Physical Products Shop, Creator Search & Discovery, Contact Management, Custom Links Management.
- **Profile Picture Upload**: Drag & drop upload with image cropping.
- **Unsaved Changes Guard**: Global warning system for unsaved changes.
- **Location Management System**: IP Geolocation auto-population, Google Maps integration, and granular public visibility control.
- **Multi-Currency Support**: Supports 15+ currencies across monetization features.
- **Consolidated Tags System**: Tags from all content types sync to profile tags.
- **Onboarding Wizard**: 5-step onboarding flow for new users with robust identity management and conflict prevention.
- **Global City Search Filter**: Uses Google Places Autocomplete API.
- **Booking Management System**: Event-sourced with an immutable `booking_events` table, race condition prevention, and in-app notifications.
- **Notification History Panel**: Persistent notification history stored in `coach_notifications` table.
- **Booking Inbox**: Consolidated 4-tab structure (Needs Action, Sessions, Events, Products).
- **Payment Coordination System**: Riplek facilitates payment details sharing; coaches verify payments externally.
- **Event Email Matrix**: Comprehensive transactional email system for guest and coach across all event registration scenarios.
- **Google Calendar + Meet Integration**: Integration for event creation with Google Meet links.

### Performance Optimizations
- **Code Splitting**: Route-based lazy loading and manual chunk splitting.
- **Image Optimization**: `OptimizedImage` and `AvatarImage` components.
- **SEO & Accessibility**: Meta tags, preconnect hints, `robots.txt`, viewport accessibility.

### Security Hardening
- Debug endpoints removed.
- Guest portal API projection for safe fields.
- No token logging.
- Race condition prevention for booking updates.
- Timezone fixes and input validation.

## External Dependencies

### Database
- **Supabase**: PostgreSQL database with built-in authentication and storage.

### UI Components
- **shadcn/ui**: Pre-built Radix UI components.
- **Radix UI**: Headless UI primitives.
- **Lucide React**: Icon library.

### Development Tools
- **Vite**: Build tool.
- **TypeScript**: For type safety.
- **Tailwind CSS**: Utility-first CSS framework.

### Other Integrations
- **Supabase Auth**: Email verification, password resets, OAuth providers.
- **Supabase Storage**: File storage with `public`, `secure_products`, and `Payment_Proof` buckets.
- **Stripe**: For payment processing (for digital products/events).
- **Google Places Autocomplete API**: For global city search.
- **Google Calendar API**: For coach calendar integration.
- **Twilio**: WhatsApp bot (`backend/whatsapp/`) and phone OTP delivery (`backend/auth/phoneVerification.ts`).

### Phone OTP Architecture
Two separate systems handle phone OTP:
1. **Login page** (`/auth`): Uses Supabase `signInWithOtp` with `channel: "whatsapp"|"sms"`. Entirely managed by Supabase GoTrue — uses Supabase's own Twilio config from the Supabase dashboard Auth → Phone settings. Our env vars do NOT affect this path.
2. **Onboarding contact step** (`/api/auth/phone/send-otp`): Custom Twilio integration in `backend/auth/phoneVerification.ts`. Delivery priority: (a) Twilio Verify if `TWILIO_VERIFY_SERVICE_SID` is set, (b) raw `messages.create` with auto WhatsApp→SMS fallback. Uses `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_SMS_FROM`.
- When Twilio Verify is used, a `TWILIO_VERIFY` sentinel is stored in the `code_hash` column of `phone_verifications`, and verification goes through Twilio's check API instead of local hash comparison.