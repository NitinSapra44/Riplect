import { useState } from "react";
import type { DigitalProduct } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { DigitalProductPaymentModal } from "./digital-product-payment-modal";
import { FreeProductDownloadModal } from "./free-product-download-modal";
import { formatPrice } from "@shared/currencies";
import { Download, FileText, Video, Image, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRODUCT_TYPES = {
  pdf: { label: "PDF", icon: FileText, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  video: { label: "Video", icon: Video, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  image: { label: "Image", icon: Image, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
} as const;

const getProductTypeConfig = (type: string | undefined) => {
  if (type && type in PRODUCT_TYPES) {
    return PRODUCT_TYPES[type as keyof typeof PRODUCT_TYPES];
  }
  return { label: "Digital", icon: Package, color: "bg-muted text-muted-foreground" };
};

interface ProductsSectionProps {
  products: DigitalProduct[];
  username?: string;
  /** Brief-mode arrangement ("grid" | "list" | "showcase"). Omitted = classic list. */
  variant?: string;
}

export function ProductsSection({ products, username, variant }: ProductsSectionProps) {
  const [location] = useLocation();
  const [selectedProduct, setSelectedProduct] = useState<DigitalProduct | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isFreeDownloadModalOpen, setIsFreeDownloadModalOpen] = useState(false);
  const { toast } = useToast();

  // Extract username from current path if not provided
  const currentUsername = username || location.split("/")[1];

  const handleProductClick = (product: DigitalProduct) => {
    setSelectedProduct(product);
    if ((product as any).isFree) {
      setIsFreeDownloadModalOpen(true);
    } else {
      setIsPaymentModalOpen(true);
    }
  };

  const triggerFileDownload = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSuccess = (downloadUrl: string) => {
    if (downloadUrl) triggerFileDownload(downloadUrl);
  };

  const handlePurchaseSuccess = (downloadUrl: string) => {
    toast({
      title: "Purchase Complete!",
      description: "Your download will begin shortly. Check your email for receipt and download instructions.",
    });
    if (downloadUrl) triggerFileDownload(downloadUrl);
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No digital products are currently available.</p>
        <p className="text-sm text-muted-foreground">Check back later for new resources and guides.</p>
      </div>
    );
  }

  /** The single product card, shared by classic + every brief arrangement. */
  const ProductCard = ({ product, big = false }: { product: DigitalProduct; big?: boolean }) => {
    const typeConfig = getProductTypeConfig((product as any).productType);
    const TypeIcon = typeConfig.icon;
    return (
      <Card
        className="border border-border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer bg-card"
        data-testid={`product-card-${product.id}`}
      >
        <Link href={`/${currentUsername}/product/${product.id}`}>
          {product.imageUrl && (
            <div className={`w-full ${big ? "h-64" : "h-48"} bg-muted overflow-hidden`}>
              <img
                src={product.imageUrl}
                alt={product.title}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </div>
          )}
          <CardContent className="p-4">
            <Badge variant="secondary" className={`${typeConfig.color} mb-2 text-xs`}>
              <TypeIcon className="w-3 h-3 mr-1" />
              {typeConfig.label}
            </Badge>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1 min-w-0">
                <h4
                  className={`${big ? "text-xl" : "text-lg"} font-semibold text-foreground mb-1 hover:text-primary transition-colors`}
                  data-testid={`product-title-${product.id}`}
                >
                  {product.title}
                </h4>
                {(product as any).thumbnailDescription && (
                  <p className="text-muted-foreground text-sm mb-1">
                    {(product as any).thumbnailDescription.substring(0, 100)}
                    {(product as any).thumbnailDescription.length > 100 && "..."}
                  </p>
                )}
              </div>
              <div className="mt-2 sm:mt-0 sm:ml-4 flex flex-col items-end">
                <span className="text-xl font-bold text-primary">
                  {(product as any).isFree ? "Free" : formatPrice(product.price, (product as any).currency || "USD")}
                </span>
              </div>
            </div>
          </CardContent>
        </Link>
        <div className="px-4 pb-4">
          <Button
            className="w-full"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleProductClick(product);
            }}
            data-testid={`button-buy-now-${product.id}`}
          >
            {(product as any).isFree ? (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Free
              </>
            ) : (
              "Buy Now"
            )}
          </Button>
        </div>
      </Card>
    );
  };

  const modals = (
    <>
      <DigitalProductPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onPurchaseSuccess={handlePurchaseSuccess}
        product={selectedProduct}
      />
      <FreeProductDownloadModal
        isOpen={isFreeDownloadModalOpen}
        onClose={() => setIsFreeDownloadModalOpen(false)}
        onDownloadSuccess={handleDownloadSuccess}
        product={selectedProduct}
      />
    </>
  );

  // ---- Brief-mode arrangements -----------------------------------------
  if (variant === "grid") {
    return (
      <div>
        <div className="grid gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        {modals}
      </div>
    );
  }

  if (variant === "showcase") {
    const [first, ...rest] = products;
    return (
      <div className="space-y-4">
        <ProductCard product={first} big />
        {rest.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {rest.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
        {modals}
      </div>
    );
  }

  // classic + brief "list": stacked cards
  return (
    <div className="space-y-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
      {modals}
    </div>
  );
}
