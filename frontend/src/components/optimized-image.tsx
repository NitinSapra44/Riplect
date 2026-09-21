import { useState } from "react";
import { cn } from "@/lib/utils";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  fallback?: string;
  "data-testid"?: string;
}

export function OptimizedImage({
  src,
  alt,
  className,
  width,
  height,
  priority = false,
  fallback = "",
  "data-testid": testId,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    if (fallback) {
      setIsLoaded(true);
    }
  };

  const imageSrc = hasError && fallback ? fallback : src;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        !isLoaded && "bg-muted animate-pulse",
        className
      )}
      style={{ width, height }}
    >
      <img
        src={imageSrc}
        alt={alt}
        width={width}
        height={height}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={handleLoad}
        onError={handleError}
        data-testid={testId}
      />
    </div>
  );
}

interface ResponsiveImageProps extends OptimizedImageProps {
  aspectRatio?: string;
  sizes?: string;
}

export function ResponsiveImage({
  src,
  alt,
  className,
  aspectRatio = "1/1",
  priority = false,
  fallback = "",
  sizes = "(max-width: 768px) 100vw, 50vw",
  "data-testid": testId,
}: ResponsiveImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    if (fallback) {
      setIsLoaded(true);
    }
  };

  const imageSrc = hasError && fallback ? fallback : src;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        !isLoaded && "bg-muted animate-pulse",
        className
      )}
      style={{ aspectRatio }}
    >
      <img
        src={imageSrc}
        alt={alt}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        sizes={sizes}
        onLoad={handleLoad}
        onError={handleError}
        data-testid={testId}
      />
    </div>
  );
}

export function AvatarImage({
  src,
  alt,
  className,
  size = 48,
  fallback = "",
  "data-testid": testId,
}: {
  src: string;
  alt: string;
  className?: string;
  size?: number;
  fallback?: string;
  "data-testid"?: string;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
  };

  const imageSrc = hasError && fallback ? fallback : src;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-full",
        !isLoaded && "bg-muted animate-pulse",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={imageSrc}
        alt={alt}
        width={size}
        height={size}
        className={cn(
          "w-full h-full object-cover rounded-full transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        data-testid={testId}
      />
    </div>
  );
}
