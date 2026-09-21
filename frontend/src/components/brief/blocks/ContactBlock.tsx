import { useState } from "react";
import { Phone, Mail, Globe, MessageCircle, MapPin, Loader2, Send } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type { Brand, Section } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { posthog } from "@/lib/posthog";
import { CtaButton } from "../CtaButton";
import { sectionHeadingClass } from "../theme";

/** Contact — a branded contact card with a WORKING message form (restored).
 *  The form posts to the same endpoint the classic profile uses
 *  (POST /api/profiles/:profileId/contact), so publishing a Brief never loses the
 *  inbound channel. Contact-method links (tel/mailto/wa.me) sit alongside it. */
export function ContactBlock({
  section,
  bundle,
  brand,
  username,
  creatorName,
}: {
  section: Section;
  bundle: ProfileBundle;
  brand: Brand;
  username: string;
  creatorName: string;
}) {
  const profile = bundle.profile;
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });

  const contactMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", `/api/profiles/${profile?.id}/contact`, data);
      return res.json();
    },
    onSuccess: (data) => {
      posthog.capture("contact_form_submitted", { coach_username: username });
      toast({ title: "Message sent!", description: data?.message || "Your message has been sent." });
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error?.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) {
      toast({
        title: "Please fill in all required fields",
        description: "Name, email, subject, and message are required.",
        variant: "destructive",
      });
      return;
    }
    contactMutation.mutate(form);
  };

  const ci = profile?.contactInfo ?? {};
  const phone = (ci.phone || ci.callToAction?.callNumber || "").trim();
  const whatsapp = (ci.whatsapp || ci.callToAction?.whatsAppNumber || "").trim();
  const email = (ci.email || ci.callToAction?.emailAddress || "").trim();
  const website = (ci.website || "").trim();
  const loc = ci.location;
  const address = loc ? [loc.city, loc.state, loc.country].filter(Boolean).join(", ") : "";

  const methods: Array<{ icon: any; label: string; value: string; href: string }> = [];
  if (phone) methods.push({ icon: Phone, label: "Phone", value: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  if (whatsapp)
    methods.push({ icon: MessageCircle, label: "WhatsApp", value: whatsapp, href: `https://wa.me/${whatsapp.replace(/[^\d]/g, "")}` });
  if (email) methods.push({ icon: Mail, label: "Email", value: email, href: `mailto:${email}` });
  if (website)
    methods.push({
      icon: Globe,
      label: "Website",
      value: website.replace(/^https?:\/\//, ""),
      href: website.startsWith("http") ? website : `https://${website}`,
    });
  if (address && (ci.showExactLocation ?? true))
    methods.push({
      icon: MapPin,
      label: "Location",
      value: address,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    });

  const heading = section.copy?.headline?.trim() || "Get in touch";
  const tagline = section.copy?.tagline?.trim();
  const eyebrow = section.copy?.eyebrow?.trim();
  const ctas = section.ctas ?? [];
  const showForm = section.variant !== "minimal" && !!profile?.id;

  const fieldStyle = {
    borderColor: "var(--rk-border)",
    borderRadius: "var(--rk-radius)",
    backgroundColor: "var(--rk-bg)",
    color: "var(--rk-text)",
  } as const;

  const methodsList = methods.length > 0 && (
    <div className={`grid gap-3 ${section.variant === "split" ? "grid-cols-1" : "sm:grid-cols-2"}`}>
      {methods.map((m) => (
        <a
          key={m.label}
          href={m.href}
          target={m.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="flex items-center gap-3 border p-4 text-left transition-colors hover:bg-[var(--rk-primary-soft)]"
          style={{ borderColor: "var(--rk-border)", borderRadius: "var(--rk-radius)" }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: "var(--rk-primary-soft)", color: "var(--rk-primary)" }}
          >
            <m.icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold" style={{ color: "var(--rk-text)" }}>
              {m.label}
            </span>
            <span className="block truncate text-sm" style={{ color: "var(--rk-muted)" }}>
              {m.value}
            </span>
          </span>
        </a>
      ))}
    </div>
  );

  const formEl = showForm && (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="w-full border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={fieldStyle}
          placeholder="Your name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          disabled={contactMutation.isPending}
        />
        <input
          type="email"
          className="w-full border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={fieldStyle}
          placeholder="Email *"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          disabled={contactMutation.isPending}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="w-full border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={fieldStyle}
          placeholder="Phone (optional)"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          disabled={contactMutation.isPending}
        />
        <input
          className="w-full border px-3 py-2.5 text-sm outline-none focus:ring-2"
          style={fieldStyle}
          placeholder="Subject *"
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          disabled={contactMutation.isPending}
        />
      </div>
      <textarea
        className="w-full border px-3 py-2.5 text-sm outline-none focus:ring-2"
        style={fieldStyle}
        rows={4}
        placeholder="Your message *"
        value={form.message}
        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
        disabled={contactMutation.isPending}
      />
      <button
        type="submit"
        disabled={contactMutation.isPending}
        className="inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
        style={{
          backgroundColor: "var(--rk-primary)",
          color: "var(--rk-primary-fg)",
          borderRadius: "var(--rk-radius)",
        }}
      >
        {contactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {contactMutation.isPending ? "Sending…" : "Send message"}
      </button>
    </form>
  );

  const headingBlock = (
    <>
      {eyebrow && (
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--rk-primary)" }}>
          {eyebrow}
        </div>
      )}
      <h2
        className={`font-bold ${sectionHeadingClass(brand.typography.scale)}`}
        style={{ fontFamily: "var(--rk-font-heading)", color: "var(--rk-text)" }}
      >
        {heading}
      </h2>
      {tagline && (
        <p className="mt-3 max-w-xl text-lg" style={{ color: "var(--rk-muted)" }}>
          {tagline}
        </p>
      )}
    </>
  );

  // Split layout: form on the left, methods on the right.
  if (section.variant === "split" && showForm) {
    return (
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-8 max-w-xl">{headingBlock}</div>
        <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
          <div>{formEl}</div>
          <div className="space-y-3">
            {methodsList}
            {ctas.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {ctas.map((c) => (
                  <CtaButton key={c.id} cta={c} bundle={bundle} username={username} creatorName={creatorName} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Card (default) + minimal: centered heading, optional form, methods, CTAs.
  return (
    <div className="mx-auto max-w-3xl px-6 text-center">
      {headingBlock}
      {formEl && <div className="mx-auto mt-8 max-w-2xl">{formEl}</div>}
      {methodsList && <div className="mx-auto mt-8 max-w-xl">{methodsList}</div>}
      {ctas.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {ctas.map((c) => (
            <CtaButton key={c.id} cta={c} bundle={bundle} username={username} creatorName={creatorName} />
          ))}
        </div>
      )}
    </div>
  );
}
