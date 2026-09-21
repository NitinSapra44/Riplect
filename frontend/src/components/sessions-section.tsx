import type { BookingSession } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { formatPrice } from "@shared/currencies";

interface SessionsSectionProps {
  sessions: BookingSession[];
  username: string;
}

export function SessionsSection({ sessions, username }: SessionsSectionProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600 mb-4">No sessions are currently available.</p>
        <p className="text-sm text-gray-500">Check back later for new coaching sessions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => (
        <Card 
          key={session.id} 
          className="border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
          data-testid={`session-card-${session.id}`}
        >
          <Link href={`/${username}/session/${session.id}`}>
            {session.images && session.images.length > 0 && (
              <div className="aspect-video w-full overflow-hidden">
                <img
                  src={session.images[0].url}
                  alt={session.images[0].alt}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-gray-900 mb-2 hover:text-primary transition-colors" data-testid={`session-title-${session.id}`}>
                    {session.title}
                  </h4>
                  {session.description && (
                    <p className="text-gray-600 text-sm mb-3">
                      {session.description.substring(0, 100)}
                      {session.description.length > 100 && '...'}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>{session.duration} minutes</span>
                    </div>
                    {session.images && session.images.length > 1 && (
                      <div className="flex items-center">
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {session.images.length} images
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 sm:mt-0 sm:ml-4 flex flex-col items-end">
                  <span className="text-xl font-bold text-primary mb-2">
                    {(session as any).isFree ? "Free" : formatPrice(session.price, (session as any).currency || "USD")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Link>
        </Card>
      ))}
    </div>
  );
}