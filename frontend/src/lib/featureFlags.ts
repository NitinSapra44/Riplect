// Client feature flags.
//
// AI Profile defaults ON. It does NOT change the public site by itself: a
// creator's page only switches to the Brief-driven layout once they explicitly
// publish (see the guarded branch in profile.tsx). So exposing the /studio
// editor everywhere is safe, and it avoids depending on build-time env vars
// propagating into Replit previews/deploys.
//
// The server (GET /api/dashboard/brief → `enabled`) is the source of truth for
// whether publish/generate work; this client flag only controls the dashboard
// entry point. Set VITE_ENABLE_AI_PROFILE="false" to hide it.
export const AI_PROFILE_ENABLED = import.meta.env.VITE_ENABLE_AI_PROFILE !== "false";
