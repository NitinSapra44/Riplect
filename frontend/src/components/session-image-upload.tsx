import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { waitForSupabase } from "@/lib/supabase";
import { convertIfHeic } from "@/lib/heicConvert";

interface SessionImage {
  url: string;
  alt: string;
}

interface SessionImageUploadProps {
  sessionId: number;
  images: SessionImage[];
  onImagesUpdate: (images: SessionImage[]) => void;
}

export function SessionImageUpload({ sessionId, images, onImagesUpdate }: SessionImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (rawFile: File) => {
    if (!rawFile) return;

    // Convert HEIC/HEIF to JPEG before any further processing
    const file = await convertIfHeic(rawFile);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPG, PNG, or WebP image.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (25MB)
    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 25MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Get auth token
      const supabase = await waitForSupabase();
      let authHeaders: Record<string, string> = {};
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          authHeaders = { Authorization: `Bearer ${session.access_token}` };
        }
      }

      // Upload file to Supabase storage via backend
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'session-images');
      
      const uploadResponse = await fetch("/api/upload/image", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      
      if (!uploadResponse.ok) throw new Error("Failed to upload image");
      
      const { url } = await uploadResponse.json();

      // Add image to session via backend
      const response = await fetch(`/api/dashboard/sessions/${sessionId}/images`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          imageURL: url,
          altText: file.name.replace(/\.[^/.]+$/, ""),
        }),
      });

      if (!response.ok) throw new Error("Failed to add image to session");

      const updatedSession = await response.json();
      onImagesUpdate(updatedSession.images || []);

      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteImage = async (imageIndex: number) => {
    try {
      const response = await fetch(`/api/dashboard/sessions/${sessionId}/images/${imageIndex}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete image");

      const updatedSession = await response.json();
      onImagesUpdate(updatedSession.images || []);

      toast({
        title: "Success",
        description: "Image removed successfully",
      });
    } catch (error) {
      console.error("Error deleting image:", error);
      toast({
        title: "Delete failed",
        description: "Failed to remove image. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Session Images
        </label>
      </div>

      {/* Upload Area */}
      <Card
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          dragActive
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
      >
        <CardContent className="p-6">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              {isUploading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              ) : (
                <ImageIcon className="w-6 h-6 text-gray-400" />
              )}
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900">
                {isUploading ? 'Uploading...' : 'Upload session images'}
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
              size="sm"
              className="mt-3"
              disabled={isUploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose File
            </Button>
          </div>
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={handleFileInput}
        className="hidden"
        data-testid="input-session-images"
      />

      {/* Display Uploaded Images */}
      {images.length > 0 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Uploaded Images ({images.length})
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {images.map((image, index) => (
              <Card key={index} className="relative group overflow-hidden" data-testid={`session-image-${index}`}>
                <CardContent className="p-2">
                  <img
                    src={image.url}
                    alt={image.alt || `Session image ${index + 1}`}
                    className="w-full h-32 object-cover rounded"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteImage(index)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-delete-image-${index}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
