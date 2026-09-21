import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Error boundary around the Brief renderer. If anything in the Brief path throws
 * at render time, it calls onError() (so the host can fall back to the classic
 * layout) and renders nothing in the meantime. This makes the published-Brief
 * branch in profile.tsx safe by construction: any failure reverts to today's page.
 */
export class BriefBoundary extends Component<
  { children: ReactNode; onError: () => void; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[BriefBoundary] brief render failed, falling back:", error, info);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
