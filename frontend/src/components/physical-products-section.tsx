import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Package, Truck, Star } from "lucide-react";
import { formatPrice } from "@shared/currencies";

interface PhysicalProduct {
  id: number;
  title: string;
  description: string;
  price: string;
  currency?: string;
  imageUrl: string;
  images?: Array<{
    url: string;
    alt: string;
  }>;
  category: string;
  stockQuantity: number;
  sku: string;
  weight: string;
  dimensions: string;
  shippingInfo: string;
  variants?: Array<{
    name: string;
    options: string[];
    price?: string;
  }>;
  isActive: boolean;
}

interface PhysicalProductsSectionProps {
  products: PhysicalProduct[];
  /** Brief-mode arrangement ("grid" | "list"). Omitted = classic grid. */
  variant?: string;
}

function ProductCard({ product }: { product: PhysicalProduct }) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow bg-card">
      <div className="aspect-square overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
        />
      </div>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {product.category}
          </Badge>
          <div className="flex items-center text-sm text-muted-foreground">
            <Package className="w-4 h-4 mr-1" />
            {product.stockQuantity} in stock
          </div>
        </div>
        <CardTitle className="text-lg line-clamp-2">{product.title}</CardTitle>
        <CardDescription className="line-clamp-3 text-sm">{product.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-primary">
              {formatPrice(product.price, product.currency || "USD")}
            </span>
            <div className="flex items-center text-amber-500">
              {Array.from({ length: 5 }, (_, i) => (
                <Star key={i} className="w-4 h-4 fill-current" />
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center">
              <Package className="w-4 h-4 mr-2" />
              <span>SKU: {product.sku}</span>
            </div>
            <div className="flex items-center">
              <Truck className="w-4 h-4 mr-2" />
              <span>
                {product.weight} • {product.dimensions}
              </span>
            </div>
          </div>

          {product.variants && product.variants.length > 0 && (
            <div className="space-y-2">
              {product.variants.map((pv, index) => (
                <div key={index} className="text-sm">
                  <span className="font-medium text-foreground">{pv.name}: </span>
                  <span className="text-muted-foreground">
                    {pv.options.slice(0, 2).join(", ")}
                    {pv.options.length > 2 && ` +${pv.options.length - 2} more`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <div className="w-full space-y-3">
          <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Add to Cart
          </Button>
          <div className="text-xs text-muted-foreground text-center">{product.shippingInfo}</div>
        </div>
      </CardFooter>
    </Card>
  );
}

function ProductRow({ product }: { product: PhysicalProduct }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
        <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="min-w-0 flex-1">
        <Badge variant="secondary" className="mb-1 text-[10px]">
          {product.category}
        </Badge>
        <h4 className="truncate font-semibold text-foreground">{product.title}</h4>
        <p className="line-clamp-1 text-sm text-muted-foreground">{product.description}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-bold text-primary">{formatPrice(product.price, product.currency || "USD")}</span>
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <ShoppingCart className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}

export function PhysicalProductsSection({ products, variant }: PhysicalProductsSectionProps) {
  if (products.length === 0) {
    return (
      <div className="text-center py-8">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No physical products available at the moment.</p>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="space-y-3">
        {products.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </div>
    );
  }

  // classic + brief "grid"
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
