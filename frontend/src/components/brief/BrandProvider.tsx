import { useEffect, type ReactNode } from "react";
import type { Brand } from "@shared/brief";
import { brandToCssVars, googleFontsHref } from "./theme";

/**
 * Writes the brand world onto a scoped wrapper as CSS variables, and lazily
 * injects a Google Fonts <link> for the chosen heading/body fonts.
 *
 * Because the shadcn color variables in this repo are stored as raw hex,
 * BrandProvider can override --primary / --accent within its own subtree — so
 * changing one color re-themes the new blocks AND the reused section components.
 */
export function BrandProvider({ brand, children, className = "" }: {
  brand: Brand;
  children: ReactNode;
  className?: string;
}) {
  const href = googleFontsHref([brand.typography.heading, brand.typography.body]);

  useEffect(() => {
    if (!href || typeof document === "undefined") return;
    if (document.querySelector(`link[data-rk-font][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-rk-font", "");
    document.head.appendChild(link);
    // Intentionally left mounted to avoid font flicker while editing.
  }, [href]);

  return (
    <div className={`rk-root ${className}`} style={brandToCssVars(brand)}>
      {children}
    </div>
  );
}
