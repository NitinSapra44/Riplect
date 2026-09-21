import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarDays, X, ChevronDown } from "lucide-react";
import { format, startOfDay, isEqual, isSameDay } from "date-fns";
import { DateRange, DayContentProps } from "react-day-picker";

interface DateRangeFilterProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}

type PresetKey = "today" | "thisweek" | "custom" | null;

const PRESET_LABELS: Record<Exclude<PresetKey, null>, string> = {
  today: "Today",
  thisweek: "This Week",
  custom: "Custom",
};

export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const today = useMemo(() => startOfDay(new Date()), []);

  const { data: eventDates = [] } = useQuery<string[]>({
    queryKey: ["/api/discover/event-dates"],
    queryFn: async () => {
      const response = await fetch("/api/discover/event-dates");
      if (!response.ok) throw new Error("Failed to fetch event dates");
      return response.json();
    },
  });

  // Build a date -> count map
  const eventCountByDate = useMemo(() => {
    const counts = new Map<string, number>();
    eventDates.forEach(dateStr => {
      const key = dateStr.split("T")[0];
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [eventDates]);

  // Count events in selected range for the trigger badge
  const eventsInRange = useMemo(() => {
    if (!value?.from) return 0;
    const from = startOfDay(value.from);
    const to = value.to ? startOfDay(value.to) : from;
    let total = 0;
    eventCountByDate.forEach((count, dateKey) => {
      const d = startOfDay(new Date(dateKey + "T00:00:00"));
      if (d >= from && d <= to) total += count;
    });
    return total;
  }, [eventCountByDate, value]);

  // This-week end: always at least 1 day ahead of today
  // On Sunday: advance to next Saturday. Other days: advance to this Sunday.
  const thisWeekEnd = useMemo(() => {
    const dayOfWeek = today.getDay();
    const d = new Date(today);
    if (dayOfWeek === 0) {
      d.setDate(d.getDate() + 6);
    } else {
      d.setDate(d.getDate() + (7 - dayOfWeek));
    }
    return startOfDay(d);
  }, [today]);

  // Derive which preset matches the current value (keeps trigger label in sync with external pill selections)
  const derivedPreset = useMemo((): PresetKey => {
    if (!value?.from) return null;
    const from = startOfDay(value.from);
    const to = value.to ? startOfDay(value.to) : null;
    if (isSameDay(from, today) && (!to || isSameDay(to, today))) return "today";
    if (isSameDay(from, today) && to && isSameDay(to, thisWeekEnd)) return "thisweek";
    return "custom";
  }, [value, today, thisWeekEnd]);

  // Custom calendar day content — shows event count badge
  const CustomDayContent = useMemo(() => {
    return function DayContent(props: DayContentProps) {
      const dateKey = format(props.date, "yyyy-MM-dd");
      const count = eventCountByDate.get(dateKey) || 0;
      const isToday = isSameDay(props.date, today);
      const isSelected = props.activeModifiers.selected;

      return (
        <div
          className={`relative flex flex-col items-center justify-center w-full h-full ${
            isToday && !isSelected ? "bg-[#b66667]/10 rounded-full" : ""
          }`}
        >
          <span
            className={`leading-none text-[13px] ${isToday || isSelected ? "font-bold" : ""} ${
              isSelected ? "text-white" : isToday ? "text-[#b66667]" : ""
            }`}
          >
            {props.date.getDate()}
          </span>
          {count > 0 && (
            <span
              className={`text-[8px] font-bold leading-none mt-0.5 rounded-full px-1 min-w-[12px] text-center ${
                isSelected ? "bg-white/30 text-white" : "bg-[#b66667]/15 text-[#b66667]"
              }`}
            >
              {count}
            </span>
          )}
        </div>
      );
    };
  }, [eventCountByDate, today]);

  const handleSelect = useCallback(
    (range: DateRange | undefined, selectedDay: Date) => {
      if (value?.from && value?.to) {
        onChange({ from: selectedDay, to: undefined });
        return;
      }
      if (!range) { onChange(undefined); return; }
      if (range.from && range.to && isEqual(startOfDay(range.from), startOfDay(range.to))) {
        onChange({ from: range.from, to: undefined });
        return;
      }
      onChange(range);
      if (range.from && range.to && !isEqual(range.from, range.to)) {
        setTimeout(() => setIsOpen(false), 150);
      }
    },
    [onChange, value]
  );

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange(undefined);
  };

  const handleReset = () => {
    onChange(undefined);
    setTimeout(() => setIsOpen(false), 100);
  };

  const triggerLabel = useMemo(() => {
    if (!value?.from) return "Dates";
    if (derivedPreset && derivedPreset !== "custom") return PRESET_LABELS[derivedPreset];
    if (value.to && !isSameDay(value.from, value.to)) {
      return `${format(value.from, "MMM d")} – ${format(value.to, "MMM d")}`;
    }
    return format(value.from, "MMM d");
  }, [value, derivedPreset]);

  const hasSelection = value?.from !== undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`w-auto shrink-0 h-9 px-2 sm:px-3 rounded-full bg-[#F8F9FA] border-none text-sm font-medium whitespace-nowrap gap-1 ${
            hasSelection ? "text-[#b66667] bg-[#b66667]/10" : "text-gray-700"
          } ${className || ""}`}
          data-testid="filter-date-range"
        >
          <CalendarDays className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{triggerLabel}</span>
          {hasSelection && eventsInRange > 0 && (
            <span className="inline-flex items-center justify-center bg-[#b66667] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none flex-shrink-0">
              {eventsInRange}
            </span>
          )}
          {hasSelection ? (
            <div
              className="hover:bg-[#b66667]/20 rounded-full p-0.5 flex-shrink-0"
              onClick={handleClear}
              data-testid="button-clear-date"
            >
              <X className="w-3 h-3" />
            </div>
          ) : (
            <ChevronDown className="w-3 h-3 flex-shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0 max-w-[calc(100vw-20px)] sm:max-w-sm mx-auto shadow-xl rounded-2xl overflow-hidden"
        align="center"
        side="bottom"
        sideOffset={10}
        collisionPadding={20}
        onOpenAutoFocus={e => e.preventDefault()}
        onPointerDownOutside={e => { e.preventDefault(); setIsOpen(false); }}
        onInteractOutside={e => { e.preventDefault(); setIsOpen(false); }}
      >
        {/* Status hint */}
        <div className="px-3 pt-3 pb-1 text-center">
          <p className="text-[10px] font-semibold text-[#b66667] uppercase tracking-widest opacity-80">
            {!value?.from ? "Select a date" : !value?.to ? "Select end date" : "Range selected"}
          </p>
        </div>

        {/* Calendar */}
        <div className="flex justify-center px-2 pb-2">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value?.from || today}
            selected={value}
            // @ts-ignore
            onSelect={handleSelect}
            numberOfMonths={1}
            className="p-0"
            classNames={{
              day_today: "bg-transparent text-gray-900",
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              row: "flex w-full mt-2",
            }}
            components={{ DayContent: CustomDayContent }}
          />
        </div>

        {/* Footer — Reset only, shown when selection exists */}
        {hasSelection && (
          <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-[#b66667] hover:text-[#b66667] hover:bg-[#b66667]/10 font-bold"
              onClick={handleReset}
              data-testid="button-reset-dates"
            >
              Reset
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
