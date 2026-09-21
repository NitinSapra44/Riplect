import { Quote, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Testimonial {
  clientName: string;
  content: string;
  rating?: number;
  clientTitle?: string;
}

interface TestimonialsSectionProps {
  testimonials: Testimonial[];
  /**
   * Brief-mode arrangement ("cards" | "carousel" | "quote"). When omitted the
   * component renders its classic standalone card with an internal title (used by
   * the legacy profile page). When provided, the section heading comes from the
   * Brief's SectionFrame, so only the testimonials content is rendered.
   *
   * All visuals are token-driven, so the card looks neutral on the classic page
   * and re-themes automatically inside the Brief's .rk-page scope. There is ONE
   * card implementation (TestimonialCard) shared by every mode — no fork.
   */
  variant?: string;
}

function Stars({ rating }: { rating?: number }) {
  if (!rating) return null;
  return (
    <div className="flex items-center mb-4">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < rating ? "text-yellow-400 fill-current" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <Card className="border border-border bg-card transition-shadow hover:shadow-md">
      <CardContent className="p-6">
        <Stars rating={t.rating} />
        <Quote className="w-8 h-8 text-primary/20 mb-4" />
        <p className="text-foreground/80 mb-4 leading-relaxed">"{t.content}"</p>
        <div className="border-t border-border pt-4">
          <p className="font-semibold text-foreground">{t.clientName}</p>
          {t.clientTitle && (
            <p className="text-sm text-muted-foreground">{t.clientTitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TestimonialsSection({ testimonials, variant }: TestimonialsSectionProps) {
  if (!testimonials || testimonials.length === 0) {
    return null;
  }

  const grid = (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {testimonials.map((t, i) => (
        <TestimonialCard key={i} t={t} />
      ))}
    </div>
  );

  // ---- Brief mode: arrangement varies; same card; no internal title -----
  if (variant === "quote") {
    return (
      <div className="mx-auto max-w-3xl space-y-12">
        {testimonials.slice(0, 3).map((t, i) => (
          <figure key={i} className="text-center">
            <Quote className="mx-auto mb-4 h-8 w-8 text-primary/40" />
            <blockquote className="text-xl font-medium leading-relaxed text-foreground sm:text-2xl">
              “{t.content}”
            </blockquote>
            <figcaption className="mt-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.clientName}
              {t.clientTitle ? ` · ${t.clientTitle}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  if (variant === "carousel") {
    return (
      <div className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {testimonials.map((t, i) => (
          <div key={i} className="w-[300px] shrink-0 snap-start">
            <TestimonialCard t={t} />
          </div>
        ))}
      </div>
    );
  }

  if (variant) {
    // "cards" (default brief arrangement) — no wrapper/title.
    return grid;
  }

  // ---- Classic mode: standalone card with internal title ---------------
  return (
    <div className="bg-card rounded-xl p-8 border border-border shadow-sm">
      <div className="flex items-center mb-6">
        <Quote className="w-6 h-6 text-primary mr-3" />
        <h3 className="text-2xl font-bold text-foreground">Client Testimonials</h3>
      </div>
      {grid}
    </div>
  );
}
