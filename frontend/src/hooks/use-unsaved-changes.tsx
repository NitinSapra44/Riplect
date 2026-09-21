import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface UnsavedChangesContextType {
  registerForm: (formId: string) => void;
  unregisterForm: (formId: string) => void;
  setFormDirty: (formId: string, isDirty: boolean) => void;
  registerSaveCallback: (formId: string, callback: () => Promise<void>) => void;
  unregisterSaveCallback: (formId: string) => void;
  hasUnsavedChanges: () => boolean;
  confirmNavigation: (callback: () => void) => void;
  blockNavigation: boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType | null>(null);

interface UnsavedChangesProviderProps {
  children: ReactNode;
}

export function UnsavedChangesProvider({ children }: UnsavedChangesProviderProps) {
  const [dirtyForms, setDirtyForms] = useState<Set<string>>(new Set());
  const [showDialog, setShowDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingCallback = useRef<(() => void) | null>(null);
  const saveCallbacks = useRef<Map<string, () => Promise<void>>>(new Map());
  const { toast } = useToast();

  const registerForm = useCallback((formId: string) => {
  }, []);

  const unregisterForm = useCallback((formId: string) => {
    setDirtyForms((prev) => {
      const next = new Set(prev);
      next.delete(formId);
      return next;
    });
  }, []);

  const setFormDirty = useCallback((formId: string, isDirty: boolean) => {
    setDirtyForms((prev) => {
      const next = new Set(prev);
      if (isDirty) {
        next.add(formId);
      } else {
        next.delete(formId);
      }
      return next;
    });
  }, []);

  const registerSaveCallback = useCallback((formId: string, callback: () => Promise<void>) => {
    saveCallbacks.current.set(formId, callback);
  }, []);

  const unregisterSaveCallback = useCallback((formId: string) => {
    saveCallbacks.current.delete(formId);
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    return dirtyForms.size > 0;
  }, [dirtyForms]);

  const confirmNavigation = useCallback((callback: () => void) => {
    if (dirtyForms.size > 0) {
      pendingCallback.current = callback;
      setShowDialog(true);
    } else {
      callback();
    }
  }, [dirtyForms]);

  const handleDiscard = useCallback(() => {
    setShowDialog(false);
    setDirtyForms(new Set());
    if (pendingCallback.current) {
      pendingCallback.current();
      pendingCallback.current = null;
    }
  }, []);

  const handleSaveAndLeave = useCallback(async () => {
    setIsSaving(true);
    try {
      const savePromises: Promise<void>[] = [];
      dirtyForms.forEach((formId) => {
        const saveCallback = saveCallbacks.current.get(formId);
        if (saveCallback) {
          savePromises.push(saveCallback());
        }
      });
      
      await Promise.all(savePromises);
      
      toast({
        title: "Changes saved",
        description: "Your changes have been saved successfully.",
      });
      
      setShowDialog(false);
      setDirtyForms(new Set());
      
      if (pendingCallback.current) {
        pendingCallback.current();
        pendingCallback.current = null;
      }
    } catch (error) {
      toast({
        title: "Save failed",
        description: "There was an error saving your changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [dirtyForms, toast]);

  const handleClose = useCallback(() => {
    setShowDialog(false);
    pendingCallback.current = null;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyForms.size > 0) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyForms]);

  const blockNavigation = dirtyForms.size > 0;

  return (
    <UnsavedChangesContext.Provider
      value={{
        registerForm,
        unregisterForm,
        setFormDirty,
        registerSaveCallback,
        unregisterSaveCallback,
        hasUnsavedChanges,
        confirmNavigation,
        blockNavigation,
      }}
    >
      {children}

      <Dialog open={showDialog} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline"
              onClick={handleDiscard} 
              data-testid="button-discard"
            >
              Discard changes
            </Button>
            <Button 
              onClick={handleSaveAndLeave} 
              disabled={isSaving}
              data-testid="button-save-leave"
            >
              {isSaving ? "Saving..." : "Save and leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesContext() {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error("useUnsavedChangesContext must be used within UnsavedChangesProvider");
  }
  return context;
}

export function useUnsavedChanges(formId: string, isDirty: boolean, saveCallback?: () => Promise<void>) {
  const { registerForm, unregisterForm, setFormDirty, registerSaveCallback, unregisterSaveCallback } = useUnsavedChangesContext();

  useEffect(() => {
    registerForm(formId);
    return () => unregisterForm(formId);
  }, [formId, registerForm, unregisterForm]);

  useEffect(() => {
    setFormDirty(formId, isDirty);
  }, [formId, isDirty, setFormDirty]);

  useEffect(() => {
    if (saveCallback) {
      registerSaveCallback(formId, saveCallback);
      return () => unregisterSaveCallback(formId);
    }
  }, [formId, saveCallback, registerSaveCallback, unregisterSaveCallback]);
}

export function useConfirmNavigation() {
  const { confirmNavigation, hasUnsavedChanges } = useUnsavedChangesContext();
  return { confirmNavigation, hasUnsavedChanges };
}
