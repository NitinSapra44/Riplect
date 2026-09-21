import { useCallback, type ReactNode, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { useConfirmNavigation } from "@/hooks/use-unsaved-changes";
import { cn } from "@/lib/utils";

interface GuardedLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  "data-testid"?: string;
}

export function GuardedLink({ href, children, className, onClick, "data-testid": testId }: GuardedLinkProps) {
  const { confirmNavigation, hasUnsavedChanges } = useConfirmNavigation();
  const [, setLocation] = useLocation();

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        confirmNavigation(() => {
          if (onClick) onClick(e);
          setLocation(href);
        });
      } else if (onClick) {
        onClick(e);
      }
    },
    [confirmNavigation, hasUnsavedChanges, href, onClick, setLocation]
  );

  return (
    <Link href={href} onClick={handleClick} className={cn(className)} data-testid={testId}>
      {children}
    </Link>
  );
}

interface GuardedButtonProps {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  "data-testid"?: string;
}

export function useGuardedNavigation() {
  const { confirmNavigation, hasUnsavedChanges } = useConfirmNavigation();
  const [, setLocation] = useLocation();

  const navigate = useCallback(
    (href: string) => {
      if (hasUnsavedChanges()) {
        confirmNavigation(() => {
          setLocation(href);
        });
      } else {
        setLocation(href);
      }
    },
    [confirmNavigation, hasUnsavedChanges, setLocation]
  );

  const guardedAction = useCallback(
    (callback: () => void) => {
      if (hasUnsavedChanges()) {
        confirmNavigation(callback);
      } else {
        callback();
      }
    },
    [confirmNavigation, hasUnsavedChanges]
  );

  return { navigate, guardedAction, hasUnsavedChanges };
}
