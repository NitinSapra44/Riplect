import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

const MODULE_RELOAD_KEY = "eb_module_reload_attempted";

function safeSessionGet(key: string): string | null {
  try {
    return typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    if (typeof window !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeSessionRemove(key: string): void {
  try {
    if (typeof window !== "undefined") sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isModuleLoadError(error: Error): boolean {
  const msg = error?.message?.toLowerCase() ?? "";
  if (
    msg.includes("importing a module script failed") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk")
  ) {
    return true;
  }

  // Symptoms of a stale chunk / duplicate-React situation where a hook
  // (e.g. useFieldArray, useForm) ends up undefined at call time. These
  // recover after a reload because the page re-fetches fresh chunks.
  const hookSymbols = [
    "usefieldarray",
    "useform",
    "usewatch",
    "usecontroller",
    "useformcontext",
    "usefieldarraycontext",
  ];
  const referenceErrorPatterns = [
    "can't find variable:",
    "is not defined",
    "is not a function",
    "undefined is not an object",
    "cannot read properties of undefined",
  ];
  const hasHookSymbol = hookSymbols.some((s) => msg.includes(s));
  const looksLikeReferenceError = referenceErrorPatterns.some((p) =>
    msg.includes(p),
  );
  if (hasHookSymbol && looksLikeReferenceError) {
    return true;
  }

  // React's "more than one copy of React" / invalid hook call also
  // resolves after a hard reload that re-runs Vite's pre-bundling.
  if (
    msg.includes("invalid hook call") ||
    msg.includes("more than one copy of react")
  ) {
    return true;
  }

  return false;
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  shouldAutoReload: boolean;
  reloadAttempted: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    shouldAutoReload: false,
    reloadAttempted: false,
  };

  static getDerivedStateFromError(error: Error): State {
    const moduleError = isModuleLoadError(error);
    const alreadyAttempted = safeSessionGet(MODULE_RELOAD_KEY) === "1";

    if (moduleError && !alreadyAttempted) {
      return {
        hasError: true,
        shouldAutoReload: true,
        reloadAttempted: false,
      };
    }

    if (moduleError && alreadyAttempted) {
      return {
        hasError: true,
        shouldAutoReload: false,
        reloadAttempted: true,
      };
    }

    return { hasError: true, shouldAutoReload: false, reloadAttempted: false };
  }

  componentDidMount() {
    if (!this.state.hasError) {
      safeSessionRemove(MODULE_RELOAD_KEY);
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Tab error:", error, info);

    if (this.state.shouldAutoReload) {
      safeSessionSet(MODULE_RELOAD_KEY, "1");
      window.location.reload();
      return;
    }

    if (this.state.reloadAttempted) {
      safeSessionRemove(MODULE_RELOAD_KEY);
    }
  }

  render() {
    const { hasError, shouldAutoReload, reloadAttempted } = this.state;

    if (hasError) {
      if (shouldAutoReload) {
        return (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <p className="text-gray-600 mb-4">
              Page failed to load — reloading…
            </p>
          </div>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <p className="text-gray-600 mb-4">
            {reloadAttempted
              ? "Page failed to load after reloading — please try again."
              : "Page failed to load — please reload."}
          </p>
          <Button
            variant="outline"
            data-testid="button-reload-page"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
