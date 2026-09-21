import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Plus, Search, Tag as TagIcon, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export interface Tag {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  usageCount: number | null;
  createdBy: string | null;
  isApproved: boolean | null;
  createdAt: string | null;
}

interface TagManagerProps {
  entityType: "session" | "event" | "digital-product" | "physical-product" | "blog" | "profile";
  entityId?: number | string;
  selectedTags?: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
  maxTags?: number;
  allowCreate?: boolean;
  showSuggestions?: boolean;
  variant?: "inline" | "compact";
  className?: string;
  disabled?: boolean;
}

export function TagManager({
  entityType,
  entityId,
  selectedTags: externalSelectedTags,
  onTagsChange,
  maxTags = 10,
  allowCreate = true,
  showSuggestions = true,
  variant = "inline",
  className,
  disabled = false,
}: TagManagerProps) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [internalTags, setInternalTags] = useState<Tag[]>([]);

  const selectedTags = externalSelectedTags ?? internalTags;
  const setSelectedTags = onTagsChange ?? setInternalTags;

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags/search", searchValue],
    queryFn: async () => {
      const response = await fetch(`/api/tags/search?q=${encodeURIComponent(searchValue)}&limit=10`);
      if (!response.ok) throw new Error("Failed to search tags");
      return response.json();
    },
    enabled: showSuggestions,
    staleTime: 30000,
  });

  const { data: popularTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags/popular"],
    queryFn: async () => {
      const response = await fetch("/api/tags/popular?limit=10");
      if (!response.ok) throw new Error("Failed to fetch popular tags");
      return response.json();
    },
    enabled: showSuggestions && !searchValue,
    staleTime: 60000,
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/tags", { name });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    },
  });

  const handleSelectTag = useCallback((tag: Tag) => {
    if (selectedTags.find(t => t.id === tag.id)) {
      return;
    }
    if (selectedTags.length >= maxTags) {
      return;
    }
    const newTags = [...selectedTags, tag];
    setSelectedTags(newTags);
    setSearchValue("");
    setOpen(false);
  }, [selectedTags, maxTags, setSelectedTags]);

  const handleRemoveTag = useCallback((tagId: number) => {
    const newTags = selectedTags.filter(t => t.id !== tagId);
    setSelectedTags(newTags);
  }, [selectedTags, setSelectedTags]);

  const handleCreateTag = useCallback(async () => {
    if (!searchValue.trim() || !allowCreate) return;
    
    try {
      const newTag = await createTagMutation.mutateAsync(searchValue.trim());
      handleSelectTag(newTag);
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  }, [searchValue, allowCreate, createTagMutation, handleSelectTag]);

  const filteredSuggestions = suggestions.filter(
    tag => !selectedTags.find(t => t.id === tag.id)
  );

  const displayedSuggestions = searchValue ? filteredSuggestions : 
    popularTags.filter(tag => !selectedTags.find(t => t.id === tag.id));

  const showCreateOption = 
    allowCreate && 
    searchValue.trim() && 
    !suggestions.find(t => t.name.toLowerCase() === searchValue.toLowerCase().trim());

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-wrap gap-2", className)}>
        {selectedTags.map((tag) => (
          <Badge
            key={tag.id}
            variant="outline"
            className="gap-1 pr-1 bg-white text-primary border-primary"
            data-testid={`tag-badge-${tag.id}`}
          >
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemoveTag(tag.id)}
                className="ml-1 rounded-full p-0.5 hover:bg-primary/20 transition-colors text-primary"
                data-testid={`button-remove-tag-${tag.id}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        ))}
        {!disabled && selectedTags.length < maxTags && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                data-testid="button-add-tag"
              >
                <Plus className="w-3 h-3" />
                Add Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search or create tags..."
                  value={searchValue}
                  onValueChange={setSearchValue}
                  data-testid="input-tag-search"
                />
                <CommandList>
                  {suggestionsLoading && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!suggestionsLoading && displayedSuggestions.length === 0 && !showCreateOption && (
                    <CommandEmpty>No tags found.</CommandEmpty>
                  )}
                  {displayedSuggestions.length > 0 && (
                    <CommandGroup heading={searchValue ? "Suggestions" : "Popular Tags"}>
                      {displayedSuggestions.map((tag) => (
                        <CommandItem
                          key={tag.id}
                          value={tag.name}
                          onSelect={() => handleSelectTag(tag)}
                          className="cursor-pointer"
                          data-testid={`suggestion-tag-${tag.id}`}
                        >
                          <TagIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                          {tag.name}
                          {tag.usageCount !== null && tag.usageCount > 0 && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {tag.usageCount}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {showCreateOption && (
                    <CommandGroup heading="Create New">
                      <CommandItem
                        value={`create-${searchValue}`}
                        onSelect={handleCreateTag}
                        className="cursor-pointer"
                        data-testid="button-create-new-tag"
                      >
                        <Plus className="w-4 h-4 mr-2 text-primary" />
                        Create "{searchValue.trim()}"
                      </CommandItem>
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="selected-tags-container">
          {selectedTags.map((tag) => (
            <Badge
              key={tag.id}
              variant="outline"
              className="gap-1 pr-1 bg-white text-primary border-primary"
              data-testid={`tag-badge-${tag.id}`}
            >
              {tag.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag.id)}
                  className="ml-1 rounded-full p-0.5 hover:bg-primary/20 transition-colors text-primary"
                  data-testid={`button-remove-tag-${tag.id}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!disabled && selectedTags.length < maxTags && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-muted-foreground"
              data-testid="button-add-tag"
            >
              <Search className="w-4 h-4" />
              {selectedTags.length === 0 ? "Add tags to help users find your content..." : "Add more tags..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[350px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search or create tags..."
                value={searchValue}
                onValueChange={setSearchValue}
                data-testid="input-tag-search"
              />
              <CommandList>
                {suggestionsLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!suggestionsLoading && displayedSuggestions.length === 0 && !showCreateOption && (
                  <CommandEmpty>No tags found. Type to create a new one.</CommandEmpty>
                )}
                {displayedSuggestions.length > 0 && (
                  <CommandGroup heading={searchValue ? "Suggestions" : "Popular Tags"}>
                    {displayedSuggestions.map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        onSelect={() => handleSelectTag(tag)}
                        className="cursor-pointer"
                        data-testid={`suggestion-tag-${tag.id}`}
                      >
                        <TagIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                        {tag.name}
                        {tag.usageCount !== null && tag.usageCount > 0 && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {tag.usageCount} uses
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {showCreateOption && (
                  <CommandGroup heading="Create New">
                    <CommandItem
                      value={`create-${searchValue}`}
                      onSelect={handleCreateTag}
                      className="cursor-pointer"
                      data-testid="button-create-new-tag"
                    >
                      <Plus className="w-4 h-4 mr-2 text-primary" />
                      Create "{searchValue.trim()}"
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {selectedTags.length >= maxTags && (
        <p className="text-xs text-muted-foreground">
          Maximum tags reached. Remove some to add more.
        </p>
      )}
    </div>
  );
}

export function TagDisplay({ tags, className }: { tags: Tag[]; className?: string }) {
  if (tags.length === 0) return null;
  
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.slice(0, 3).map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="text-xs"
          data-testid={`display-tag-${tag.id}`}
        >
          {tag.name}
        </Badge>
      ))}
      {tags.length > 3 && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          +{tags.length - 3} more
        </Badge>
      )}
    </div>
  );
}

export function TagFilter({
  selectedTagIds,
  onTagsChange,
  className,
}: {
  selectedTagIds: number[];
  onTagsChange: (tagIds: number[]) => void;
  className?: string;
}) {
  const { data: popularTags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/tags/popular"],
    queryFn: async () => {
      const response = await fetch("/api/tags/popular?limit=15");
      if (!response.ok) throw new Error("Failed to fetch popular tags");
      return response.json();
    },
    staleTime: 60000,
  });

  const toggleTag = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  if (popularTags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {popularTags.map((tag) => (
        <Badge
          key={tag.id}
          variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
          className="cursor-pointer transition-colors"
          onClick={() => toggleTag(tag.id)}
          data-testid={`filter-tag-${tag.id}`}
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
