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

const ASPECT_RATIO = 16 / 9;
const MAX_OUTPUT_WIDTH = 1280;
const MAX_OUTPUT_HEIGHT = 720;

interface CropImageDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  title?: string;
  fileName: string;
  onCropComplete: (croppedBlob: Blob, fileName: string) => void;
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  if (!imageSrc.startsWith("data:")) image.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = imageSrc;
  });

  let outputW = pixelCrop.width;
  let outputH = pixelCrop.height;
  if (outputW > MAX_OUTPUT_WIDTH) {
    const scale = MAX_OUTPUT_WIDTH / outputW;
    outputW = MAX_OUTPUT_WIDTH;
    outputH = Math.round(outputH * scale);
  }
  if (outputH > MAX_OUTPUT_HEIGHT) {
    const scale = MAX_OUTPUT_HEIGHT / outputH;
    outputH = MAX_OUTPUT_HEIGHT;
    outputW = Math.round(outputW * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputW,
    outputH
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas is empty"));
      },
      "image/jpeg",
      0.92
    );
  });
}

export function CropImageDialog({
  open,
  onClose,
  imageSrc,
  title = "Crop your image",
  fileName,
  onCropComplete,
}: CropImageDialogProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((location: Point) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropAreaComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedBlob, fileName);
    } catch (error) {
      console.error("Error cropping image:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, fileName, onCropComplete]);

  const handleClose = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[90dvh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="relative w-full bg-gray-900 rounded-lg overflow-hidden"
            style={{ height: "clamp(240px, 45dvh, 400px)" }}
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
              <ZoomOut className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.05}
                onValueChange={(values) => setZoom(values[0])}
                className="flex-1"
                data-testid="slider-zoom"
              />
              <ZoomIn className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Processing…
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
