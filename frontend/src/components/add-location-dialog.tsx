import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { reverseGeocodeWithFallback } from "@/lib/location-utils";
import { MapPin, Loader2, AlertCircle, Crosshair, Search } from "lucide-react";
import { GoogleMap, useLoadScript, Marker } from "@react-google-maps/api";
import { usePlacesAutocomplete } from "@/hooks/use-places-autocomplete";
import { useUserLocation } from "@/hooks/use-user-location";
import { PlacesAutocompleteDropdown } from "./places-autocomplete-dropdown";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";
import type { Location } from "@shared/schema";

interface AddLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (locationData: Partial<Location>) => Promise<void>;
  editingLocation?: Location | null;
}

export function AddLocationDialog({ open, onOpenChange, onSave, editingLocation }: AddLocationDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("");

  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");

  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 });
  const [markerPosition, setMarkerPosition] = useState<{ lat: number; lng: number } | null>(null);

  const [locationNameManuallyEdited, setLocationNameManuallyEdited] = useState(false);

  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);

  const sharedUserLocation = useUserLocation();
  const [manualLocation, setManualLocation] = useState<{ lat: number; lng: number } | null>(null);
  const userLocation = manualLocation ?? sharedUserLocation;

  const mapRef = useRef<google.maps.Map | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Timestamp of the last autocomplete-dropdown selection. Used to ignore the
  // GoogleMap onClick that would otherwise fire on the map sitting beneath the
  // (portaled) dropdown if the dropdown unmounts between mousedown and click —
  // which would silently overwrite all the address fields the user just picked.
  const lastDropdownSelectAtRef = useRef<number>(0);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
    version: "weekly",
  });

  const { predictions, isLoading: predictionsLoading, fetchPredictions, clearPredictions, getPlaceDetails } =
    usePlacesAutocomplete({ types: [], isLoaded, userLocation });

  useEffect(() => {
    if (editingLocation) {
      setLocationName(editingLocation.name || "");
      setLocationNameManuallyEdited(true);
      setAddress(editingLocation.address || "");
      setCity(editingLocation.city || "");
      setState(editingLocation.state || "");
      setZipCode(editingLocation.zipCode || "");
      setCountry(editingLocation.country || "");
      setGoogleMapsUrl(editingLocation.googleMapsUrl || "");
      setPlaceId(editingLocation.placeId || null);

      if (editingLocation.latitude && editingLocation.longitude) {
        const lat = parseFloat(editingLocation.latitude);
        const lng = parseFloat(editingLocation.longitude);
        setLatitude(lat);
        setLongitude(lng);
        setMapCenter({ lat, lng });
        setMarkerPosition({ lat, lng });
      }
    } else {
      resetForm();
    }
  }, [editingLocation, open]);

  const resetForm = () => {
    setLocationName("");
    setLocationNameManuallyEdited(false);
    setAddress("");
    setCity("");
    setState("");
    setZipCode("");
    setCountry("");
    setGoogleMapsUrl("");
    setLatitude(null);
    setLongitude(null);
    setPlaceId(null);
    setMarkerPosition(null);
    setManualLocation(null);
    setSearchInputValue("");
    setSearchDropdownOpen(false);
    clearPredictions();
  };

  const updateAddressFromCoordinates = async (lat: number, lng: number) => {
    setIsLoading(true);
    try {
      const addressData = await reverseGeocodeWithFallback(lat, lng);
      setCity(addressData.city);
      setState(addressData.state);
      setCountry(addressData.country);
      setZipCode(addressData.zipCode);
      setAddress(addressData.address);

      if (!googleMapsUrl) {
        setGoogleMapsUrl(`https://www.google.com/maps?q=${lat},${lng}`);
      }
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      toast({
        title: "Address lookup failed",
        description: "Could not fetch address details for this location.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocation not supported",
        description: "Your browser does not support geolocation.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setManualLocation({ lat, lng });
        setLatitude(lat);
        setLongitude(lng);
        setMapCenter({ lat, lng });
        setMarkerPosition({ lat, lng });
        mapRef.current?.panTo({ lat, lng });
        mapRef.current?.setZoom(15);

        await updateAddressFromCoordinates(lat, lng);

        toast({
          title: "Location detected",
          description: "Updated map and address details.",
        });
      },
      (error) => {
        setIsLoading(false);
        toast({
          title: "Location error",
          description: error.message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setSearchInputValue(v);
    if (v.trim()) {
      setSearchDropdownOpen(true);
      fetchPredictions(v);
    } else {
      setSearchDropdownOpen(false);
      clearPredictions();
    }
  };

  const handleSearchSelect = useCallback(async (prediction: { placeId: string; description: string }) => {
    // Stamp BEFORE we close the dropdown so handleMapClick can short-circuit
    // any stray map click that arrives in the same tick (defense in depth on
    // top of the onClick selection inside the dropdown component itself).
    lastDropdownSelectAtRef.current = Date.now();
    setSearchDropdownOpen(false);
    clearPredictions();
    setSearchInputValue(prediction.description);
    try {
      const detail = await getPlaceDetails(prediction.placeId);
      if (detail.lat !== null && detail.lng !== null) {
        setLatitude(detail.lat);
        setLongitude(detail.lng);
        setMapCenter({ lat: detail.lat, lng: detail.lng });
        setMarkerPosition({ lat: detail.lat, lng: detail.lng });
        mapRef.current?.panTo({ lat: detail.lat, lng: detail.lng });
        mapRef.current?.setZoom(15);
      }
      if (!locationNameManuallyEdited) {
        setLocationName(detail.name || "");
      }
      setAddress(detail.formattedAddress || "");
      setPlaceId(detail.placeId || null);
      const fallbackUrl = (detail.lat !== null && detail.lng !== null)
        ? `https://www.google.com/maps?q=${detail.lat},${detail.lng}`
        : "";
      setGoogleMapsUrl(detail.googleMapsUrl || fallbackUrl);
      setCity(detail.city);
      setState(detail.state);
      setZipCode(detail.zipCode || "");
      setCountry(detail.country);
    } catch (error) {
      console.error("Failed to get place details:", error);
      toast({
        title: "Location lookup failed",
        description: "Could not fetch details for this location.",
        variant: "destructive",
      });
    }
  }, [getPlaceDetails, clearPredictions, toast, locationNameManuallyEdited]);

  const handleMapClick = async (e: google.maps.MapMouseEvent) => {
    // Defensive guard: ignore map clicks that arrive within ~400ms of a
    // dropdown selection. The autocomplete dropdown is portaled and visually
    // overlaps the map; if its mousedown ever races ahead of mouseup the
    // map's onClick can fire on whatever point sits underneath the picked
    // suggestion and silently overwrite all the address fields.
    if (Date.now() - lastDropdownSelectAtRef.current < 400) {
      return;
    }
    if (e.latLng) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();

      setLatitude(lat);
      setLongitude(lng);
      setMarkerPosition({ lat, lng });
      setGoogleMapsUrl(`https://www.google.com/maps?q=${lat},${lng}`);

      await updateAddressFromCoordinates(lat, lng);
    }
  };

  const handleSave = async () => {
    if (!locationName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this location.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await onSave({
        name: locationName,
        address,
        city,
        state,
        zipCode,
        country,
        latitude: latitude?.toString() || null,
        longitude: longitude?.toString() || null,
        googleMapsUrl: googleMapsUrl || null,
        placeId,
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error saving location",
        description: "Failed to save the location. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const mapApiNotConfigured = !apiKey;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          // The Places autocomplete dropdown is portaled into document.body so it
          // sits as a sibling of this dialog's portal. Without this guard, Radix's
          // DismissableLayer treats clicks on dropdown items as outside-dialog
          // interactions and closes the dialog before the selection registers.
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-places-autocomplete-portal]")) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-places-autocomplete-portal]")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-add-location">
            {editingLocation ? "Edit Location" : "Add New Location"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 1. Basic Info */}
          <div>
            <Label htmlFor="location-name">Location Name *</Label>
            <Input
              id="location-name"
              data-testid="input-location-name"
              placeholder="e.g., Home Office, Downtown Studio"
              value={locationName}
              onChange={(e) => { setLocationName(e.target.value); setLocationNameManuallyEdited(true); }}
              className="mt-1.5"
            />
          </div>

          {/* 2. Map & Search Section */}
          <div className="space-y-3">
            <Label>Find Location</Label>

            {mapApiNotConfigured ? (
              <div className="flex flex-col items-center justify-center py-8 border rounded-lg bg-muted/30">
                <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Google Maps API key not configured.<br />
                  Please enter address details manually below.
                </p>
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-8 border rounded-lg bg-destructive/10">
                <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                <p className="text-destructive">Failed to load Google Maps</p>
              </div>
            ) : !isLoaded ? (
              <div className="flex items-center justify-center py-8 border rounded-lg">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Search Bar + Geolocation Button */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-2.5 top-2.5 text-muted-foreground z-10">
                      <Search className="h-4 w-4" />
                    </div>
                    <Input
                      ref={searchInputRef}
                      className="pl-9"
                      placeholder="Search for a place, city, or address..."
                      value={searchInputValue}
                      onChange={handleSearchInputChange}
                      onFocus={() => {
                        if (searchInputValue.trim() && predictions.length > 0) setSearchDropdownOpen(true);
                      }}
                      data-testid="input-search-location"
                      autoComplete="off"
                    />
                    <PlacesAutocompleteDropdown
                      predictions={predictions}
                      isLoading={predictionsLoading}
                      open={searchDropdownOpen}
                      onSelect={handleSearchSelect}
                      onClose={() => setSearchDropdownOpen(false)}
                      anchorRef={searchInputRef}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleGetCurrentLocation}
                    disabled={isLoading}
                    title="Use my current location"
                    type="button"
                    className="shrink-0 px-3"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Crosshair className="h-4 w-4" />
                    )}
                    <span className="sr-only sm:not-sr-only sm:ml-2">Locate Me</span>
                  </Button>
                </div>

                {/* Map */}
                <div className="h-[300px] w-full rounded-md border overflow-hidden relative">
                  <GoogleMap
                    mapContainerStyle={{ width: "100%", height: "100%" }}
                    center={mapCenter}
                    zoom={15}
                    onLoad={(map) => { mapRef.current = map; }}
                    onUnmount={() => { mapRef.current = null; }}
                    onClick={handleMapClick}
                    options={{
                      streetViewControl: false,
                      mapTypeControl: false,
                      fullscreenControl: true,
                    }}
                  >
                    {markerPosition && <Marker position={markerPosition} />}
                  </GoogleMap>
                </div>

                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Tip: Search, use your location, or click anywhere on the map to set the pin.
                </p>
              </div>
            )}
          </div>

          {/* 3. Detailed Address Fields */}
          <div className="p-4 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-muted-foreground">Address Details</Label>
              {(latitude !== null && longitude !== null) && (
                <div className="text-xs text-muted-foreground font-mono">
                  {latitude.toFixed(6)}, {longitude.toFixed(6)}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="address" className="text-xs">Address</Label>
                <Input
                  id="address"
                  className="bg-background"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div>
                <Label htmlFor="city" className="text-xs">City</Label>
                <Input
                  id="city"
                  className="bg-background"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                />
              </div>
              <div>
                <Label htmlFor="state" className="text-xs">State/Province</Label>
                <Input
                  id="state"
                  className="bg-background"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                />
              </div>
              <div>
                <Label htmlFor="zip-code" className="text-xs">ZIP/Postal Code</Label>
                <Input
                  id="zip-code"
                  className="bg-background"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="ZIP Code"
                />
              </div>
              <div>
                <Label htmlFor="country" className="text-xs">Country</Label>
                <Input
                  id="country"
                  className="bg-background"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !locationName.trim()}
            data-testid="button-save-location"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editingLocation ? "Update Location" : "Save Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
