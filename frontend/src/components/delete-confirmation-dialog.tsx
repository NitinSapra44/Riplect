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

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  isPending?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Are you sure you want to delete?",
  description = "This action cannot be undone.",
  isPending = false,
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-delete-confirmation">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="text-delete-title">{title}</AlertDialogTitle>
          <AlertDialogDescription data-testid="text-delete-description">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            disabled={isPending}
            data-testid="button-cancel-delete"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete"
          >
            {isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
