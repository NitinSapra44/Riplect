import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GalleryImage {
  url: string;
  alt: string;
}

interface ImageGalleryModalProps {
  images: GalleryImage[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export function ImageGalleryModal({ images, initialIndex, isOpen, onClose }: ImageGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        goToNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex]);

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (!isOpen || images.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      {/* Close button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 text-white hover:bg-white hover:bg-opacity-20"
      >
        <X className="w-6 h-6" />
      </Button>

      {/* Previous button */}
      {images.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10 text-white hover:bg-white hover:bg-opacity-20"
        >
          <ChevronLeft className="w-8 h-8" />
        </Button>
      )}

      {/* Next button */}
      {images.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={goToNext}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10 text-white hover:bg-white hover:bg-opacity-20"
        >
          <ChevronRight className="w-8 h-8" />
        </Button>
      )}

      {/* Main image */}
      <div className="max-w-7xl max-h-full mx-4 flex flex-col items-center">
        <img
          src={images[currentIndex].url}
          alt={images[currentIndex].alt}
          className="max-w-full max-h-[80vh] object-contain"
        />
        
        {/* Image counter and caption */}
        <div className="mt-4 text-center">
          <p className="text-white text-sm opacity-80">
            {currentIndex + 1} of {images.length}
          </p>
          {images[currentIndex].alt && (
            <p className="text-white text-lg mt-2 max-w-2xl">
              {images[currentIndex].alt}
            </p>
          )}
        </div>
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 overflow-x-auto max-w-full px-4">
          {images.map((image, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                index === currentIndex
                  ? "border-white scale-110"
                  : "border-transparent opacity-60 hover:opacity-80"
              }`}
            >
              <img
                src={image.url}
                alt={image.alt}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Background overlay */}
      <div 
        className="absolute inset-0 -z-10" 
        onClick={onClose}
        aria-label="Close modal"
      />
    </div>
  );
}