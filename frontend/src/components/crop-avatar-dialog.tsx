import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface CropAvatarDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas is empty"));
        }
      },
      "image/png",
      1
    );
  });
}

export function CropAvatarDialog({
  open,
  onClose,
  imageSrc,
  onCropComplete,
}: CropAvatarDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Aspect ratio 4:5 (0.8) - Wider than 3:4
  const ASPECT_RATIO = 4 / 5;

  const onCropChange = useCallback((location: Point) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropAreaComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedBlob);
    } catch (error) {
      console.error("Error cropping image:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, onCropComplete]);

  const handleClose = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Adjust Your Profile Picture</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="relative w-full h-[60vh] bg-gray-900 rounded-lg overflow-hidden"
            data-testid="crop-area"
          >
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={ASPECT_RATIO}
              showGrid={true}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropAreaComplete}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Zoom</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 px-2"
                data-testid="button-reset-crop"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-gray-400" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(values) => setZoom(values[0])}
                className="flex-1"
                data-testid="slider-zoom"
              />
              <ZoomIn className="w-4 h-4 text-gray-400" />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <div className="text-sm text-gray-500">Preview:</div>
            {/* 4:5 Preview */}
            <div className="h-20 w-[64px] rounded-md border-2 border-gray-200 overflow-hidden bg-gray-100">
              <div
                className="w-full h-full"
                style={{
                  backgroundImage: `url(${imageSrc})`,
                  backgroundSize: `${zoom * 100}%`,
                  backgroundPosition: `${50 - crop.x / 2}% ${50 - crop.y / 2}%`,
                }}
                data-testid="preview-cropped-image"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            data-testid="button-cancel-crop"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !croppedAreaPixels}
            data-testid="button-save-crop"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}