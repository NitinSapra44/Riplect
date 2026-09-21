import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AddLocationDialog } from "./add-location-dialog";
import { formatAddress } from "@/lib/location-utils";
import { MapPin, Plus, Check, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Location } from "@shared/schema";

interface LocationPickerProps {
  selectedLocationId: number | null | undefined;
  onSelect: (location: Location | null) => void;
  label?: string;
  className?: string;
}

export function LocationPicker({
  selectedLocationId,
  onSelect,
  label = "Location",
  className,
}: LocationPickerProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  const handleSelect = (location: Location) => {
    onSelect(location);
    setDialogOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setDialogOpen(false);
  };

  const handleAddNew = async (locationData: Partial<Location>) => {
    const res = await apiRequest("POST", "/api/locations", locationData);
    const newLocation = await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    onSelect(newLocation);
    setAddDialogOpen(false);
    setEditingLocation(null);
  };

  const handleEdit = (location: Location, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLocation(location);
    setDialogOpen(false);
    setAddDialogOpen(true);
  };

  const handleEditSave = async (locationData: Partial<Location>) => {
    if (!editingLocation) return;
    const res = await apiRequest("PATCH", `/api/locations/${editingLocation.id}`, locationData);
    const updatedLocation = await res.json();
    queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    
    // Update selection if we edited the currently selected location
    if (selectedLocationId === editingLocation.id) {
      onSelect(updatedLocation);
    }
    
    toast({ title: "Location updated", description: "Your location has been saved." });
    setAddDialogOpen(false);
    setEditingLocation(null);
  };

  const handleDeleteClick = (location: Location, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocationToDelete(location);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!locationToDelete) return;
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", `/api/locations/${locationToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      if (selectedLocationId === locationToDelete.id) {
        onSelect(null);
      }
      toast({ title: "Location deleted", description: "The location has been removed." });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete location.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setLocationToDelete(null);
    }
  };

  return (
    <div className={cn("space-y-2 w-full overflow-hidden", className)}>
      {label && <Label>{label}</Label>}
      
      <Button
        type="button"
        variant="outline"
        className="w-full max-w-full justify-start h-auto py-3 px-4 overflow-hidden"
        onClick={() => setDialogOpen(true)}
        data-testid="button-open-location-picker"
      >
        <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
        <div className="flex-1 text-left min-w-0 overflow-hidden text-ellipsis">
          {selectedLocation ? (
            <div className="overflow-hidden w-full">
              <div className="font-medium truncate max-w-full">{selectedLocation.name}</div>
              <div className="text-xs text-muted-foreground truncate max-w-full">
                {formatAddress(selectedLocation) || "No address"}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">Select a location...</span>
          )}
        </div>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Select Location</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 w-full overflow-hidden">
            {locations.length === 0 ? (
              <div className="text-center py-8">
                <MapPin className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground mb-4">No saved locations yet</p>
                <Button onClick={() => {
                  setEditingLocation(null);
                  setDialogOpen(false);
                  setAddDialogOpen(true);
                }} data-testid="button-add-location-empty">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Location
                </Button>
              </div>
            ) : (
              <>
                {locations.map((location) => (
                  <div
                    key={location.id}
                    className={cn(
                      "flex items-center gap-1.5 p-3 rounded-lg border cursor-pointer hover-elevate w-full",
                      selectedLocationId === location.id && "border-primary bg-primary/5"
                    )}
                    onClick={() => handleSelect(location)}
                    data-testid={`location-option-${location.id}`}
                  >
                    <MapPin className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{location.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatAddress(location) || "No address"}
                      </div>
                    </div>
                    {selectedLocationId === location.id && (
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => handleEdit(location, e)}
                        title="Edit location"
                        data-testid={`button-edit-location-${location.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => handleDeleteClick(location, e)}
                        title="Delete location"
                        data-testid={`button-delete-location-${location.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      {(location.latitude && location.longitude) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
                              "_blank"
                            );
                          }}
                          title="View on map"
                          data-testid={`button-view-location-${location.id}`}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                <div className="pt-4 border-t flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setEditingLocation(null);
                      setDialogOpen(false);
                      setAddDialogOpen(true);
                    }}
                    data-testid="button-add-new-location"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Location
                  </Button>
                  
                  {selectedLocationId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={handleClear}
                      data-testid="button-clear-location"
                    >
                      Clear Selection
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddLocationDialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) setEditingLocation(null);
        }}
        onSave={editingLocation ? handleEditSave : handleAddNew}
        editingLocation={editingLocation}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{locationToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
