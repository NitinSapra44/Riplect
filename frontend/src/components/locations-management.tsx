import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { posthog } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AddLocationDialog } from "./add-location-dialog";
import { formatAddress } from "@/lib/location-utils";
import { MapPin, Plus, Pencil, Trash2, Star, ExternalLink, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Location } from "@shared/schema";

export function LocationsManagement() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<Location>) => {
      const res = await apiRequest("POST", "/api/locations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      posthog.capture('profile_location_saved');
      posthog.setPersonProperties({ profile_has_location: true });
      toast({
        title: "Location saved",
        description: "Your location has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save location. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Location> }) => {
      const res = await apiRequest("PATCH", `/api/locations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Location updated",
        description: "Your location has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update location. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Location deleted",
        description: "The location has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete location. Please try again.",
        variant: "destructive",
      });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/locations/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
      toast({
        title: "Default location set",
        description: "This is now your default location.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to set default location. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = async (locationData: Partial<Location>) => {
    if (editingLocation) {
      await updateMutation.mutateAsync({ id: editingLocation.id, data: locationData });
    } else {
      await createMutation.mutateAsync(locationData);
    }
    setEditingLocation(null);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteMutation.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleAddNew = () => {
    setEditingLocation(null);
    setDialogOpen(true);
  };

  const openInMaps = (location: Location) => {
    if (location.latitude && location.longitude) {
      window.open(
        `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
        "_blank"
      );
    } else if (location.googleMapsUrl) {
      window.open(location.googleMapsUrl, "_blank");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-locations-title">
            Saved Locations
          </h2>
          <p className="text-muted-foreground">
            Manage your locations for sessions, events, and contact info.
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-location">
          <Plus className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      </div>

      {locations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No locations saved</CardTitle>
            <CardDescription className="text-center mb-4">
              Save your frequently used locations to quickly add them to sessions and events.
            </CardDescription>
            <Button onClick={handleAddNew} data-testid="button-add-first-location">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => (
            <Card key={location.id} data-testid={`card-location-${location.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                    <CardTitle className="text-lg truncate max-w-full">{location.name}</CardTitle>
                    {location.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(location)}
                      data-testid={`button-edit-location-${location.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(location.id)}
                      data-testid={`button-delete-location-${location.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground break-words">
                  {formatAddress(location) || "No address details"}
                </div>
                
                {location.latitude && location.longitude && (
                  <div className="text-xs text-muted-foreground">
                    {parseFloat(location.latitude).toFixed(6)}, {parseFloat(location.longitude).toFixed(6)}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap pt-2">
                  {(location.latitude && location.longitude) || location.googleMapsUrl ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openInMaps(location)}
                      data-testid={`button-view-map-${location.id}`}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      View on Map
                    </Button>
                  ) : null}
                  
                  {!location.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDefaultMutation.mutate(location.id)}
                      disabled={setDefaultMutation.isPending}
                      data-testid={`button-set-default-${location.id}`}
                    >
                      <Star className="w-3 h-3 mr-1" />
                      Set as Default
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddLocationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        editingLocation={editingLocation}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this location? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
