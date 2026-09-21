import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { MapPin, ExternalLink, Building2, Navigation, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "@shared/schema";

interface LocationVisibilitySettings {
  showLocationName: boolean;
  showStreetAddress: boolean;
  showMapLocation: boolean;
}

interface LocationVisibilityProps {
  showExactLocation?: boolean;
  showLocationName?: boolean;
  showStreetAddress?: boolean;
  showMapLocation?: boolean;
  onVisibilityChange?: (showExact: boolean) => void;
  onSettingsChange?: (settings: LocationVisibilitySettings) => void;
  location?: Location | null;
  className?: string;
}

export function LocationVisibility({
  showLocationName = true,
  showStreetAddress = false,
  showMapLocation = false,
  onSettingsChange,
  location,
  className,
}: LocationVisibilityProps) {
  const instanceId = useId();
  const hasCoordinates = location?.latitude && location?.longitude;
  
  const handleChange = (field: keyof LocationVisibilitySettings, value: boolean) => {
    if (onSettingsChange) {
      onSettingsChange({
        showLocationName,
        showStreetAddress,
        showMapLocation,
        [field]: value,
      });
    }
  };

  const formatCityStateCountry = (loc: Location | null | undefined): string => {
    if (!loc) return "";
    const parts: string[] = [];
    if (loc.city) parts.push(loc.city);
    if (loc.state) parts.push(loc.state);
    if (loc.country) parts.push(loc.country);
    return parts.join(", ");
  };

  const cityStateCountry = formatCityStateCountry(location);
  
  return (
    <div className={cn("space-y-4 w-full min-w-0 overflow-x-hidden", className)} data-testid="location-visibility-container">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Location Visibility</Label>
        <p className="text-xs text-muted-foreground">
          Choose which location details to show publicly. City, state, and country are always visible for offline sessions and events.
        </p>
      </div>
      
      <div className="space-y-3">
        <label 
          htmlFor={`name-${instanceId}`}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors w-full min-w-0",
            showLocationName && "border-primary bg-primary/5"
          )}
        >
          <Checkbox 
            id={`name-${instanceId}`}
            checked={showLocationName}
            onCheckedChange={(checked) => handleChange("showLocationName", checked === true)}
            data-testid="checkbox-show-location-name"
          />
          <div className="flex-1 min-w-0">
            <span className="font-medium flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              Location Name
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              e.g. "Central Park", "Studio A", "My Office"
            </p>
          </div>
        </label>
        
        <label 
          htmlFor={`address-${instanceId}`}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors w-full min-w-0",
            showStreetAddress && "border-primary bg-primary/5"
          )}
        >
          <Checkbox 
            id={`address-${instanceId}`}
            checked={showStreetAddress}
            onCheckedChange={(checked) => handleChange("showStreetAddress", checked === true)}
            data-testid="checkbox-show-street-address"
          />
          <div className="flex-1 min-w-0">
            <span className="font-medium flex items-center gap-2 text-sm">
              <Navigation className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              Street Address
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full street address details
            </p>
          </div>
        </label>
        
        <label 
          htmlFor={`map-${instanceId}`}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors w-full min-w-0",
            showMapLocation && "border-primary bg-primary/5",
            !hasCoordinates && "opacity-50 cursor-not-allowed"
          )}
        >
          <Checkbox 
            id={`map-${instanceId}`}
            checked={showMapLocation}
            onCheckedChange={(checked) => handleChange("showMapLocation", checked === true)}
            disabled={!hasCoordinates}
            data-testid="checkbox-show-map-location"
          />
          <div className="flex-1 min-w-0">
            <span className="font-medium flex items-center gap-2 text-sm">
              <Map className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              Map Location
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasCoordinates 
                ? "Show 'View on Map' link with map coordinates" 
                : "No map coordinates available for this location"}
            </p>
          </div>
        </label>
      </div>
      
      {location && (
        <Card className="p-4 bg-muted/30 border-dashed overflow-hidden min-w-0">
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="font-medium uppercase tracking-wide flex-shrink-0">Preview</span>
              <span className="text-muted-foreground/70 truncate">- How visitors will see it</span>
            </div>
            
            <div className="pl-5 space-y-1 min-w-0" data-testid="text-location-preview">
              {showLocationName && location.name && (
                <p className="text-sm font-medium break-words">{location.name}</p>
              )}
              
              {showStreetAddress && location.address && (
                <p className="text-sm text-foreground/80 break-words">{location.address}</p>
              )}
              
              {cityStateCountry && (
                <p className="text-sm text-foreground/80 break-words">{cityStateCountry}</p>
              )}
              
              {showMapLocation && hasCoordinates && (
                <div className="flex items-center gap-1.5 mt-2 text-xs text-primary">
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  <span>View on Google Maps</span>
                </div>
              )}
              
              {!showLocationName && !showStreetAddress && !showMapLocation && (
                <p className="text-xs text-muted-foreground italic">
                  Only city, state, and country will be shown
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
