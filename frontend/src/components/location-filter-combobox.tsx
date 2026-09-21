import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvailableLocation {
  city: string;
  state: string | null;
  country: string | null;
  displayLabel: string;
}

interface LocationFilterComboboxProps {
  value: string;
  onChange: (value: string) => void;
  category: "coaches" | "sessions" | "events";
  className?: string;
}

export function LocationFilterCombobox({
  value,
  onChange,
  category,
  className,
}: LocationFilterComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: locations = [], isLoading } = useQuery<AvailableLocation[]>({
    queryKey: ["/api/discover/locations", category],
    queryFn: async () => {
      const response = await fetch(`/api/discover/locations/${category}`);
      if (!response.ok) throw new Error("Failed to fetch locations");
      return response.json();
    },
  });

  // Sync search input with value when value or category changes
  useEffect(() => {
    setSearchInput(value);
  }, [value]);

  // Reset search input when category changes (close dropdown too)
  useEffect(() => {
    setSearchInput(value);
    setOpen(false);
  }, [category]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredLocations = locations.filter((loc) => {
    if (!searchInput) return true;
    const search = searchInput.toLowerCase();
    return (
      loc.city.toLowerCase().includes(search) ||
      (loc.state && loc.state.toLowerCase().includes(search)) ||
      (loc.country && loc.country.toLowerCase().includes(search)) ||
      loc.displayLabel.toLowerCase().includes(search)
    );
  });

  const handleSelect = (location: AvailableLocation) => {
    onChange(location.displayLabel);
    setSearchInput(location.displayLabel);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setSearchInput("");
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchInput(newValue);
    onChange(newValue);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className="flex items-center w-full h-10 rounded-full bg-[#F8F9FA] px-3 sm:px-4 cursor-pointer"
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Location"
          value={searchInput}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          className="flex-1 bg-transparent text-sm font-medium text-gray-700 placeholder:text-gray-500 focus:outline-none min-w-0"
          data-testid="filter-location-input"
        />
        {value ? (
          <X
            className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0"
            onClick={handleClear}
            data-testid="filter-location-clear"
          />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-auto bg-white rounded-xl shadow-lg border border-gray-100 z-50">
          {isLoading ? (
            <div className="p-3 text-sm text-gray-500 text-center">Loading locations...</div>
          ) : filteredLocations.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              {searchInput ? "No locations found" : "No locations available"}
            </div>
          ) : (
            <div className="py-1">
              {filteredLocations.map((location, index) => (
                <button
                  key={`${location.city}-${location.state}-${location.country}-${index}`}
                  onClick={() => handleSelect(location)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors",
                    value === location.displayLabel && "bg-[#b66667]/10 text-[#b66667]"
                  )}
                  data-testid={`filter-location-option-${index}`}
                >
                  <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="flex-1 truncate">{location.displayLabel}</span>
                  {value === location.displayLabel && (
                    <Check className="w-4 h-4 text-[#b66667] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
