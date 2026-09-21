import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Download, Gift, Loader2, Mail, User } from "lucide-react";
import type { DigitalProduct } from "@shared/schema";

interface FreeProductDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownloadSuccess: (downloadUrl: string) => void;
  product: DigitalProduct | null;
}

interface DownloadFormData {
  fullName: string;
  email: string;
}

export function FreeProductDownloadModal({ 
  isOpen, 
  onClose, 
  onDownloadSuccess, 
  product 
}: FreeProductDownloadModalProps) {
  const [formData, setFormData] = useState<DownloadFormData>({
    fullName: "",
    email: ""
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  if (!product) return null;

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.fullName.trim() || !formData.email.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your full name and email address.",
        variant: "destructive",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Record the free download with user info
      const response = await apiRequest("POST", `/api/products/${product.id}/free-download`, {
        fullName: formData.fullName,
        email: formData.email,
      });

      const result = await response.json();

      if (result.success && result.downloadToken) {
        toast({
          title: "Download Ready!",
          description: "Your free download will begin shortly.",
        });

        const fileResponse = await fetch(`/api/products/${product.id}/free-download-file?token=${encodeURIComponent(result.downloadToken)}`);
        if (!fileResponse.ok) {
          throw new Error("Failed to download file");
        }

        const contentDisposition = fileResponse.headers.get('content-disposition');
        let fileName = product.title || 'download';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
          if (match) fileName = decodeURIComponent(match[1]);
        }

        const blob = await fileResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        onDownloadSuccess('');
        onClose();
        
        setFormData({ fullName: "", email: "" });
      } else {
        throw new Error(result.message || "Failed to process download");
      }
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Failed",
        description: "There was an error processing your request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Gift className="w-5 h-5" />
            Get Free Download
          </DialogTitle>
          <DialogDescription>
            Enter your details to download this free product.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Product Summary */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <h3 className="font-semibold mb-3">Product Details</h3>
            {product.imageUrl && (
              <img 
                src={product.imageUrl} 
                alt={product.title}
                className="w-full h-32 object-cover rounded-md mb-3"
              />
            )}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium">{product.title}</span>
              </div>
              {product.thumbnailDescription && (
                <p className="text-muted-foreground text-xs">{product.thumbnailDescription}</p>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>Price:</span>
                <span className="text-green-600">Free</span>
              </div>
            </div>
          </div>

          {/* Download Form */}
          <form onSubmit={handleDownload} className="space-y-4">
            <div>
              <Label htmlFor="free-download-name" className="flex items-center gap-1.5 mb-1.5">
                <User className="w-3.5 h-3.5" />
                Full Name
              </Label>
              <Input
                id="free-download-name"
                data-testid="input-free-download-name"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="free-download-email" className="flex items-center gap-1.5 mb-1.5">
                <Mail className="w-3.5 h-3.5" />
                Email Address
              </Label>
              <Input
                id="free-download-email"
                data-testid="input-free-download-email"
                type="email"
                placeholder="Enter your email address"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isProcessing}
              data-testid="button-submit-free-download"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download Free
                </>
              )}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            By downloading, you agree to receive updates about similar products. 
            You can unsubscribe at any time.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
