import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Sparkles,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Wand2,
  Rocket,
  Undo2,
  ExternalLink,
  Trash2,
  Check,
  Plus,
} from "lucide-react";
import { BriefRenderer } from "@/components/brief/BriefRenderer";
import { useProfileBundle } from "@/hooks/useProfileBundle";
import {
  BACKGROUNDS,
  EMPHASES,
  FONTS,
  FONT_IDS,
  RADII,
  SCALES,
  SPACINGS,
  SECTION_KINDS,
  SECTION_VARIANTS,
  defaultCtaLabel,
  defaultVariant,
  type Cta,
  type CtaAction,
  type PageBrief,
  type Section,
  type SectionKind,
} from "@shared/brief";
type SaveState = "idle" | "saving" | "saved";

/**
 * AI Profile Studio. Route: /studio
 * A split-view live editor: the BriefRenderer preview on the right (click any
 * section to select it), an edit rail on the left. Direct edits are instant and
 * free (modelless); AI sits one button away for generation and scoped reworks.
 */
export default function SiteStudio() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [brief, setBrief] = useState<PageBrief | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [styleHint, setStyleHint] = useState("");

  const seededRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always fetch once authenticated; the server tells us whether the feature is
  // enabled (single source of truth) — no dependence on build-time env vars.
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/brief"],
    queryFn: async () => (await apiRequest("GET", "/api/dashboard/brief")).json(),
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const username: string | undefined = data?.username;
  const published: boolean = !!data?.published;
  const serverEnabled: boolean = data?.enabled !== false;

  // Shared-cache bundle (for CTA entity options + preview). Safe with undefined.
  const bundle = useProfileBundle(username);

  // Seed local brief once from the server.
  useEffect(() => {
    if (data?.brief && !seededRef.current) {
      seededRef.current = true;
      setBrief(data.brief);
    }
  }, [data]);

  /* ---- autosave (debounced ~900ms) ---- */
  const persist = useCallback(
    async (next: PageBrief) => {
      setSaveState("saving");
      try {
        // Fire-and-confirm only. We deliberately do NOT echo the server's
        // normalized brief back into local state: the client is the source of
        // truth while editing, so a save that lands mid-keystroke can't clobber
        // newer characters or jump the cursor. The server still normalizes and
        // persists; the normalized form is re-read on next load / generate.
        await apiRequest("PUT", "/api/dashboard/brief", { brief: next });
        setSaveState("saved");
      } catch {
        setSaveState("idle");
        toast({ title: "Couldn’t save", description: "Your last change wasn’t saved.", variant: "destructive" });
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!brief || !seededRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(brief), 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [brief, persist]);

  /* ---- server actions ---- */
  const adoptBrief = (b: PageBrief) => {
    skipNextSaveRef.current = true;
    setBrief(b);
  };

  const generate = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/dashboard/brief/generate", { styleHint: styleHint.trim() || undefined })).json(),
    onSuccess: (body) => {
      if (body?.brief) adoptBrief(body.brief);
      toast({ title: "Your page was designed", description: "Generated from your real data with Opus." });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e?.message, variant: "destructive" }),
  });

  const publish = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/dashboard/brief/publish", { brief })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/brief"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles", username, "brief"] });
      toast({ title: "Published", description: "Your new page is now live." });
    },
    onError: (e: any) => toast({ title: "Publish failed", description: e?.message, variant: "destructive" }),
  });

  const unpublish = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/dashboard/brief/unpublish")).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/brief"] });
      toast({ title: "Unpublished", description: "Your page reverted to the classic layout." });
    },
  });

  const revert = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/dashboard/brief/revert")).json(),
    onSuccess: () => {
      seededRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/brief"] });
      toast({ title: "Draft reset", description: "Back to your published / default design." });
    },
  });

  const reworkSection = useMutation({
    mutationFn: async ({ id, instruction }: { id: string; instruction: string }) =>
      (await apiRequest("POST", `/api/dashboard/brief/section/${id}/regenerate`, { instruction })).json(),
    onSuccess: (body) => {
      if (body?.brief) adoptBrief(body.brief);
      toast({ title: "Section reworked" });
    },
    onError: (e: any) => toast({ title: "Rework failed", description: e?.message, variant: "destructive" }),
  });

  /* ---- local brief mutations (instant, free) ---- */
  const update = (fn: (b: PageBrief) => PageBrief) => setBrief((prev) => (prev ? fn(prev) : prev));
  const patchSection = (id: string, patch: Partial<Section>) =>
    update((b) => ({ ...b, sections: b.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const moveSection = (id: string, dir: -1 | 1) =>
    update((b) => {
      const i = b.sections.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.sections.length) return b;
      const sections = [...b.sections];
      [sections[i], sections[j]] = [sections[j], sections[i]];
      return { ...b, sections };
    });

  // Add a section of any kind — including data kinds with no data yet (they show
  // a placeholder in the editor and appear live once the creator adds content).
  // Inserts before the footer so the footer stays last, then selects it.
  const addSection = (kind: SectionKind) => {
    const id = crypto.randomUUID();
    update((b) => {
      const newSection: Section = {
        id,
        kind,
        visible: true,
        variant: defaultVariant(kind),
        background: "none",
        emphasis: "normal",
      };
      const sections = [...b.sections];
      const footerIdx = sections.findIndex((s) => s.kind === "footer");
      if (footerIdx >= 0) sections.splice(footerIdx, 0, newSection);
      else sections.push(newSection);
      return { ...b, sections };
    });
    setSelectedId(id);
  };

  const removeSection = (id: string) =>
    update((b) =>
      b.sections.length <= 1 ? b : { ...b, sections: b.sections.filter((s) => s.id !== id) },
    );

  const selected = useMemo(
    () => brief?.sections.find((s) => s.id === selectedId) ?? null,
    [brief, selectedId],
  );

  /* ---- gates ---- */
  if (!authLoading && !isAuthenticated) {
    return <CenteredCard title="Sign in required" body="Sign in to design your page." cta={{ href: "/auth", label: "Sign in" }} />;
  }
  if (data && data.enabled === false) {
    return (
      <CenteredCard
        title="AI Profile is off"
        body="The studio has been disabled on the server (ENABLE_AI_PROFILE=false). Remove that flag to re-enable it."
        cta={{ href: "/dashboard", label: "Back to dashboard" }}
      />
    );
  }
  if (isLoading || !brief || !username) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#b66667]" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-100">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm font-medium text-neutral-500 hover:text-neutral-800">
            ← Dashboard
          </Link>
          <span className="text-sm font-semibold text-neutral-900">Profile Studio</span>
          <SaveBadge state={saveState} />
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 sm:flex"
          >
            <ExternalLink className="h-4 w-4" /> View live
          </a>
          <Button variant="ghost" size="sm" onClick={() => revert.mutate()} disabled={revert.isPending}>
            <Undo2 className="mr-1 h-4 w-4" /> Reset
          </Button>
          {published && (
            <Button variant="ghost" size="sm" onClick={() => unpublish.mutate()} disabled={unpublish.isPending}>
              Unpublish
            </Button>
          )}
          <Button
            size="sm"
            className="bg-[#b66667] hover:bg-[#a55859]"
            onClick={() => publish.mutate()}
            disabled={publish.isPending || !serverEnabled}
            title={serverEnabled ? "Publish your page" : "Enable ENABLE_AI_PROFILE on the server to publish"}
          >
            {publish.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />}
            {published ? "Republish" : "Publish"}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[340px] shrink-0 overflow-y-auto border-r bg-white">
          <Panel title="Design with AI" icon={<Sparkles className="h-4 w-4" />}>
            <p className="mb-2 text-xs text-neutral-500">
              Generate a fresh, on-brand page from your real data (Opus). Optional vibe:
            </p>
            <input
              value={styleHint}
              onChange={(e) => setStyleHint(e.target.value)}
              placeholder="e.g. calm, editorial, bold…"
              className="mb-2 w-full rounded-md border px-3 py-2 text-sm"
            />
            <Button
              className="w-full bg-neutral-900 hover:bg-neutral-800"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {generate.isPending ? "Designing…" : "Generate my page"}
            </Button>
          </Panel>

          <BrandPanel brief={brief} onChange={(brand) => update((b) => ({ ...b, brand }))} />

          <Panel title="Add a section" icon={<Plus className="h-4 w-4" />}>
            <p className="mb-2 text-xs text-neutral-500">
              Add any section — including content you haven’t created yet. Data sections show a
              placeholder until you add items, then appear live.
            </p>
            <select
              className={selectCls}
              value=""
              onChange={(e) => {
                if (e.target.value) addSection(e.target.value as SectionKind);
                e.target.value = "";
              }}
            >
              <option value="">+ Add a section…</option>
              {SECTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Panel>

          {selected ? (
            <SectionPanel
              key={selected.id}
              section={selected}
              index={brief.sections.findIndex((s) => s.id === selected.id)}
              total={brief.sections.length}
              bundle={bundle}
              onPatch={(patch) => patchSection(selected.id, patch)}
              onMove={(dir) => moveSection(selected.id, dir)}
              onRemove={() => {
                removeSection(selected.id);
                setSelectedId(null);
              }}
              onRework={(instruction) => reworkSection.mutate({ id: selected.id, instruction })}
              reworking={reworkSection.isPending}
            />
          ) : (
            <Panel title="Sections">
              <p className="text-sm text-neutral-500">Click any section in the preview to edit it.</p>
            </Panel>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto bg-neutral-200/60 p-4 sm:p-8">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/5">
            <BriefRenderer username={username} brief={brief} editor={{ selectedId, onSelect: setSelectedId }} />
          </div>
        </main>
      </div>
    </div>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving")
    return <span className="flex items-center gap-1 text-xs text-neutral-400"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>;
  if (state === "saved")
    return <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3 w-3" /> Saved</span>;
  return null;
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="border-b p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

const selectCls = "w-full rounded-md border bg-white px-2.5 py-1.5 text-sm capitalize";

function BrandPanel({ brief, onChange }: { brief: PageBrief; onChange: (brand: PageBrief["brand"]) => void }) {
  const brand = brief.brand;
  const setPalette = (key: keyof typeof brand.palette, value: string) =>
    onChange({ ...brand, palette: { ...brand.palette, [key]: value } });
  const colors: Array<[keyof typeof brand.palette, string]> = [
    ["primary", "Primary"],
    ["accent", "Accent"],
    ["background", "Backdrop"],
    ["surface", "Surface"],
    ["text", "Text"],
  ];
  return (
    <Panel title="Brand" icon={<span className="h-3 w-3 rounded-full" style={{ background: brand.palette.primary }} />}>
      <div className="mb-3 grid grid-cols-5 gap-2">
        {colors.map(([key, label]) => (
          <label key={key} className="flex flex-col items-center gap-1">
            <input
              type="color"
              value={brand.palette[key]}
              onChange={(e) => setPalette(key, e.target.value)}
              className="h-9 w-9 cursor-pointer rounded-md border"
              title={label}
            />
            <span className="text-[10px] text-neutral-400">{label}</span>
          </label>
        ))}
      </div>
      <Field label="Heading font">
        <select className={selectCls} value={brand.typography.heading}
          onChange={(e) => onChange({ ...brand, typography: { ...brand.typography, heading: e.target.value as any } })}>
          {FONT_IDS.map((id) => <option key={id} value={id}>{FONTS[id].label}</option>)}
        </select>
      </Field>
      <Field label="Body font">
        <select className={selectCls} value={brand.typography.body}
          onChange={(e) => onChange({ ...brand, typography: { ...brand.typography, body: e.target.value as any } })}>
          {FONT_IDS.map((id) => <option key={id} value={id}>{FONTS[id].label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Scale">
          <select className={selectCls} value={brand.typography.scale}
            onChange={(e) => onChange({ ...brand, typography: { ...brand.typography, scale: e.target.value as any } })}>
            {SCALES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Radius">
          <select className={selectCls} value={brand.radius}
            onChange={(e) => onChange({ ...brand, radius: e.target.value as any })}>
            {RADII.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Spacing">
          <select className={selectCls} value={brand.spacing}
            onChange={(e) => onChange({ ...brand, spacing: e.target.value as any })}>
            {SPACINGS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>
    </Panel>
  );
}

function SectionPanel({
  section,
  index,
  total,
  bundle,
  onPatch,
  onMove,
  onRemove,
  onRework,
  reworking,
}: {
  section: Section;
  index: number;
  total: number;
  bundle: ReturnType<typeof useProfileBundle>;
  onPatch: (patch: Partial<Section>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onRework: (instruction: string) => void;
  reworking: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const variants = SECTION_VARIANTS[section.kind];
  // Every section can carry connective copy now (data sections use it as an intro).
  const allowsCopy = true;

  return (
    <Panel title={`${section.kind} section`}>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => onPatch({ visible: !section.visible })}>
          {section.visible ? <><Eye className="mr-1 h-4 w-4" /> Visible</> : <><EyeOff className="mr-1 h-4 w-4" /> Hidden</>}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-neutral-400 hover:text-red-500"
          onClick={onRemove}
          disabled={total <= 1}
          title="Remove section"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Field label="Layout variant">
        <select className={selectCls} value={section.variant} onChange={(e) => onPatch({ variant: e.target.value })}>
          {variants.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Background">
          <select className={selectCls} value={section.background} onChange={(e) => onPatch({ background: e.target.value as any })}>
            {BACKGROUNDS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Emphasis">
          <select className={selectCls} value={section.emphasis} onChange={(e) => onPatch({ emphasis: e.target.value as any })}>
            {EMPHASES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>

      {allowsCopy && (
        <>
          <Field label="Eyebrow (kicker)">
            <input
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={section.copy?.eyebrow ?? ""}
              placeholder="e.g. OFFERINGS"
              onChange={(e) => onPatch({ copy: { ...section.copy, eyebrow: e.target.value } })}
            />
          </Field>
          <Field label="Heading">
            <input
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
              value={section.copy?.headline ?? ""}
              placeholder="(a smart default is used if blank)"
              onChange={(e) => onPatch({ copy: { ...section.copy, headline: e.target.value } })}
            />
          </Field>
          <Field label="Tagline / subhead">
            <textarea
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
              rows={2}
              value={section.copy?.tagline ?? ""}
              onChange={(e) => onPatch({ copy: { ...section.copy, tagline: e.target.value } })}
            />
          </Field>
          <Field label="Alignment">
            <select
              className={selectCls}
              value={section.align ?? "left"}
              onChange={(e) => onPatch({ align: e.target.value as any })}
            >
              {["left", "center"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
        </>
      )}

      <CtaEditor section={section} bundle={bundle} onPatch={onPatch} />

      <div className="mt-4 rounded-lg bg-neutral-50 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
          <Sparkles className="h-3.5 w-3.5" /> Rework with AI
        </div>
        <input
          className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-sm"
          placeholder="e.g. make this warmer"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={reworking || !instruction.trim()}
          onClick={() => { onRework(instruction.trim()); setInstruction(""); }}
        >
          {reworking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Rework this section
        </Button>
      </div>
    </Panel>
  );
}

function CtaEditor({
  section,
  bundle,
  onPatch,
}: {
  section: Section;
  bundle: ReturnType<typeof useProfileBundle>;
  onPatch: (patch: Partial<Section>) => void;
}) {
  const ctas = section.ctas ?? [];
  const setCtas = (next: Cta[]) => onPatch({ ctas: next });
  const candidates = useMemo(() => buildActionCandidates(bundle), [bundle]);

  const addCta = (action: CtaAction) => {
    const cta: Cta = {
      id: crypto.randomUUID(),
      action,
      presentation: "modal",
      style: ctas.length === 0 ? "filled" : "outlined",
      label: defaultCtaLabel(action),
      liveBadge: ["book", "registerEvent", "buyDigital"].includes(action.kind),
    };
    setCtas([...ctas, cta].slice(0, 4));
  };

  return (
    <div className="mt-2">
      <div className="mb-1 text-xs font-medium text-neutral-500">Buttons</div>
      <div className="space-y-2">
        {ctas.map((c) => (
          <div key={c.id} className="rounded-md border p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="truncate text-xs font-medium text-neutral-700">{c.label || defaultCtaLabel(c.action)}</span>
              <button
                className="text-neutral-400 hover:text-red-500"
                onClick={() => setCtas(ctas.filter((x) => x.id !== c.id))}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {(() => {
              // `presentation` only has an effect for the two actions that mount a
              // flow we can render either in-place or on a full page. For every
              // other action it does nothing, so we don't show a dead control.
              const supportsPresentation =
                c.action.kind === "buyDigital" || c.action.kind === "registerEvent";
              return (
                <div className={`grid ${supportsPresentation ? "grid-cols-2" : "grid-cols-1"} gap-1.5`}>
                  <select
                    className="rounded border bg-white px-1.5 py-1 text-xs capitalize"
                    value={c.style}
                    onChange={(e) => setCtas(ctas.map((x) => (x.id === c.id ? { ...x, style: e.target.value as any } : x)))}
                  >
                    {["filled", "outlined", "ghost", "link"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {supportsPresentation && (
                    <select
                      className="rounded border bg-white px-1.5 py-1 text-xs capitalize"
                      value={c.presentation === "navigate" ? "navigate" : "modal"}
                      onChange={(e) => setCtas(ctas.map((x) => (x.id === c.id ? { ...x, presentation: e.target.value as any } : x)))}
                      title="Open in a popup or go to the full page"
                    >
                      {["modal", "navigate"].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
      {ctas.length < 4 && candidates.length > 0 && (
        <select
          className="mt-2 w-full rounded-md border bg-white px-2.5 py-1.5 text-sm"
          value=""
          onChange={(e) => {
            const c = candidates[Number(e.target.value)];
            if (c) addCta(c.action);
          }}
        >
          <option value="">+ Add a button…</option>
          {candidates.map((c, i) => (
            <option key={i} value={i}>{c.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function buildActionCandidates(bundle: ReturnType<typeof useProfileBundle>): { label: string; action: CtaAction }[] {
  const out: { label: string; action: CtaAction }[] = [];
  for (const s of bundle.sessions.slice(0, 5)) out.push({ label: `Book: ${(s as any).title}`, action: { kind: "book", sessionId: (s as any).id } });
  for (const e of bundle.events.slice(0, 5)) out.push({ label: `Register: ${(e as any).title}`, action: { kind: "registerEvent", eventId: (e as any).id } });
  for (const p of bundle.products.slice(0, 5)) out.push({ label: `Buy: ${(p as any).title}`, action: { kind: "buyDigital", productId: (p as any).id } });
  for (const p of bundle.physicalProducts.slice(0, 5)) out.push({ label: `Buy: ${(p as any).title}`, action: { kind: "buyPhysical", productId: (p as any).id } });
  if (bundle.profile?.contactInfo?.whatsapp || bundle.profile?.socialLinks?.whatsapp)
    out.push({ label: "WhatsApp", action: { kind: "whatsapp" } });
  out.push({ label: "Contact form", action: { kind: "contact" } });
  return out;
}

function CenteredCard({ title, body, cta }: { title: string; body: string; cta: { href: string; label: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-bold text-neutral-900">{title}</h1>
        <p className="mb-6 text-sm text-neutral-500">{body}</p>
        <Link href={cta.href}>
          <Button className="bg-[#b66667] hover:bg-[#a55859]">{cta.label}</Button>
        </Link>
      </div>
    </div>
  );
}
