import type { BlogPost } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useRoute } from "wouter";

interface BlogSectionProps {
  posts: BlogPost[];
  /** Brief-mode arrangement ("cards" | "list" | "feature"). Omitted = classic cards. */
  variant?: string;
}

function formatDate(d: BlogPost["createdAt"]) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function Meta({ post }: { post: BlogPost }) {
  return (
    <div className="flex items-center text-sm text-muted-foreground mb-2">
      <span>{formatDate(post.createdAt)}</span>
      {post.readTime && (
        <>
          <span className="mx-2">•</span>
          <span>{post.readTime} min read</span>
        </>
      )}
    </div>
  );
}

/** The single full blog card, shared by classic + brief "cards"/"feature". */
function BlogCard({ post, username, big = false }: { post: BlogPost; username?: string; big?: boolean }) {
  return (
    <Card className="border border-border overflow-hidden bg-card">
      <CardContent className="p-0">
        {post.imageUrl && (
          <div className={`w-full ${big ? "h-72" : "h-48"} bg-muted overflow-hidden`}>
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        )}
        <div className="p-4">
          <Meta post={post} />
          <h4 className={`${big ? "text-2xl" : "text-lg"} font-semibold text-foreground mb-2`}>
            {post.title}
          </h4>
          {(post.thumbnailDescription || post.excerpt) && (
            <p className="text-muted-foreground text-sm mb-4 line-clamp-3">
              {post.thumbnailDescription || post.excerpt}
            </p>
          )}
          <Link
            href={`/${username}/blog/${post.slug}`}
            className="text-primary hover:text-primary/80 text-sm font-medium cursor-pointer"
          >
            Read More →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact row, used by brief "list" + the tail of "feature". */
function BlogRow({ post, username }: { post: BlogPost; username?: string }) {
  return (
    <Link href={`/${username}/blog/${post.slug}`} className="group block">
      <div className="flex gap-4 rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-md">
        {post.imageUrl && (
          <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
            <img src={post.imageUrl} alt={post.title} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="min-w-0">
          <Meta post={post} />
          <h4 className="truncate text-base font-semibold text-foreground group-hover:text-primary">
            {post.title}
          </h4>
          {(post.thumbnailDescription || post.excerpt) && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {post.thumbnailDescription || post.excerpt}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function BlogSection({ posts, variant }: BlogSectionProps) {
  const [, params] = useRoute("/:username");
  const username = params?.username;

  if (posts.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">No blog posts are currently available.</p>
        <p className="text-sm text-muted-foreground">Check back later for new insights and tips.</p>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="space-y-3">
        {posts.map((post) => (
          <BlogRow key={post.id} post={post} username={username} />
        ))}
      </div>
    );
  }

  if (variant === "feature") {
    const [first, ...rest] = posts;
    return (
      <div className="space-y-4">
        <BlogCard post={first} username={username} big />
        {rest.length > 0 && (
          <div className="space-y-3">
            {rest.map((post) => (
              <BlogRow key={post.id} post={post} username={username} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // classic + brief "cards": stacked full cards
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <BlogCard key={post.id} post={post} username={username} />
      ))}
    </div>
  );
}
