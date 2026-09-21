import type { Brand, Section } from "@shared/brief";
import { DATA_SECTION_KINDS } from "@shared/brief";
import type { ProfileBundle } from "@/hooks/useProfileBundle";
import { backgroundStyle, emphasisClass, sectionPaddingClass } from "./theme";
import { HeroBlock } from "./blocks/HeroBlock";
import { AboutBlock } from "./blocks/AboutBlock";
import { ContactBlock } from "./blocks/ContactBlock";
import { FooterBlock } from "./blocks/FooterBlock";
import { CtaBlock } from "./blocks/CtaBlock";
import { ReusedSectionBlock, reusedHasData } from "./blocks/ReusedSections";
import { SectionFrame } from "./SectionFrame";

export interface EditorContext {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SectionRenderer({
  section,
  bundle,
  brand,
  username,
  creatorName,
  editor,
}: {
  section: Section;
  bundle: ProfileBundle;
  brand: Brand;
  username: string;
  creatorName: string;
  editor?: EditorContext;
}) {
  const isData = DATA_SECTION_KINDS.includes(section.kind);
  const hasData = isData ? reusedHasData(section.kind, bundle) : true;

  // Live mode: a data section with no data self-hides. Editor mode: show a
  // placeholder so the creator can see/select it and knows to add data.
  if (isData && !hasData && !editor) return null;

  const inner =
    isData && !hasData && editor ? (
      <EmptyPlaceholder kind={section.kind} />
    ) : (
      <Block section={section} bundle={bundle} brand={brand} username={username} creatorName={creatorName} />
    );

  if (inner === null) return null;

  const selected = editor?.selectedId === section.id;

  return (
    <section
      id={`rk-${section.kind}`}
      data-rk-section-id={section.id}
      className={`relative ${sectionPaddingClass(brand.spacing)} ${emphasisClass(section.emphasis)} ${
        editor ? "cursor-pointer ring-inset transition-all hover:ring-2 hover:ring-[var(--rk-accent)]" : ""
      } ${selected ? "ring-2 ring-inset ring-[var(--rk-primary)]" : ""}`}
      style={backgroundStyle(section.background)}
      onClick={
        editor
          ? (e) => {
              e.stopPropagation();
              editor.onSelect(section.id);
            }
          : undefined
      }
    >
      {editor && (
        <span
          className={`pointer-events-none absolute left-3 top-3 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            selected ? "opacity-100" : "opacity-0 transition-opacity"
          }`}
          style={{ backgroundColor: "var(--rk-primary)", color: "var(--rk-primary-fg)" }}
        >
          {section.kind}
        </span>
      )}
      {inner}
    </section>
  );
}

function Block(props: {
  section: Section;
  bundle: ProfileBundle;
  brand: Brand;
  username: string;
  creatorName: string;
}) {
  const { section } = props;
  switch (section.kind) {
    case "hero":
      return <HeroBlock {...props} />;
    case "about":
      return <AboutBlock section={props.section} bundle={props.bundle} brand={props.brand} />;
    case "contact":
      return <ContactBlock {...props} />;
    case "cta":
      return <CtaBlock {...props} />;
    case "footer":
      return <FooterBlock section={props.section} bundle={props.bundle} />;
    default:
      // Data sections: the reused component renders the content; SectionFrame
      // supplies the branded eyebrow/heading/subhead around it.
      return (
        <SectionFrame section={section} brand={props.brand}>
          <ReusedSectionBlock section={section} bundle={props.bundle} />
        </SectionFrame>
      );
  }
}

function EmptyPlaceholder({ kind }: { kind: string }) {
  return (
    <div className="mx-auto max-w-3xl px-6">
      <div
        className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-12 text-center"
        style={{ borderColor: "var(--rk-border)" }}
      >
        <p className="text-sm font-semibold capitalize" style={{ color: "var(--rk-text)" }}>
          {kind} section
        </p>
        <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--rk-muted)" }}>
          No {kind} yet. Add some in your dashboard and they’ll appear here automatically — no
          regeneration needed.
        </p>
      </div>
    </div>
  );
}
