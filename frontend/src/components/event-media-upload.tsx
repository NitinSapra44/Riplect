import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Image as ImageIcon, Video, Plus, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { waitForSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { convertIfHeic } from "@/lib/heicConvert";
import { compressImage } from "@/lib/imageCompression";

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  alt?: string;
}

interface UploadingItem {
  id: string;
  file: File;
  type: 'image' | 'video';
  status: 'uploading' | 'done' | 'error';
  progress: number;
  url?: string;
  previewUrl?: string;
}

interface EventMediaUploadProps {
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  maxImages?: number;
  maxVideos?: number;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = await waitForSupabase();
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  }
  return {};
}

async function uploadFile(file: File, onProgress: (p: number) => void): Promise<string> {
  const authHeaders = await getAuthHeaders();
  const isVideo = file.type.startsWith('video/');
  const endpoint = isVideo ? '/api/upload/video' : '/api/upload/image';

  const formData = new FormData();
  formData.append('file', file);
  if (!isVideo) formData.append('folder', 'event-images');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    // Fail loudly instead of hanging forever if the transfer stalls.
    xhr.timeout = isVideo ? 5 * 60 * 1000 : 60 * 1000;
    Object.entries(authHeaders).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const { url } = JSON.parse(xhr.responseText);
        resolve(url);
      } else {
        reject(new Error('Upload failed'));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(formData);
  });
}

export function EventMediaUpload({ value, onChange, maxImages = 10, maxVideos = 3 }: EventMediaUploadProps) {
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const imageCount = value.filter(m => m.type === 'image').length;
  const videoCount = value.filter(m => m.type === 'video').length;

  const processFiles = useCallback(async (rawFiles: File[]) => {
    // Convert any HEIC/HEIF files to JPEG first
    const files: File[] = await Promise.all(rawFiles.map(f => convertIfHeic(f)));

    const validFiles: File[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isVideo) {
        toast({ title: `${file.name}: unsupported type`, variant: "destructive" });
        continue;
      }
      if (isImage && imageCount + validFiles.filter(f => f.type.startsWith('image/')).length >= maxImages) {
        toast({ title: `Max ${maxImages} images allowed`, variant: "destructive" });
        continue;
      }
      if (isVideo && videoCount + validFiles.filter(f => f.type.startsWith('video/')).length >= maxVideos) {
        toast({ title: `Max ${maxVideos} videos allowed`, variant: "destructive" });
        continue;
      }
      if (isImage && file.size > 25 * 1024 * 1024) {
        toast({ title: `${file.name}: image too large (max 25MB)`, variant: "destructive" });
        continue;
      }
      if (isVideo && file.size > 200 * 1024 * 1024) {
        toast({ title: `${file.name}: video too large (max 200MB)`, variant: "destructive" });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const newItems: UploadingItem[] = validFiles.map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      status: 'uploading' as const,
      progress: 0,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }));

    setUploading(prev => [...prev, ...newItems]);

    // Upload all files in parallel
    const uploadPromises = newItems.map(async (item) => {
      try {
        // Compress images client-side before upload. Large phone photos (10-25MB)
        // can stall mid-transfer; compressing keeps uploads fast and reliable.
        const fileToUpload = item.type === 'image' ? await compressImage(item.file) : item.file;
        const url = await uploadFile(fileToUpload, (progress) => {
          setUploading(prev => prev.map(u => u.id === item.id ? { ...u, progress } : u));
        });
        setUploading(prev => prev.map(u => u.id === item.id ? { ...u, status: 'done', url, progress: 100 } : u));
        return { item, url };
      } catch (err) {
        setUploading(prev => prev.map(u => u.id === item.id ? { ...u, status: 'error' } : u));
        const description = err instanceof Error && err.message && err.message !== 'Upload failed'
          ? err.message
          : undefined;
        toast({ title: `Failed to upload ${item.file.name}`, description, variant: "destructive" });
        return null;
      }
    });

    const results = await Promise.all(uploadPromises);

    const successfulUploads: MediaItem[] = results
      .filter((r): r is { item: UploadingItem; url: string } => r !== null)
      .map(({ item, url }) => ({
        type: item.type,
        url,
        alt: item.file.name,
      }));

    if (successfulUploads.length > 0) {
      onChange([...value, ...successfulUploads]);
    }

    // Clean up uploading state and revoke preview URLs after a short delay
    setTimeout(() => {
      newItems.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setUploading(prev => prev.filter(u => !newItems.some(n => n.id === u.id)));
    }, 1500);
  }, [value, onChange, imageCount, videoCount, maxImages, maxVideos, toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const reorderItem = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* Media Grid */}
      {(value.length > 0 || uploading.length > 0) && (
        <div className="grid grid-cols-3 gap-2">
          {value.map((item, index) => (
            <div key={index} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              {item.type === 'image' ? (
                <img src={item.url} alt={item.alt || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-white gap-1">
                  <Video className="w-8 h-8 text-gray-300" />
                  <span className="text-xs text-gray-400 px-1 text-center truncate w-full px-2">
                    {item.alt || 'Video'}
                  </span>
                </div>
              )}
              {/* Overlay controls */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {index > 0 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 text-xs"
                    onClick={() => reorderItem(index, index - 1)}
                  >
                    ←
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-7 w-7"
                  onClick={() => removeItem(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
                {index < value.length - 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7 text-xs"
                    onClick={() => reorderItem(index, index + 1)}
                  >
                    →
                  </Button>
                )}
              </div>
              {index === 0 && (
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">
                  Cover
                </div>
              )}
            </div>
          ))}

          {/* Uploading items */}
          {uploading.map((item) => (
            <div key={item.id} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="" className="w-full h-full object-cover opacity-60" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                  <Video className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
                {item.status === 'uploading' && (
                  <>
                    <Loader2 className="w-6 h-6 text-white animate-spin mb-1" />
                    <span className="text-white text-xs font-medium">{item.progress}%</span>
                    <div className="w-3/4 h-1 bg-gray-600 rounded-full mt-1">
                      <div
                        className="h-full bg-white rounded-full transition-all"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </>
                )}
                {item.status === 'done' && (
                  <div className="text-green-400 text-xs font-medium">Done!</div>
                )}
                {item.status === 'error' && (
                  <AlertCircle className="w-6 h-6 text-red-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          isDragOver ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary hover:bg-primary/5"
        )}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-3">
            <ImageIcon className="w-8 h-8 text-gray-400" />
            <Video className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Drag & drop images or videos</p>
            <p className="text-xs text-gray-500 mt-1">
              Up to {maxImages} images incl. HEIC (25MB each) · Up to {maxVideos} videos (200MB each)
            </p>
            <p className="text-xs text-gray-400">All files upload at the same time</p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageCount >= maxImages}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Images
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => videoInputRef.current?.click()}
              disabled={videoCount >= maxVideos}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Video
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            {imageCount}/{maxImages} images · {videoCount}/{maxVideos} videos
          </p>
        </div>
      </div>

      <input
        type="file"
        ref={imageInputRef}
        accept="image/*,image/heic,image/heif,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            processFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />
      <input
        type="file"
        ref={videoInputRef}
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            processFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}
