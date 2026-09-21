import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Image as ImageIcon, Crop } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { waitForSupabase } from "@/lib/supabase";
import { convertIfHeic } from "@/lib/heicConvert";
import { CropImageDialog } from "@/components/crop-image-dialog";

interface ImageUploadProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  cropAspect?: number;
}

export function ImageUpload({ 
  value, 
  onChange,
  placeholder = "Upload an image",
  className = "",
  cropAspect,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [pendingImageSrc, setPendingImageSrc] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string>("image.jpg");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadFile = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const supabase = await waitForSupabase();
      let authHeaders: Record<string, string> = {};
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeaders = { Authorization: `Bearer ${session.access_token}` };
        }
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'images');
      
      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      
      if (!uploadResponse.ok) throw new Error("Failed to upload image");
      
      const { url } = await uploadResponse.json();

      onChange(url);
      
      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [onChange, toast]);

  const handleFileUpload = async (rawFile: File) => {
    if (!rawFile) return;

    const file = await convertIfHeic(rawFile);

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, WebP)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 25MB",
        variant: "destructive",
      });
      return;
    }

    if (cropAspect) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPendingImageSrc(dataUrl);
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        setPendingFileName(`${baseName}.jpg`);
        setCropDialogOpen(true);
      };
      reader.readAsDataURL(file);
      return;
    }

    await uploadFile(file);
  };

  const handleCropComplete = useCallback(async (croppedBlob: Blob, fileName: string) => {
    setCropDialogOpen(false);
    setPendingImageSrc(null);
    const croppedFile = new File([croppedBlob], fileName, { type: "image/jpeg" });
    await uploadFile(croppedFile);
  }, [uploadFile]);

  const handleCropCancel = useCallback(() => {
    setCropDialogOpen(false);
    setPendingImageSrc(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleRemove = () => {
    onChange("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReCrop = useCallback(() => {
    if (!value || !cropAspect) return;
    const baseUrl = value.split("?")[0];
    const baseName = baseUrl.substring(baseUrl.lastIndexOf("/") + 1).replace(/\.[^/.]+$/, "");
    setPendingFileName(`${baseName || "image"}.jpg`);
    setPendingImageSrc(value);
    setCropDialogOpen(true);
  }, [value, cropAspect]);

  return (
    <div className={`space-y-4 ${className}`}>
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt="Preview"
            className="w-full h-48 object-cover rounded-lg border"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            {cropAspect && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleReCrop}
                data-testid="button-recrop-image"
              >
                <Crop className="w-4 h-4 mr-1" />
                Re-crop
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              data-testid="button-remove-image"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300'}
            ${isUploading ? 'opacity-50' : 'hover:border-primary hover:bg-primary/5'}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="flex flex-col items-center space-y-4">
            <ImageIcon className="w-12 h-12 text-gray-400" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">
                {placeholder}
              </p>
              <p className="text-xs text-gray-500">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-gray-400">
                JPG, PNG, WebP, HEIC up to 25MB
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="mt-4"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? "Uploading..." : "Choose File"}
            </Button>
          </div>
        </div>
      )}
      
      <Input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,image/heic,image/heif,.heic,.heif"
        className="hidden"
      />

      {cropAspect && pendingImageSrc && (
        <CropImageDialog
          open={cropDialogOpen}
          onClose={handleCropCancel}
          imageSrc={pendingImageSrc}
          title="Crop your image"
          onCropComplete={handleCropComplete}
          fileName={pendingFileName}
        />
      )}
    </div>
  );
}
