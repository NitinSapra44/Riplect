import { useLocation } from "wouter";

/**
 * Returns a goBack() function that navigates smartly:
 * 1. If there is history in the current tab → uses window.history.back()
 * 2. Otherwise (direct link, new tab, no history) → navigates to fallbackPath
 *
 * Note: document.referrer is NOT used because it is only set on full-page
 * loads and is never updated during client-side SPA navigation. Using it
 * caused back() to always fall through to the fallback path after in-app
 * navigation via <Link>. window.history.length > 1 is the correct SPA check.
 */
export function useSmartBack(fallbackPath: string) {
  const [, navigate] = useLocation();

  return () => {
    try {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        navigate(fallbackPath);
      }
    } catch {
      navigate(fallbackPath);
    }
  };
}
