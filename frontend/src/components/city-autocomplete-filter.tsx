import { useState, useRef, useEffect, useCallback } from "react";
import { useLoadScript } from "@react-google-maps/api";
import { MapPin, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlacesAutocomplete } from "@/hooks/use-places-autocomplete";
import { useUserLocation } from "@/hooks/use-user-location";
import { PlacesAutocompleteDropdown } from "./places-autocomplete-dropdown";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";

export interface CityLocation {
  city: string;
  state: string;
  country: string;
  displayLabel: string;
}

interface CityAutocompleteFilterProps {
  value: CityLocation | null;
  onChange: (location: CityLocation | null) => void;
  className?: string;
  placeholder?: string;
  variant?: "sm" | "lg";
}

export function CityAutocompleteFilter({
  value,
  onChange,
  className,
  placeholder = "Search any city...",
  variant = "sm",
}: CityAutocompleteFilterProps) {
  const [inputValue, setInputValue] = useState(value?.displayLabel || "");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const containerCls = variant === "lg"
    ? "flex items-center w-full h-14 rounded-full bg-gray-50 border border-gray-200 px-5"
    : "flex items-center w-full h-10 rounded-full bg-[#F8F9FA] px-3 sm:px-4";

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  });

  const userLocation = useUserLocation();

  const { predictions, isLoading: predictionsLoading, fetchPredictions, clearPredictions, getPlaceDetails } =
    usePlacesAutocomplete({ types: ["(cities)"], isLoaded, userLocation });

  useEffect(() => {
    setInputValue(value?.displayLabel || "");
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    if (!v) {
      onChange(null);
      clearPredictions();
      setDropdownOpen(false);
    } else {
      setDropdownOpen(true);
      fetchPredictions(v);
    }
  };

  const handleSelect = useCallback(async (prediction: { placeId: string; description: string }) => {
    setDropdownOpen(false);
    clearPredictions();
    try {
      const detail = await getPlaceDetails(prediction.placeId);
      const parts = [detail.city, detail.state, detail.country].filter(Boolean);
      const displayLabel = parts.join(", ");
      const newLocation: CityLocation = {
        city: detail.city,
        state: detail.state,
        country: detail.country,
        displayLabel,
      };
      setInputValue(displayLabel);
      onChange(newLocation);
    } catch {
      setInputValue(prediction.description);
    }
  }, [getPlaceDetails, clearPredictions, onChange]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue("");
    setDropdownOpen(false);
    clearPredictions();
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  if (!apiKey) {
    return (
      <div className={cn("relative", className)}>
        <div className={containerCls}>
          <MapPin className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
          <span className="text-sm text-gray-500">Location search unavailable</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={cn("relative", className)}>
        <div className={containerCls}>
          <MapPin className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
          <span className="text-sm text-gray-500">Failed to load</span>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={cn("relative", className)}>
        <div className={containerCls}>
          <Loader2 className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0 animate-spin" />
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div className={containerCls}>
        <MapPin className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputValue.trim() && predictions.length > 0) setDropdownOpen(true);
          }}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-700 placeholder:text-gray-500 focus:outline-none truncate"
          data-testid="filter-city-autocomplete"
          autoComplete="off"
        />
        {value && (
          <X
            className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0 ml-2"
            onClick={handleClear}
            data-testid="filter-city-clear"
          />
        )}
      </div>
      <PlacesAutocompleteDropdown
        predictions={predictions}
        isLoading={predictionsLoading}
        open={dropdownOpen}
        onSelect={handleSelect}
        onClose={() => setDropdownOpen(false)}
        anchorRef={inputRef}
      />
    </div>
  );
}
