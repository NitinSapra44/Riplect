import type { EventWithExtras } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, MapPin, Repeat } from "lucide-react";
import { Link } from "wouter";
import { formatPrice } from "@shared/currencies";
import { isEventPast } from "@/lib/timezone-utils";

interface EventsSectionProps {
  events: EventWithExtras[];
  username: string;
  creatorName?: string;
  /** Brief-mode arrangement ("cards" | "list" | "agenda"). Omitted = classic cards. */
  variant?: string;
}

function eventHref(event: EventWithExtras, username: string) {
  return event.seriesId
    ? `/${username}/event/${event.seriesId}?asSeriesRoot=true`
    : `/${username}/event/${event.id}`;
}

function priceLabel(event: EventWithExtras) {
  return event.pricingType === "free"
    ? "Free"
    : event.pricingType === "donation"
      ? "Donation"
      : formatPrice(event.price, event.currency || "USD");
}

function RecurringBadge({ event }: { event: EventWithExtras }) {
  if (!(event.isRecurring || event.seriesId || event.cadenceLabel)) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
        <Repeat className="w-2.5 h-2.5" />
        {event.cadenceLabel || "Recurring"}
      </span>
      {event.upcomingCount != null && event.upcomingCount > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground">
          {event.upcomingCount} upcoming
        </span>
      )}
    </div>
  );
}

/** The single full event card, shared by classic + brief "cards". */
function EventCard({ event, username }: { event: EventWithExtras; username: string }) {
  const isPast = isEventPast(event);
  return (
    <Card className="border border-border overflow-hidden hover:shadow-lg transition-shadow bg-card">
      <Link href={eventHref(event, username)}>
        {event.featuredImage && (
          <div className="w-full h-56 bg-muted overflow-hidden">
            <img
              src={event.featuredImage}
              alt={event.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        )}
        <CardContent className="p-4">
          <div className="flex flex-col h-full">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 className="text-lg font-semibold text-foreground hover:text-primary transition-colors">
                  {event.title}
                </h4>
                <RecurringBadge event={event} />
              </div>
              {isPast ? (
                <span className="text-xs whitespace-nowrap bg-primary/5 border border-primary rounded-full px-2 py-0.5 font-medium text-primary/70">
                  Past event
                </span>
              ) : (
                <span className="text-sm text-muted-foreground whitespace-nowrap flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  {event.startAt
                    ? new Date(event.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "TBA"}
                </span>
              )}
            </div>

            {event.thumbnailDescription && (
              <p className="text-muted-foreground text-sm mb-3">{event.thumbnailDescription}</p>
            )}

            <div className="flex flex-col gap-2 text-sm text-muted-foreground mt-auto">
              {event.startAt &&
                (() => {
                  const d = new Date(event.startAt);
                  if (!d.getHours() && !d.getMinutes()) return null;
                  const startStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  const endStr = event.endAt
                    ? (() => {
                        const e = new Date(event.endAt!);
                        return e.getHours() || e.getMinutes()
                          ? e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                          : null;
                      })()
                    : null;
                  return (
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>
                        {startStr}
                        {endStr ? ` - ${endStr}` : ""}
                      </span>
                    </div>
                  );
                })()}

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span>
                    {event.mode === "hybrid"
                      ? "Online / In-person event"
                      : event.mode === "online"
                        ? "Online Event"
                        : event.mode === "offline"
                          ? `In-person ${event.location ? `at ${event.location}` : ""}`
                          : "Event"}
                  </span>
                </div>
                <span className={`font-bold text-primary ${event.pricingType === "free" ? "text-sm" : "text-xl"}`}>
                  {priceLabel(event)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

/** Compact agenda/list row, used by brief "list" + "agenda". */
function EventRow({ event, username, agenda }: { event: EventWithExtras; username: string; agenda?: boolean }) {
  const d = event.startAt ? new Date(event.startAt) : null;
  return (
    <Link href={eventHref(event, username)} className="group block">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-md">
        {agenda && (
          <div className="flex w-14 shrink-0 flex-col items-center rounded-md bg-primary/10 py-2 text-primary">
            <span className="text-[10px] font-semibold uppercase">
              {d ? d.toLocaleDateString("en-US", { month: "short" }) : "TBA"}
            </span>
            <span className="text-lg font-bold leading-none">{d ? d.getDate() : "–"}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-semibold text-foreground group-hover:text-primary">{event.title}</h4>
          {event.thumbnailDescription && (
            <p className="line-clamp-1 text-sm text-muted-foreground">{event.thumbnailDescription}</p>
          )}
        </div>
        <span className="shrink-0 font-bold text-primary">{priceLabel(event)}</span>
      </div>
    </Link>
  );
}

export function EventsSection({ events, username, variant }: EventsSectionProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No upcoming events are currently scheduled.</p>
        <p className="text-sm text-muted-foreground">Check back later for new workshops and events.</p>
      </div>
    );
  }

  if (variant === "list" || variant === "agenda") {
    return (
      <div className="space-y-3">
        {events.map((event) => (
          <EventRow key={event.id} event={event} username={username} agenda={variant === "agenda"} />
        ))}
      </div>
    );
  }

  // classic + brief "cards"
  return (
    <div className="space-y-4">
      {events.map((event) => (
        <EventCard key={event.id} event={event} username={username} />
      ))}
    </div>
  );
}
