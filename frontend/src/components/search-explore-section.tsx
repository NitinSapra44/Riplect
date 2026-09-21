import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { 
  Search, Calendar, MapPin, Clock,
  Users, CalendarDays, X, Repeat
} from "lucide-react";
import { format, startOfDay, isSameDay } from "date-fns";
import { isEventPast } from "@/lib/timezone-utils";
import { DateRange } from "react-day-picker";
import defaultProfileImage from "@assets/WhatsApp Image 2025-11-28 at 13.31.40_1764389051024.jpeg";
import { type CityLocation } from "./city-autocomplete-filter";
import { DateRangeFilter } from "./date-range-filter";
import { useLoadScript } from "@react-google-maps/api";
import { usePlacesAutocomplete } from "@/hooks/use-places-autocomplete";
import { PlacesAutocompleteDropdown } from "./places-autocomplete-dropdown";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";
import { useViewportPrefetch, usePrefetchInView } from "@/hooks/use-viewport-prefetch";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Helper to format price: $50 instead of $50.00
const formatPrice = (price: string | number, currencyCode: string = 'USD') => {
  const numericPrice = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(numericPrice)) return price;
  if (numericPrice === 0) return "Free";

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numericPrice);
};

interface Coach {
  id: number;
  username: string;
  displayName: string;
  title: string | null;
  shortBio: string | null;
  profileImageUrl: string | null;
  searchTags?: string[];
  searchableLocation?: string | null;
}

interface Tag {
  id: number;
  name: string;
  color: string | null;
}

interface Session {
  id: number;
  profileId: number;
  title: string;
  description: string | null;
  thumbnailDescription: string | null;
  duration: number;
  price: string;
  currency?: string;
  isFree: boolean;
  images: Array<{ url: string; alt: string }> | null;
  isOnline: boolean;
  isOffline: boolean;
  createdAt: string;
  profile: {
    username: string;
    displayName: string;
    title: string | null;
    profileImageUrl: string | null;
  };
  tags?: Tag[];
  location?: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
}

type SeriesPatternUnion =
  | { type: 'weekly'; weekdays: number[]; intervalWeeks: number; startDate: string; endDate: string | null }
  | { type: 'monthly_nth'; nth: number; weekday: number; startDate: string; endDate: string | null }
  | { type: 'monthly_date'; dayOfMonth: number; startDate: string; endDate: string | null }
  | { type: 'custom'; dates: string[] };

interface Event {
  id: number;
  profileId: number;
  title: string;
  description: string | null;
  thumbnailDescription: string | null;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
  location: string | null;
  price: string;
  currency?: string;
  pricingType?: 'free' | 'donation' | 'paid';
  maxAttendees: number | null;
  featuredImage: string | null;
  mode?: 'online' | 'offline' | 'hybrid';
  createdAt: string;
  isRecurring?: boolean;
  seriesId?: number | null;
  seriesPattern?: SeriesPatternUnion | null;
  cadenceLabel?: string | null;
  upcomingCount?: number;
  profile: {
    username: string;
    displayName: string;
    title: string | null;
    profileImageUrl: string | null;
  };
  tags?: Tag[];
  locationData?: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null;
}

function capitalizeFirstLetter(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Match an item's location against the picked filter using the most specific
// component the user actually picked. Picking a city → only city-level matches.
// Picking a state → state-level. Picking just a country → country-level.
function locationMatches(
  filter: CityLocation,
  itemCity: string,
  itemState: string,
  itemCountry: string,
): boolean {
  const fc = filter.city.toLowerCase().trim();
  const fs = filter.state.toLowerCase().trim();
  const fco = filter.country.toLowerCase().trim();
  const ic = itemCity.toLowerCase().trim();
  const is = itemState.toLowerCase().trim();
  const ico = itemCountry.toLowerCase().trim();
  if (fc) return ic.includes(fc);
  if (fs) return is.includes(fs);
  if (fco) return ico.includes(fco);
  return true;
}

export default function SearchExploreSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("events");

  // Warm each card's detail-page queries once it has dwelled in the viewport,
  // so tapping through feels instant. Throttled + capped to avoid request bursts.
  const prefetch = useViewportPrefetch();
  const DEFAULT_LOCATION: CityLocation = {
    city: "Dharamshala",
    state: "Himachal Pradesh",
    country: "India",
    displayLabel: "Dharamshala, HP, India",
  };
  const [locationFilter, setLocationFilter] = useState<CityLocation | null>(DEFAULT_LOCATION);

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const todayDate = useMemo(() => startOfDay(new Date()), []);
  const thisWeekEnd = useMemo(() => {
    const dayOfWeek = todayDate.getDay();
    const d = new Date(todayDate);
    if (dayOfWeek === 0) {
      d.setDate(d.getDate() + 6);
    } else {
      d.setDate(d.getDate() + (7 - dayOfWeek));
    }
    return startOfDay(d);
  }, [todayDate]);

  const isTodayActive = useMemo(() =>
    !!(dateRange?.from && isSameDay(dateRange.from, todayDate) && (!dateRange.to || isSameDay(dateRange.to, todayDate))),
    [dateRange, todayDate]
  );
  const isThisWeekActive = useMemo(() =>
    !!(dateRange?.from && isSameDay(dateRange.from, todayDate) && dateRange.to && isSameDay(dateRange.to, thisWeekEnd)),
    [dateRange, todayDate, thisWeekEnd]
  );

  const todayTime = useMemo(() => todayDate.getTime(), [todayDate]);
  const weekEndTime = useMemo(() => thisWeekEnd.getTime(), [thisWeekEnd]);

  const handleTodayToggle = useCallback(() => {
    setDateRange(prev => {
      if (!prev?.from) return { from: todayDate, to: todayDate };
      const ft = startOfDay(prev.from).getTime();
      const tt = prev.to ? startOfDay(prev.to).getTime() : null;
      const active = ft === todayTime && (tt === null || tt === todayTime);
      return active ? undefined : { from: todayDate, to: todayDate };
    });
  }, [todayDate, todayTime]);

  const handleThisWeekToggle = useCallback(() => {
    setDateRange(prev => {
      if (!prev?.from || !prev.to) return { from: todayDate, to: thisWeekEnd };
      const ft = startOfDay(prev.from).getTime();
      const tt = startOfDay(prev.to).getTime();
      const active = ft === todayTime && tt === weekEndTime;
      return active ? undefined : { from: todayDate, to: thisWeekEnd };
    });
  }, [todayDate, thisWeekEnd, todayTime, weekEndTime]);

  const [modeFilter, setModeFilter] = useState<"all" | "online" | "offline">("all");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);

  // Location autocomplete (inline, for unified search pill)
  const locationApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded: mapsLoaded } = useLoadScript({
    googleMapsApiKey: locationApiKey || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  });
  const locationInputRef = useRef<HTMLInputElement>(null);
  const locationPillRef = useRef<HTMLDivElement>(null);
  const [locationInputValue, setLocationInputValue] = useState(DEFAULT_LOCATION.displayLabel);
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);

  const {
    predictions: locationPredictions,
    isLoading: locationPredictionsLoading,
    fetchPredictions: fetchLocationPredictions,
    clearPredictions: clearLocationPredictions,
    getPlaceDetails: getLocationPlaceDetails,
  } = usePlacesAutocomplete({ types: ["(cities)"], isLoaded: mapsLoaded });

  const handleLocationSelect = useCallback(async (prediction: { placeId: string; description: string }) => {
    setLocationDropdownOpen(false);
    clearLocationPredictions();
    try {
      const detail = await getLocationPlaceDetails(prediction.placeId);
      const city = detail.city || "";
      const state = detail.state || "";
      const country = detail.country || "";
      // Only fall back to the place's name if no structured fields exist at all.
      const fallbackCity = !city && !state && !country ? (detail.name || "") : "";
      const finalCity = city || fallbackCity;
      const displayLabel = [finalCity, state, country].filter(Boolean).join(", ") || detail.name || prediction.description;
      setLocationInputValue(displayLabel);
      setLocationFilter({ city: finalCity, state, country, displayLabel });
    } catch {
      // Fallback when place details lookup fails: derive a best-effort
      // location from the prediction text so the filter still applies.
      const parts = prediction.description.split(",").map((p) => p.trim()).filter(Boolean);
      const city = parts[0] || prediction.description;
      const country = parts.length > 1 ? parts[parts.length - 1] : "";
      const state = parts.length > 2 ? parts.slice(1, -1).join(", ") : "";
      const displayLabel = prediction.description;
      setLocationInputValue(displayLabel);
      setLocationFilter({ city, state, country, displayLabel });
    }
  }, [getLocationPlaceDetails, clearLocationPredictions]);

  const handleLocationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocationInputValue(v);
    if (!v) {
      setLocationFilter(null);
      clearLocationPredictions();
      setLocationDropdownOpen(false);
    } else {
      setLocationDropdownOpen(true);
      fetchLocationPredictions(v);
    }
  };

  const handleLocationClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocationInputValue("");
    setLocationFilter(null);
    clearLocationPredictions();
    setLocationDropdownOpen(false);
    if (locationInputRef.current) locationInputRef.current.value = "";
  };

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data: availableTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags/suggestions", ""],
    queryFn: async () => {
      const response = await fetch("/api/tags/suggestions?q=&limit=20");
      if (!response.ok) throw new Error("Failed to fetch tags");
      return response.json();
    },
  });

  const { data: coaches = [], isLoading: coachesLoading } = useQuery<Coach[]>({
    queryKey: ["/api/discover/coaches", debouncedSearchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/discover/coaches?q=${encodeURIComponent(debouncedSearchQuery)}`);
      if (!response.ok) throw new Error("Failed to fetch coaches");
      return response.json();
    },
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["/api/discover/sessions", debouncedSearchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/discover/sessions?q=${encodeURIComponent(debouncedSearchQuery)}`);
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ["/api/discover/events", debouncedSearchQuery],
    queryFn: async () => {
      const response = await fetch(`/api/discover/events?q=${encodeURIComponent(debouncedSearchQuery)}`);
      if (!response.ok) throw new Error("Failed to fetch events");
      return response.json();
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const resultsElement = document.getElementById('results-grid');
    if (resultsElement) {
      resultsElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (modeFilter === "online" && !session.isOnline) return false;
      if (modeFilter === "offline" && !session.isOffline) return false;
      if (locationFilter) {
        // Hide online-only sessions when a location filter is active
        if (session.isOnline && !session.isOffline) return false;
        // Require structured location data
        if (!session.location || (!session.location.city && !session.location.state && !session.location.country)) {
          return false;
        }
        if (!locationMatches(
          locationFilter,
          session.location.city || '',
          session.location.state || '',
          session.location.country || '',
        )) return false;
      }
      if (selectedTagIds.length > 0) {
        const sessionTagIds = session.tags?.map(t => t.id) || [];
        if (!selectedTagIds.some(tagId => sessionTagIds.includes(tagId))) return false;
      }
      if (selectedTagNames.length > 0 && selectedTagIds.length === 0) {
        const sessionTagNames = session.tags?.map(t => t.name.toLowerCase()) || [];
        const sessionText = `${session.title} ${session.description || ''} ${session.profile.displayName}`.toLowerCase();
        const matchesByTagName = selectedTagNames.some(tagName => sessionTagNames.includes(tagName));
        const matchesByText = selectedTagNames.some(tagName => sessionText.includes(tagName));
        if (!matchesByTagName && !matchesByText) return false;
      }
      return true;
    });
  }, [sessions, modeFilter, selectedTagIds, selectedTagNames, locationFilter]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (modeFilter === "online" && event.mode !== 'online' && event.mode !== 'hybrid') return false;
      if (modeFilter === "offline" && event.mode !== 'offline' && event.mode !== 'hybrid') return false;
      if (locationFilter) {
        // Hide online-only events when a location filter is active
        if (event.mode === 'online') return false;
        // Require structured location data
        if (!event.locationData || (!event.locationData.city && !event.locationData.state && !event.locationData.country)) {
          return false;
        }
        if (!locationMatches(
          locationFilter,
          event.locationData.city || '',
          event.locationData.state || '',
          event.locationData.country || '',
        )) return false;
      }

      if (dateRange?.from) {
        const rawDate = event.startAt || '';
        const eventDateStr = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
        const eventDate = new Date(eventDateStr + 'T00:00:00');
        eventDate.setHours(0, 0, 0, 0);

        const fromDate = new Date(dateRange.from);
        fromDate.setHours(0, 0, 0, 0);

        if (eventDate < fromDate) return false;

        if (dateRange.to) {
          const toDate = new Date(dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (eventDate > toDate) return false;
        } else {
          const endOfFromDate = new Date(fromDate);
          endOfFromDate.setHours(23, 59, 59, 999);
          if (eventDate > endOfFromDate) return false;
        }
      }

      if (selectedTagIds.length > 0) {
        const eventTagIds = event.tags?.map(t => t.id) || [];
        if (!selectedTagIds.some(tagId => eventTagIds.includes(tagId))) return false;
      }
      if (selectedTagNames.length > 0 && selectedTagIds.length === 0) {
        const eventTagNames = event.tags?.map(t => t.name.toLowerCase()) || [];
        const eventText = `${event.title} ${event.description || ''} ${event.profile.displayName} ${event.location || ''}`.toLowerCase();
        const matchesByTagName = selectedTagNames.some(tagName => eventTagNames.includes(tagName));
        const matchesByText = selectedTagNames.some(tagName => eventText.includes(tagName));
        if (!matchesByTagName && !matchesByText) return false;
      }
      return true;
    });
  }, [events, locationFilter, dateRange, modeFilter, selectedTagIds, selectedTagNames]);

  const toggleTagFilter = (tagId: number, tagName: string) => {
    const lowerName = tagName.toLowerCase();
    const isCurrentlySelected = selectedTagIds.includes(tagId);

    if (isCurrentlySelected) {
      setSelectedTagIds(prev => prev.filter(id => id !== tagId));
      setSelectedTagNames(prev => prev.filter(n => n !== lowerName));
    } else {
      setSelectedTagIds(prev => [...prev, tagId]);
      if (!selectedTagNames.includes(lowerName)) {
        setSelectedTagNames(prev => [...prev, lowerName]);
      }
    }
  };

  const toggleFallbackTagFilter = (tagName: string) => {
    const lowerName = tagName.toLowerCase();
    setSelectedTagNames(prev => 
      prev.includes(lowerName) 
        ? prev.filter(n => n !== lowerName) 
        : [...prev, lowerName]
    );
  };

  const clearAllFilters = () => {
    setSelectedTagIds([]);
    setSelectedTagNames([]);
  };

  const filteredCoaches = useMemo(() => {
    return coaches.filter((coach) => {
      if (locationFilter) {
        const coachLocation = coach.searchableLocation?.toLowerCase().trim() || '';
        if (!coachLocation) return false;
        if (!locationMatches(locationFilter, coachLocation, coachLocation, coachLocation)) return false;
      }
      if (selectedTagNames.length > 0) {
        const coachText = `${coach.displayName} ${coach.title || ''} ${coach.shortBio || ''}`.toLowerCase();
        if (!selectedTagNames.some(tagName => coachText.includes(tagName))) return false;
      }
      return true;
    });
  }, [coaches, selectedTagNames, locationFilter]);

  // REDESIGNED COACH CARD: Background changed to #F8F9FA (grey), removed Sparkle
  const CoachCard = ({ coach }: { coach: Coach }) => {
    const prefetchRef = usePrefetchInView(prefetch, `coach-${coach.id}`, () => ({
      // Profile page uses the array-form key ["/api/profiles", username].
      queryKeys: [["/api/profiles", coach.username]],
    }));
    return (
    <Link href={`/${coach.username}`}>
      <div
        ref={prefetchRef}
        className="group relative bg-[#FBFCFD] border border-gray-200 rounded-[24px] p-3 hover:shadow-[0_8px_30px_rgba(182,102,103,0.15)] hover:border-[#b66667]/40 transition-all duration-300 cursor-pointer flex gap-4 h-full items-start shadow-sm"
        data-testid={`card-coach-${coach.id}`}
      >
        <div className="w-[100px] h-[120px] rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 relative shadow-inner ring-1 ring-black/5 group-hover:ring-[#b66667]/20 transition-all">
           <img
            src={coach.profileImageUrl || defaultProfileImage}
            alt={coach.displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>

        <div className="flex-1 min-w-0 py-1 flex flex-col h-full">
          <div className="flex justify-between items-start">
              <div className="min-w-0 w-full">
                 <h3 className="font-bold text-gray-900 text-base leading-tight group-hover:text-[#b66667] transition-colors truncate pr-2 mb-1">
                   {coach.displayName}
                 </h3>
                 <p className="text-[#b66667] font-medium text-xs line-clamp-2">
                   {coach.title || "Coach"}
                 </p>
              </div>
          </div>

          {coach.shortBio && (
            <p className="text-gray-500 text-xs leading-snug line-clamp-2 mb-2 mt-2">
              {coach.shortBio}
            </p>
          )}

          {coach.searchTags && coach.searchTags.length > 0 && (
            <div className="flex gap-1.5 mt-auto overflow-hidden">
              {coach.searchTags.slice(0, 3).map((tag, index) => (
                <span 
                  key={index}
                  className="bg-white border border-gray-200 rounded-full px-2 py-0.5 text-[10px] font-medium text-gray-600 whitespace-nowrap group-hover:border-[#b66667]/20 group-hover:text-[#b66667] transition-colors"
                >
                  {capitalizeFirstLetter(tag)}
                </span>
              ))}
              {coach.searchTags.length > 3 && (
                 <span className="text-[10px] text-gray-400 self-center">+{coach.searchTags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
    );
  };

  // REDESIGNED SESSION CARD: Modified to match older style (floating image, p-4) + No Separator Line
  const SessionCard = ({ session }: { session: Session }) => {
    const prefetchRef = usePrefetchInView(prefetch, `session-${session.id}`, () => ({
      // session-detail.tsx fetches the session, plus the owner profile.
      queryKeys: [
        [`/api/profiles/${session.profile.username}/sessions/${session.id}`],
        [`/api/profiles/${session.profile.username}`],
      ],
    }));
    return (
      <Link href={`/${session.profile.username}/session/${session.id}`} onClick={() => sessionStorage.setItem('home_scroll_y', String(window.scrollY))}>
        <div
            ref={prefetchRef}
            className="group bg-[#F8F9FA] border border-gray-200 rounded-[30px] p-4 shadow-sm hover:shadow-[0_12px_30px_rgba(0,0,0,0.1)] hover:border-gray-300 transition-all duration-300 cursor-pointer flex flex-col h-full hover:-translate-y-1"
            data-testid={`card-session-${session.id}`}
        >
          {/* Increased height to h-48 and added rounded corners + margin to make it "float" */}
          <div className="h-48 w-full relative overflow-hidden bg-gray-100 rounded-[24px] mb-3">
            {session.images && session.images.length > 0 ? (
              <img 
                src={session.images[0].url} 
                alt={session.images[0].alt || session.title} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                <Clock className="w-10 h-10 opacity-20" />
              </div>
            )}

            {/* Duration Overlay */}
            <div className="absolute bottom-2 right-2 bg-black/55 backdrop-blur-md text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm border border-white/10">
                <Clock className="w-3 h-3" />
                {session.duration ? `${session.duration}m` : "60m"}
            </div>

            <div className="absolute bottom-2 left-2 flex gap-1">
                {session.isOnline && (
                     <div className="bg-white/90 backdrop-blur-sm text-[#b66667] text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm border border-[#b66667]/10">
                        Online
                     </div>
                )}
                {session.isOffline && (
                     <div className="bg-white/90 backdrop-blur-sm text-[#b66667] text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm border border-[#b66667]/10">
                        In-Person
                     </div>
                )}
            </div>
          </div>

          <div className="flex flex-col flex-1 relative px-1">
            <h3 className="font-bold text-gray-900 text-base mb-1 line-clamp-1 group-hover:text-[#b66667] transition-colors">{session.title}</h3>

            <p className="text-gray-500 text-xs line-clamp-2 mb-3">
                {session.thumbnailDescription || session.description}
            </p>

            {/* Removed border-t and pt-2 to remove the line */}
            <div className="mt-auto flex items-center gap-2">
              <Avatar className="w-6 h-6 ring-1 ring-gray-200">
                <AvatarImage src={session.profile.profileImageUrl || defaultProfileImage} />
                <AvatarFallback>{session.profile.displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="text-xs overflow-hidden w-full flex justify-between items-center">
                <p className="font-medium text-gray-700 truncate max-w-[80px]">{session.profile.displayName}</p>
                <span className="font-bold text-[#b66667]">
                   {session.isFree ? "Free" : formatPrice(session.price, session.currency || 'USD')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  // REDESIGNED EVENT CARD: Modified to match older style (floating image, p-4) + No Separator Line
  const EventCard = ({ event }: { event: Event }) => {
    const eventDate = event.startAt ? new Date(event.startAt) : null;
    const day = eventDate ? format(eventDate, "dd") : "—";
    const month = eventDate ? format(eventDate, "MMM") : "—";

    const evStartTimeStr = (() => {
      if (!event.startAt) return null;
      const d = new Date(event.startAt);
      if (d.getHours() === 0 && d.getMinutes() === 0) return null;
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    })();
    const evEndTimeStr = (() => {
      if (!event.endAt) return null;
      const d = new Date(event.endAt);
      if (d.getHours() === 0 && d.getMinutes() === 0) return null;
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    })();

    // Mirror the detail page's key exactly: series cards resolve via seriesId
    // with ?asSeriesRoot=true, single events via their own id.
    const eventDetailKey = event.seriesId
      ? `/api/profiles/${event.profile.username}/events/${event.seriesId}?asSeriesRoot=true`
      : `/api/profiles/${event.profile.username}/events/${event.id}`;
    const prefetchRef = usePrefetchInView(prefetch, `event-${event.id}`, () => ({
      queryKeys: [
        [eventDetailKey],
        [`/api/profiles/${event.profile.username}`],
      ],
    }));

    return (
      <Link
        href={event.seriesId
          ? `/${event.profile.username}/event/${event.seriesId}?asSeriesRoot=true`
          : `/${event.profile.username}/event/${event.id}`}
        onClick={() => sessionStorage.setItem('home_scroll_y', String(window.scrollY))}
      >
        <div
            ref={prefetchRef}
            className="group bg-[#F8F9FA] border border-gray-200 rounded-[30px] p-4 shadow-sm hover:shadow-[0_12px_30px_rgba(0,0,0,0.1)] hover:border-gray-300 transition-all duration-300 cursor-pointer flex flex-col h-full hover:-translate-y-1"
            data-testid={`card-event-${event.id}`}
        >
          {/* Increased height to h-48 and added rounded corners + margin to make it "float" */}
          <div className="h-48 w-full relative overflow-hidden bg-gray-100 rounded-[24px] mb-3">
             {event.featuredImage ? (
                <img 
                    src={event.featuredImage} 
                    alt={event.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-50">
                  <Calendar className="w-10 h-10 opacity-20" />
                </div>
              )}

             {isEventPast(event) ? (
               <div className="absolute top-2 left-2 bg-white/90 rounded-lg shadow-sm border border-[#b66667] px-2 py-1 text-center flex items-center justify-center leading-none">
                 <span className="text-[9px] font-bold text-[#b66667]/70 uppercase whitespace-nowrap">Past event</span>
               </div>
             ) : (
               <div className="absolute top-2 left-2 bg-white rounded-lg shadow-md border border-gray-100 px-2 py-1 text-center min-w-[40px] flex flex-col items-center justify-center leading-none">
                 <span className="text-[9px] font-bold text-[#b66667] uppercase">{month}</span>
                 <span className="text-sm font-extrabold text-gray-900">{day}</span>
               </div>
             )}
          </div>

          <div className="flex flex-col flex-1 px-1">
            <h3 className="font-bold text-gray-900 text-base mb-1 line-clamp-1 group-hover:text-[#b66667] transition-colors">{event.title}</h3>

            {event.thumbnailDescription && (
              <p className="text-gray-500 text-xs line-clamp-2 mb-2">
                  {event.thumbnailDescription}
              </p>
            )}

            {/* Cadence badge for recurring series */}
            {(event.cadenceLabel || event.isRecurring) && (
              <div className="flex items-center gap-1.5 mb-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full">
                  <Repeat className="w-2.5 h-2.5" />
                  {event.cadenceLabel || 'Recurring'}
                </span>
                {event.upcomingCount != null && event.upcomingCount > 0 && (
                  <span className="text-[10px] font-medium text-gray-400">
                    {event.upcomingCount} upcoming
                  </span>
                )}
              </div>
            )}

             <div className="flex items-center gap-1.5 text-gray-500 text-[11px] mb-2 font-medium mt-auto">
                <Clock className="w-3 h-3" />
                {evStartTimeStr ? (
                    <span>{evStartTimeStr}{evEndTimeStr ? ` - ${evEndTimeStr}` : ''}</span>
                ) : event.isRecurring ? (
                    <span>Multiple dates</span>
                ) : (
                    <span>Time TBA</span>
                )}
             </div>

            {/* Removed border-t and pt-2 to remove the line */}
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6 ring-1 ring-gray-200">
                <AvatarImage src={event.profile.profileImageUrl || defaultProfileImage} />
                <AvatarFallback>{event.profile.displayName.charAt(0)}</AvatarFallback>
              </Avatar>

              <div className="text-xs overflow-hidden w-full flex justify-between items-center gap-2">
                <p className="font-medium text-gray-700 truncate flex-1 min-w-0" title={event.profile.displayName}>
                  {event.profile.displayName}
                </p>
                 <span className="font-bold text-[#b66667] whitespace-nowrap flex-shrink-0">
                   {event.pricingType === 'free' ? "Free" : event.pricingType === 'donation' ? "Donation" : formatPrice(event.price, event.currency || 'USD')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  };

  const LoadingSkeleton = ({ count = 4 }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-40 bg-gray-50 animate-pulse rounded-[24px]" />
      ))}
    </div>
  );

  return (
    <section className="relative" data-testid="search-explore-section">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">


        <div 
          className="flex flex-nowrap overflow-x-auto justify-start md:justify-center gap-2 mb-2 max-w-full mx-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {availableTags.length > 0 ? (
            availableTags.slice(0, 8).map((tag) => (
              <button 
                key={tag.id}
                onClick={() => toggleTagFilter(tag.id, tag.name)}
                className={`font-medium px-3 py-1 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.03)] text-xs whitespace-nowrap transition-all duration-300 ${
                  selectedTagIds.includes(tag.id)
                    ? 'bg-[#b66667] text-white'
                    : 'bg-gray-100 hover:bg-[#b66667] hover:text-white text-gray-700'
                }`}
                data-testid={`tag-filter-${tag.id}`}
              >
                {capitalizeFirstLetter(tag.name)}
              </button>
            ))
          ) : (
            ["Zen", "Healing", "Mindfulness", "Prana", "Wellness", "Art", "Music", "Coaching"].map((tag, i) => (
              <button 
                key={i}
                onClick={() => toggleFallbackTagFilter(tag)}
                className={`font-medium px-3 py-1 rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.03)] text-xs whitespace-nowrap transition-all duration-300 ${
                  selectedTagNames.includes(tag.toLowerCase())
                    ? 'bg-[#b66667] text-white'
                    : 'bg-gray-100 hover:bg-[#b66667] hover:text-white text-gray-700'
                }`}
                data-testid={`tag-filter-fallback-${i}`}
              >
                {tag}
              </button>
            ))
          )}
        </div>

        {/* Unified Search + Location pill */}
        <div className="max-w-2xl mx-auto mb-6 px-1">
          <div ref={locationPillRef} className="relative flex items-center h-14 rounded-full bg-gray-50 border border-gray-200 focus-within:ring-2 focus-within:ring-[#b66667]/20 focus-within:border-[#b66667]/30 shadow-sm overflow-visible">
            {/* Search — ~70% */}
            <form onSubmit={handleSearch} className="flex items-center flex-[7] pl-5 pr-2 min-w-0">
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0 mr-2.5" />
              <input
                type="text"
                placeholder="Search coaches, sessions, events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none min-w-0"
                data-testid="input-search"
              />
            </form>

            {/* Divider */}
            <div className="w-px h-7 bg-gray-200 flex-shrink-0" />

            {/* Location — ~30% */}
            <div className="flex items-center flex-[3] pl-3 pr-4 min-w-0">
              <MapPin className="w-4 h-4 text-[#b66667] flex-shrink-0 mr-2" />
              <input
                ref={locationInputRef}
                type="text"
                placeholder="Any location"
                value={locationInputValue}
                onChange={handleLocationInputChange}
                onFocus={() => {
                  if (locationInputValue.trim() && locationPredictions.length > 0) setLocationDropdownOpen(true);
                }}
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none min-w-0 truncate"
                data-testid="filter-city-autocomplete"
                autoComplete="off"
              />
              {locationFilter && (
                <X
                  className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0 ml-1"
                  onClick={handleLocationClear}
                  data-testid="filter-city-clear"
                />
              )}
            </div>

            {/* Dropdown anchored to full pill width */}
            <PlacesAutocompleteDropdown
              predictions={locationPredictions}
              isLoading={locationPredictionsLoading}
              open={locationDropdownOpen}
              onSelect={handleLocationSelect}
              onClose={() => setLocationDropdownOpen(false)}
              anchorRef={locationPillRef}
            />
          </div>
        </div>

        <div className="bg-white rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.06)] pb-8 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-1">
                <div className="bg-[#b66667] rounded-t-[32px] p-3 sm:p-4 flex justify-center items-center mb-3">
                  <TabsList className="bg-transparent p-0 gap-2 sm:gap-4 h-auto w-full justify-center flex">
                    <TabsTrigger 
                      value="events" 
                      className="rounded-full px-4 sm:px-8 py-3 sm:py-4 text-white/80 data-[state=active]:bg-white data-[state=active]:text-[#b66667] data-[state=active]:shadow-md transition-all font-bold flex items-center gap-2 text-xs sm:text-sm flex-1 justify-center max-w-[200px]"
                      data-testid="tab-events"
                    >
                      <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" /> <span>Events</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="sessions" 
                      className="rounded-full px-4 sm:px-8 py-3 sm:py-4 text-white/80 data-[state=active]:bg-white data-[state=active]:text-[#b66667] data-[state=active]:shadow-md transition-all font-bold flex items-center gap-2 text-xs sm:text-sm flex-1 justify-center max-w-[200px]"
                      data-testid="tab-sessions"
                    >
                      <MapPin className="w-4 h-4 sm:w-5 sm:h-5" /> <span>Sessions</span>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="coaches" 
                      className="rounded-full px-4 sm:px-8 py-3 sm:py-4 text-white/80 data-[state=active]:bg-white data-[state=active]:text-[#b66667] data-[state=active]:shadow-md transition-all font-bold flex items-center gap-2 text-xs sm:text-sm flex-1 justify-center max-w-[200px]"
                      data-testid="tab-coaches"
                    >
                      <Users className="w-4 h-4 sm:w-5 sm:h-5" /> <span>Coaches</span>
                    </TabsTrigger>
                  </TabsList>
              </div>

                <div className="flex gap-2 sm:gap-3 pb-1 flex-nowrap overflow-x-auto px-4 sm:px-6 justify-start scrollbar-hide [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">

                  {activeTab !== "coaches" && (
                    <Select value={modeFilter} onValueChange={(v) => setModeFilter(v as "all" | "online" | "offline")}>
                      <SelectTrigger className="w-auto rounded-full bg-[#F8F9FA] border-none h-9 px-2 sm:px-3 text-sm font-medium text-gray-700" data-testid="filter-type">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {activeTab === "events" && (
                    <>
                      <button
                        onClick={handleTodayToggle}
                        data-testid="filter-today"
                        aria-pressed={isTodayActive}
                        className={`h-9 px-2 sm:px-3 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                          isTodayActive
                            ? "bg-[#b66667]/15 text-[#b66667] ring-1 ring-[#b66667]/30"
                            : "bg-[#F8F9FA] text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        Today
                      </button>
                      <button
                        onClick={handleThisWeekToggle}
                        data-testid="filter-this-week"
                        aria-pressed={isThisWeekActive}
                        className={`h-9 px-2 sm:px-3 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                          isThisWeekActive
                            ? "bg-[#b66667]/15 text-[#b66667] ring-1 ring-[#b66667]/30"
                            : "bg-[#F8F9FA] text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        This Week
                      </button>
                      <DateRangeFilter
                        value={dateRange}
                        onChange={setDateRange}
                      />
                    </>
                  )}

                {locationFilter && (
                  <button
                    type="button"
                    onClick={handleLocationClear}
                    className="h-9 pl-3 pr-2 rounded-full bg-[#b66667]/10 text-[#b66667] text-sm font-medium hover:bg-[#b66667]/20 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 max-w-[220px] sm:max-w-none"
                    data-testid="filter-location-pill"
                    title={`Clear location: ${locationFilter.displayLabel}`}
                  >
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{locationFilter.displayLabel}</span>
                    <X className="w-3.5 h-3.5 flex-shrink-0" />
                  </button>
                )}

                {(selectedTagIds.length > 0 || selectedTagNames.length > 0) && (
                  <button
                    onClick={clearAllFilters}
                    className="h-10 px-3 sm:px-4 rounded-full bg-[#b66667]/10 text-[#b66667] text-sm font-medium hover:bg-[#b66667]/20 transition-colors whitespace-nowrap"
                    data-testid="button-clear-tags"
                  >
                    Clear ({selectedTagIds.length || selectedTagNames.length})
                  </button>
                )}
              </div>
            </div>

              <div id="results-grid" className="mt-2 px-4 sm:px-6">
              <TabsContent value="events" className="m-0 focus-visible:ring-0">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Events</h2>
                {eventsLoading ? <LoadingSkeleton count={3} /> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredEvents.length > 0 ? filteredEvents.map(event => (
                      <EventCard key={event.id} event={event} />
                    )) : (
                      <div className="col-span-full py-10 text-center text-gray-400">No events found.</div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="sessions" className="m-0 focus-visible:ring-0">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Sessions</h2>
                {sessionsLoading ? <LoadingSkeleton count={3} /> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredSessions.length > 0 ? filteredSessions.map(session => (
                      <SessionCard key={session.id} session={session} />
                    )) : (
                      <div className="col-span-full py-10 text-center text-gray-400">No sessions found.</div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="coaches" className="m-0 focus-visible:ring-0 space-y-4">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Coaches</h2>
                {coachesLoading ? <LoadingSkeleton count={3} /> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredCoaches.length > 0 ? filteredCoaches.map(coach => (
                      <CoachCard key={coach.id} coach={coach} />
                    )) : (
                      <div className="col-span-full py-10 text-center text-gray-400">No coaches found.</div>
                    )}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </section>
  );
}