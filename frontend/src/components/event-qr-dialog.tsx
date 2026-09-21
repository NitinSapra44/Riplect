import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Link as LinkIcon, Share2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { buildEventUrl, generateEventQrDataUrl, downloadQrImage } from "@/lib/event-qr";

interface EventQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: number;
  eventTitle: string;
  username: string;
  uploadedQrUrl?: string | null;
}

export function EventQrDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  username,
  uploadedQrUrl,
}: EventQrDialogProps) {
  const { toast } = useToast();
  const [generatedQr, setGeneratedQr] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const eventUrl = username && eventId ? buildEventUrl(username, eventId) : "";

  useEffect(() => {
    if (!open || uploadedQrUrl || !eventUrl) return;
    let active = true;
    setGeneratedQr(null);
    generateEventQrDataUrl(eventUrl)
      .then((dataUrl) => {
        if (active) setGeneratedQr(dataUrl);
      })
      .catch(() => {
        if (active) setGeneratedQr(null);
      });
    return () => {
      active = false;
    };
  }, [open, uploadedQrUrl, eventUrl]);

  const displayQr = uploadedQrUrl || generatedQr;

  const handleDownload = async () => {
    if (!displayQr) return;
    setIsDownloading(true);
    try {
      await downloadQrImage(displayQr, eventTitle);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!eventUrl) return;
    try {
      await navigator.clipboard.writeText(eventUrl);
      toast({ description: "Event link copied to clipboard" });
    } catch {
      toast({ description: "Could not copy link", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!eventUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: eventTitle,
          text: eventTitle,
          url: eventUrl,
        });
      } catch (err) {
        // Ignore the user pressing Cancel; for any real failure, fall back to copy
        if ((err as DOMException)?.name !== "AbortError") {
          await handleCopyLink();
        }
      }
    } else {
      await handleCopyLink();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="dialog-event-qr">
        <DialogHeader>
          <DialogTitle>Event QR code</DialogTitle>
          <DialogDescription className="line-clamp-2">{eventTitle}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            {displayQr ? (
              <img
                src={displayQr}
                alt={`QR code for ${eventTitle}`}
                className="w-64 h-64 object-contain"
                data-testid="img-event-qr-dialog"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </div>
          {eventUrl && (
            <p className="text-xs text-gray-500 break-all text-center px-2" data-testid="text-event-qr-url">
              {eventUrl}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleDownload}
            disabled={!displayQr || isDownloading}
            data-testid="button-qr-download"
          >
            <Download className="h-4 w-4 mr-2" />
            {isDownloading ? "Downloading…" : "Download PNG"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleCopyLink} data-testid="button-qr-copy-link">
              <LinkIcon className="h-4 w-4 mr-2" />
              Copy link
            </Button>
            <Button variant="outline" onClick={handleShare} data-testid="button-qr-share">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
