import { Loader2 } from "lucide-react";

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen" data-testid="page-loading">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
