import { useState, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLoadScript } from "@react-google-maps/api";
import { usePlacesAutocomplete } from "@/hooks/use-places-autocomplete";
import { useUserLocation } from "@/hooks/use-user-location";
import { PlacesAutocompleteDropdown } from "./places-autocomplete-dropdown";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";

interface CitySearchBarProps {
  value: string;
  onChange: (value: string, cityData?: CityData) => void;
  placeholder?: string;
  className?: string;
}

export interface CityData {
  city: string;
  state: string;
  country: string;
  placeId: string;
  formattedLocation: string;
}

export function CitySearchBar({ 
  value, 
  onChange, 
  placeholder = "Search for a city or town...",
  className 
}: CitySearchBarProps) {
  const [inputValue, setInputValue] = useState(value);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isPlaceSelected = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  });

  const userLocation = useUserLocation();

  const { predictions, isLoading: predictionsLoading, fetchPredictions, clearPredictions, getPlaceDetails } =
    usePlacesAutocomplete({ types: ["(cities)"], isLoaded, userLocation });

  useEffect(() => {
    if (!isPlaceSelected.current) {
      setInputValue(value);
    }
    isPlaceSelected.current = false;
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue, undefined);
    if (newValue.trim()) {
      setDropdownOpen(true);
      fetchPredictions(newValue);
    } else {
      setDropdownOpen(false);
      clearPredictions();
    }
  };

  const handleSelect = useCallback(async (prediction: { placeId: string; description: string }) => {
    setDropdownOpen(false);
    clearPredictions();
    try {
      const detail = await getPlaceDetails(prediction.placeId);
      const parts = [detail.city, detail.state, detail.country].filter(Boolean);
      const formattedLocation = parts.join(", ");
      const cityData: CityData = {
        city: detail.city,
        state: detail.state,
        country: detail.country,
        placeId: detail.placeId,
        formattedLocation,
      };
      isPlaceSelected.current = true;
      setInputValue(formattedLocation);
      onChange(formattedLocation, cityData);
    } catch {
      setInputValue(prediction.description);
      onChange(prediction.description, undefined);
    }
  }, [getPlaceDetails, clearPredictions, onChange]);

  const handleClear = () => {
    setInputValue("");
    setDropdownOpen(false);
    clearPredictions();
    onChange("", undefined);
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        <MapPin className="w-4 h-4" />
        <span>Failed to load location search</span>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading location search...</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className || ""}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (inputValue.trim() && predictions.length > 0) setDropdownOpen(true);
          }}
          placeholder={placeholder}
          className="pl-9 pr-9 text-sm"
          data-testid="input-city-search"
          autoComplete="off"
        />
        {inputValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={handleClear}
            data-testid="button-clear-city"
          >
            <X className="w-3 h-3" />
          </Button>
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
