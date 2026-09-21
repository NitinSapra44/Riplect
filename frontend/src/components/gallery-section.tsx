import { useState } from "react";
import { ImageGalleryModal } from "./image-gallery-modal";

interface GalleryImage {
  url: string;
  alt: string;
}

interface GallerySectionProps {
  images: GalleryImage[];
  /** Brief-mode arrangement ("grid" | "masonry" | "strip"). Omitted = classic grid. */
  variant?: string;
}

export function GallerySection({ images, variant }: GallerySectionProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedImageIndex(null);
  };

  if (images.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No gallery images available.</p>
        <p className="text-sm text-muted-foreground">Check back later for new photos and updates.</p>
      </div>
    );
  }

  const tile = (image: GalleryImage, index: number, extra = "aspect-square") => (
    <div
      key={index}
      className={`${extra} bg-muted rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity`}
      onClick={() => handleImageClick(index)}
    >
      <img
        src={image.url}
        alt={image.alt}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </div>
  );

  const modal = selectedImageIndex !== null && (
    <ImageGalleryModal
      images={images}
      initialIndex={selectedImageIndex}
      isOpen={isModalOpen}
      onClose={handleCloseModal}
    />
  );

  // ---- Brief-mode arrangements -----------------------------------------
  if (variant === "masonry") {
    return (
      <>
        <div className="columns-2 gap-4 md:columns-3 [&>*]:mb-4">
          {images.map((image, index) => (
            <div key={index} className="break-inside-avoid">
              {tile(image, index, "")}
            </div>
          ))}
        </div>
        {modal}
      </>
    );
  }

  if (variant === "strip") {
    return (
      <>
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          {images.map((image, index) => (
            <div key={index} className="w-64 shrink-0 snap-start">
              {tile(image, index, "aspect-[4/5]")}
            </div>
          ))}
        </div>
        {modal}
      </>
    );
  }

  // classic "grid" (also the default brief grid)
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((image, index) => tile(image, index))}
      </div>
      {modal}
    </>
  );
}
