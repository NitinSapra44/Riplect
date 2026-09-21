import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CropAvatarDialog } from "./crop-avatar-dialog";
import { waitForSupabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { posthog } from "@/lib/posthog";
import { convertIfHeic } from "@/lib/heicConvert";

interface ProfilePictureUploadProps {
  currentImageUrl?: string;
  onImageUploaded: (imageUrl: string) => void;
  className?: string;
  autoSaveToDatabase?: boolean; // New prop to enable auto-save to database
}

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const TARGET_FILE_SIZE = 24 * 1024 * 1024; // 24MB target (leaving room for crop)

/**
 * Compresses an image to fit under the target file size by reducing resolution
 * Uses progressive quality and dimension reduction while maintaining aspect ratio
 */
async function compressImage(file: File, targetSize: number = TARGET_FILE_SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onerror = () => {
      reject(new Error("Failed to read the image file. Please try again."));
    };
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onerror = () => {
        reject(new Error("Failed to load the image. The file may be corrupted."));
      };
      
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        if (!ctx) {
          reject(new Error("Unable to process the image. Please try a different browser."));
          return;
        }
        
        let width = img.width;
        let height = img.height;
        let quality = 0.9;
        
        // Start with original dimensions, then progressively reduce
        const attemptCompress = (currentWidth: number, currentHeight: number, currentQuality: number): void => {
          canvas.width = currentWidth;
          canvas.height = currentHeight;
          
          // Clear canvas and draw image
          ctx.clearRect(0, 0, currentWidth, currentHeight);
          ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
          
          // Convert to blob to check size
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to compress the image. Please try a different image."));
                return;
              }
              
              if (blob.size <= targetSize) {
                // Success - convert blob to data URL
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("Failed to process compressed image."));
                reader.readAsDataURL(blob);
              } else if (currentQuality > 0.5) {
                // Try reducing quality first
                attemptCompress(currentWidth, currentHeight, currentQuality - 0.1);
              } else if (currentWidth > 800 || currentHeight > 1000) {
                // Reset quality and reduce dimensions by 20%
                const newWidth = Math.floor(currentWidth * 0.8);
                const newHeight = Math.floor(currentHeight * 0.8);
                attemptCompress(newWidth, newHeight, 0.85);
              } else {
                // Final attempt with minimum reasonable dimensions
                canvas.width = 600;
                canvas.height = Math.floor(600 * (height / width));
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(
                  (finalBlob) => {
                    if (finalBlob) {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = () => reject(new Error("Failed to process compressed image."));
                      reader.readAsDataURL(finalBlob);
                    } else {
                      reject(new Error("Could not compress image to target size."));
                    }
                  },
                  "image/jpeg",
                  0.7
                );
              }
            },
            "image/jpeg",
            currentQuality
          );
        };
        
        // Start compression attempts
        attemptCompress(width, height, quality);
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.readAsDataURL(file);
  });
}

export function ProfilePictureUpload({ 
  currentImageUrl, 
  onImageUploaded, 
  className,
  autoSaveToDatabase = true // Default to auto-save
}: ProfilePictureUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    let file = event.target.files?.[0];
    if (!file) return;

    // Convert HEIC/HEIF to JPEG before any further processing
    file = await convertIfHeic(file);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPG, PNG, GIF, or WebP)",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      let imageSrc: string;
      
      if (file.size > MAX_FILE_SIZE) {
        // Show compressing state
        setIsCompressing(true);
        toast({
          title: "Optimizing image",
          description: "Your image is being optimized for upload...",
        });
        
        try {
          imageSrc = await compressImage(file, TARGET_FILE_SIZE);
          toast({
            title: "Image optimized",
            description: "Your image has been resized for optimal quality.",
          });
        } catch (compressError) {
          console.error("Compression error:", compressError);
          toast({
            title: "Optimization failed",
            description: compressError instanceof Error ? compressError.message : "Could not optimize the image. Please try a smaller image.",
            variant: "destructive",
          });
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          return;
        } finally {
          setIsCompressing(false);
        }
      } else {
        // File is small enough, read directly
        imageSrc = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read the image file."));
          reader.readAsDataURL(file);
        });
      }
      
      setSelectedImageSrc(imageSrc);
      setCropDialogOpen(true);
    } catch (error) {
      console.error("File read error:", error);
      toast({
        title: "Error reading file",
        description: error instanceof Error ? error.message : "Could not read the selected file. Please try again.",
        variant: "destructive",
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCropComplete = useCallback(async (croppedBlob: Blob) => {
    setCropDialogOpen(false);
    setSelectedImageSrc(null);

    // Show immediate preview
    const croppedUrl = URL.createObjectURL(croppedBlob);
    setPreviewUrl(croppedUrl);

    setIsUploading(true);
    
    try {
      // Step 1: Get authentication token
      let authHeaders: Record<string, string> = {};
      try {
        const supabase = await waitForSupabase();
        if (supabase) {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.warn("Session warning:", sessionError);
          }
          if (session?.access_token) {
            authHeaders = { Authorization: `Bearer ${session.access_token}` };
          }
        }
      } catch (authError) {
        console.warn("Auth warning (continuing without auth):", authError);
      }

      // Step 2: Prepare file for upload
      const file = new File([croppedBlob], 'profile-picture.png', { type: 'image/png' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'profile-pictures');

      // Step 3: Upload to storage
      let uploadedUrl: string;
      try {
        const uploadResponse = await fetch("/api/upload/image", {
          method: "POST",
          headers: authHeaders,
          body: formData,
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Upload failed with status ${uploadResponse.status}`);
        }

        const responseData = await uploadResponse.json();
        uploadedUrl = responseData.url;
        
        if (!uploadedUrl) {
          throw new Error("No URL returned from upload");
        }
      } catch (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(
          uploadError instanceof Error 
            ? `Failed to upload image: ${uploadError.message}` 
            : "Failed to upload image to storage. Please check your connection and try again."
        );
      }

      // Step 4: Auto-save to database if enabled
      if (autoSaveToDatabase) {
        try {
          await apiRequest("PATCH", "/api/dashboard/profile", {
            profileImageUrl: uploadedUrl
          });
          
          // Invalidate profile queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/profile"] });
          queryClient.invalidateQueries({ queryKey: ["/api/profiles"], exact: false });
          
          posthog.capture('profile_photo_uploaded');
          posthog.setPersonProperties({ profile_has_photo: true });
          toast({
            title: "Profile picture saved",
            description: "Your new profile picture is now live!",
          });
        } catch (saveError) {
          console.error("Database save error:", saveError);
          // Image was uploaded but database update failed
          // Still call onImageUploaded so the form has the URL
          onImageUploaded(uploadedUrl);
          toast({
            title: "Partial success",
            description: "Image uploaded but could not save to profile. Click 'Save Profile' to complete.",
            variant: "destructive",
          });
          return;
        }
      }
      // When autoSaveToDatabase is false, silently upload without toast
      // The parent component (e.g., onboarding) will handle saving the URL

      // Step 5: Notify parent component
      onImageUploaded(uploadedUrl);
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "There was an error uploading your image. Please try again.",
        variant: "destructive",
      });
      // Clear preview on failure
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onImageUploaded, toast, autoSaveToDatabase, queryClient]);

  const handleCropDialogClose = useCallback(() => {
    setCropDialogOpen(false);
    setSelectedImageSrc(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayImage = previewUrl || currentImageUrl;
  const isProcessing = isUploading || isCompressing;

  return (
    <div className={cn("space-y-4", className)}>
      <Label className="text-sm font-medium">Profile Picture</Label>

      <div className="flex items-start space-x-6">
        <div className="relative">
          {/* Updated to aspect-[4/5] */}
          <div className="w-24 aspect-[4/5] rounded-lg border-2 border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center shadow-sm">
            {displayImage ? (
              <img
                src={displayImage}
                alt="Profile preview"
                className="w-full h-full object-cover"
                data-testid="img-profile-preview"
              />
            ) : (
              <Camera className="w-8 h-8 text-gray-400" />
            )}
            
            {/* Loading overlay */}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>

          {previewUrl && !isProcessing && (
            <button
              onClick={clearPreview}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
              data-testid="button-clear-preview"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleButtonClick}
            disabled={isProcessing}
            className="w-full max-w-xs"
            data-testid="button-choose-image"
          >
            {isCompressing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Optimizing...
              </>
            ) : isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                {currentImageUrl ? "Change Photo" : "Upload Photo"}
              </>
            )}
          </Button>

          <p className="text-xs text-gray-500 mt-2">
            Recommended: Portrait photo (4:5 ratio).
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,image/heic,image/heif,.heic,.heif"
        onChange={handleFileSelect}
        className="hidden"
        data-testid="input-file-upload"
      />

      {selectedImageSrc && (
        <CropAvatarDialog
          open={cropDialogOpen}
          onClose={handleCropDialogClose}
          imageSrc={selectedImageSrc}
          onCropComplete={handleCropComplete}
        />
      )}
    </div>
  );
}
