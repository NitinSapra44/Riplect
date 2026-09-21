import { useState, useCallback, type ReactNode } from "react";
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

interface UseDialogUnsavedChangesReturn {
  showConfirmDialog: boolean;
  setShowConfirmDialog: (show: boolean) => void;
  safeClose: (isDirty: boolean, onClose: () => void) => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  ConfirmDialog: () => ReactNode;
}

export function useDialogUnsavedChanges(): UseDialogUnsavedChangesReturn {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingClose, setPendingClose] = useState<(() => void) | null>(null);

  const safeClose = useCallback((isDirty: boolean, onClose: () => void) => {
    if (isDirty) {
      setPendingClose(() => onClose);
      setShowConfirmDialog(true);
    } else {
      onClose();
    }
  }, []);

  const confirmDiscard = useCallback(() => {
    setShowConfirmDialog(false);
    if (pendingClose) {
      pendingClose();
      setPendingClose(null);
    }
  }, [pendingClose]);

  const cancelDiscard = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingClose(null);
  }, []);

  const ConfirmDialog = useCallback(() => (
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to close? Your changes will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelDiscard} data-testid="button-cancel-discard">
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction onClick={confirmDiscard} data-testid="button-confirm-discard">
            Discard changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ), [showConfirmDialog, cancelDiscard, confirmDiscard]);

  return {
    showConfirmDialog,
    setShowConfirmDialog,
    safeClose,
    confirmDiscard,
    cancelDiscard,
    ConfirmDialog,
  };
}
