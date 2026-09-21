import { useState } from "react";
import { useLocation } from "wouter";
import type { Cta } from "@shared/brief";
import { defaultCtaLabel } from "@shared/brief";
import { formatPrice } from "@shared/currencies";
import type { ProfileBundle } from "@/hooks/useProfileBundle";
import { ctaClassName } from "./theme";
import { DigitalProductPaymentModal } from "@/components/digital-product-payment-modal";
import { FreeProductDownloadModal } from "@/components/free-product-download-modal";
import { EventQuickRegister } from "@/components/event-quick-register";

/**
 * The CTA action bridge. A CTA is a TYPED action — never a raw href. Each kind
 * resolves to the REAL platform flow:
 *   - buyDigital / registerEvent: open the existing Stripe / registration flow
 *     in place ("modal"), or route to the entity's full page ("navigate") — the
 *     `presentation` field picks which, and is honored here.
 *   - book / buyPhysical: bring the visitor to the on-page section that hosts the
 *     working flow (the booking calendar / purchase cards). These scroll because
 *     the flow is inline, not a modal.
 *   - whatsapp / social: external link. contact / captureLead: jump to the form.
 *
 * Transactional CTAs whose entity can't be resolved render nothing (the server
 * normalizer also drops them) — so there are never dead buttons.
 */
export function CtaButton({
  cta,
  bundle,
  username,
  creatorName,
}: {
  cta: Cta;
  bundle: ProfileBundle;
  username: string;
  creatorName: string;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [, navigate] = useLocation();
  const label = cta.label || defaultCtaLabel(cta.action);
  const cls = ctaClassName(cta.style);
  const badge = cta.liveBadge ? liveBadgeText(cta, bundle) : null;
  const content = (
    <>
      <span>{label}</span>
      {badge && (
        <span
          className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: "var(--rk-accent-soft)", color: "var(--rk-text)" }}
        >
          {badge}
        </span>
      )}
    </>
  );

  const scrollTo = (kind: string) => () => {
    document.getElementById(`rk-${kind}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const action = cta.action;
  switch (action.kind) {
    case "book":
      return (
        <button type="button" className={cls} onClick={scrollTo("sessions")} data-testid="cta-book">
          {content}
        </button>
      );

    case "waitlist":
      return (
        <button
          type="button"
          className={cls}
          onClick={scrollTo(action.eventId ? "events" : "sessions")}
        >
          {content}
        </button>
      );

    case "registerEvent": {
      const event = bundle.events.find((e: any) => e.id === action.eventId);
      if (!event) return null;
      // "navigate" → the event's full detail page; otherwise open the quick
      // register flow in place.
      if (cta.presentation === "navigate") {
        const href = (event as any).seriesId
          ? `/${username}/event/${(event as any).seriesId}?asSeriesRoot=true`
          : `/${username}/event/${(event as any).id}`;
        return (
          <button type="button" className={cls} onClick={() => navigate(href)} data-testid="cta-register-event">
            {content}
          </button>
        );
      }
      // Reuse the platform's own register button — it routes free vs. paid itself.
      return (
        <EventQuickRegister
          event={event as any}
          username={username}
          creatorName={creatorName}
          buttonLabel={label}
          buttonClassName={cls}
        />
      );
    }

    case "buyDigital": {
      const product = bundle.products.find((p: any) => p.id === action.productId);
      if (!product) return null;
      const isFree = (product as any).isFree;
      // "navigate" → the product's full page; otherwise open the payment/download
      // modal in place.
      if (cta.presentation === "navigate") {
        return (
          <button
            type="button"
            className={cls}
            onClick={() => navigate(`/${username}/product/${(product as any).id}`)}
            data-testid="cta-buy-digital"
          >
            {content}
          </button>
        );
      }
      return (
        <>
          <button
            type="button"
            className={cls}
            onClick={() => setPayOpen(true)}
            data-testid="cta-buy-digital"
          >
            {content}
          </button>
          {isFree ? (
            <FreeProductDownloadModal
              isOpen={payOpen}
              onClose={() => setPayOpen(false)}
              onDownloadSuccess={() => setPayOpen(false)}
              product={product as any}
            />
          ) : (
            <DigitalProductPaymentModal
              isOpen={payOpen}
              onClose={() => setPayOpen(false)}
              onPurchaseSuccess={() => setPayOpen(false)}
              product={product as any}
            />
          )}
        </>
      );
    }

    case "buyPhysical":
      return (
        <button type="button" className={cls} onClick={scrollTo("physicalProducts")}>
          {content}
        </button>
      );

    case "contact":
    case "captureLead":
      return (
        <button type="button" className={cls} onClick={scrollTo("contact")} data-testid="cta-contact">
          {content}
        </button>
      );

    case "whatsapp": {
      const num = (
        bundle.profile?.contactInfo?.whatsapp ||
        bundle.profile?.socialLinks?.whatsapp ||
        bundle.profile?.contactInfo?.callToAction?.whatsAppNumber ||
        ""
      ).replace(/[^\d]/g, "");
      if (!num) return null;
      return (
        <a
          href={`https://wa.me/${num}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          data-testid="cta-whatsapp"
        >
          {content}
        </a>
      );
    }

    case "social": {
      const url = socialUrl(bundle, action.platform);
      if (!url) return null;
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>
          {content}
        </a>
      );
    }

    default:
      return null;
  }
}

/* --- live data on the trigger (the "current/alive" win) ----------------- */

function liveBadgeText(cta: Cta, bundle: ProfileBundle): string | null {
  try {
    const action = cta.action;
    switch (action.kind) {
      case "book": {
        const s: any = bundle.sessions.find((x: any) => x.id === action.sessionId) || bundle.sessions[0];
        if (!s) return null;
        return s.isFree ? "Free" : formatPrice(s.price, s.currency || "USD");
      }
      case "registerEvent": {
        const e: any = bundle.events.find((x: any) => x.id === action.eventId);
        if (!e?.startAt) return null;
        return new Date(e.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      case "buyDigital": {
        const p: any = bundle.products.find((x: any) => x.id === action.productId);
        if (!p) return null;
        return p.isFree ? "Free" : formatPrice(p.price, p.currency || "USD");
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function socialUrl(bundle: ProfileBundle, platform: string): string | null {
  const p = bundle.profile;
  const fromList = p?.contactInfo?.socialMediaLinks?.find(
    (s: any) => String(s.platform).toLowerCase() === platform.toLowerCase(),
  )?.url;
  if (fromList) return fromList;
  const direct = (p?.socialLinks as any)?.[platform.toLowerCase()];
  return typeof direct === "string" ? direct : null;
}
