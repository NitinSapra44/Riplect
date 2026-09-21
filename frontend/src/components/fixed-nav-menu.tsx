import { useState, useEffect, useRef, type ReactNode } from "react";
import { Menu, X, Share2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { generateCoachShareMessage } from "@/lib/whatsapp-share";
import { posthog } from "@/lib/posthog";

interface NavSection {
  id: string;
  label: string;
  icon: ReactNode;
}

interface FixedNavMenuProps {
  availableSections: NavSection[];
  username: string;
  displayName?: string;
  profileImageUrl?: string | null;
  width?: string;
}

export function FixedNavMenu({
  availableSections,
  username,
  displayName,
  profileImageUrl,
  width = "w-72",
}: FixedNavMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        setIsOpen(false);
        toggleRef.current?.focus();
      }

      const items =
        listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]");
      if (!items || items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const newIndex =
          focusedIndex === null ? 0 : Math.min(focusedIndex + 1, items.length - 1);
        setFocusedIndex(newIndex);
        items[newIndex].focus();
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const newIndex =
          focusedIndex === null
            ? items.length - 1
            : Math.max(focusedIndex - 1, 0);
        setFocusedIndex(newIndex);
        items[newIndex].focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, focusedIndex]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (!element) {
      setIsOpen(false);
      return;
    }

    // Close the nav menu first
    setIsOpen(false);

    // Step 1: Scroll to the section smoothly
    const offset = 84;
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    window.scrollTo({ top: offsetPosition, behavior: "smooth" });

    // Step 2: Wait for scroll to complete, then expand if closed
    // Use scroll end detection with fallback timeout
    let scrollTimeout: ReturnType<typeof setTimeout>;
    let lastScrollY = window.scrollY;
    let scrollCheckCount = 0;
    const maxChecks = 50; // ~2.5 seconds max wait

    const checkScrollEnd = () => {
      scrollCheckCount++;
      const currentScrollY = window.scrollY;
      
      // Scroll has stopped (position unchanged) or max checks reached
      if (currentScrollY === lastScrollY || scrollCheckCount >= maxChecks) {
        // Find the expand button and check if section is closed
        const expandButton = document.querySelector(
          `[data-section-id="${sectionId}"]`
        ) as HTMLButtonElement | null;
        
        if (expandButton && expandButton.getAttribute("data-state") === "closed") {
          expandButton.click();
        }
        return;
      }
      
      lastScrollY = currentScrollY;
      scrollTimeout = setTimeout(checkScrollEnd, 50);
    };

    // Start checking after a brief delay to let scroll begin
    setTimeout(checkScrollEnd, 100);

    toggleRef.current?.focus();
  };

  const handleShareProfile = async () => {
    const profileUrl = `${window.location.origin}/${username}`;
    
    const shareMessage = generateCoachShareMessage({
      displayName: displayName || username,
      username: username,
    });
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: displayName || username,
          text: shareMessage,
          url: profileUrl,
        });
        posthog.capture('profile_shared', { method: 'native_share' });
      } catch (error) {
        // User cancelled or share failed, fallback to clipboard
        await copyToClipboard(shareMessage);
      }
    } else {
      await copyToClipboard(shareMessage);
      posthog.capture('profile_shared', { method: 'clipboard' });
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "Profile link has been copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the URL manually",
        variant: "destructive",
      });
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return username?.charAt(0).toUpperCase() || "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!availableSections || availableSections.length === 0) return null;

  return (
    <>
      {/* Toggle Button - Higher up (top-5), Red (#b66667) */}
      <button
        ref={toggleRef}
        onClick={() => setIsOpen((s) => !s)}
        aria-expanded={isOpen}
        aria-label="Open navigation menu"
        className="fixed top-5 right-5 z-50 inline-flex items-center justify-center h-10 w-10 rounded-full
                   bg-[#b66667] text-white shadow-md
                   hover:scale-105 hover:bg-[#9e5556] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#b66667]"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setIsOpen(false)}
        className={`fixed inset-0 z-40 transition-opacity ${
          isOpen ? "opacity-30" : "opacity-0 pointer-events-none"
        } bg-black`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Quick navigation"
        className={`fixed top-0 right-0 h-full ${width} z-50 transform transition-transform duration-250 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col bg-white/65 backdrop-blur-lg border-l border-white/40 shadow-2xl rounded-l-2xl overflow-hidden">
          {/* Profile Header */}
          <div className="relative px-6 py-5 border-b border-[#b66667]/20 bg-gradient-to-r from-[#b66667]/5 to-transparent">
            <div className="flex items-center gap-3">
              {/* Profile Picture - clickable, scrolls to contact */}
              <button
                onClick={() => scrollToSection("contact")}
                className="flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#b66667] focus:ring-offset-2 rounded-full"
                aria-label="Go to contact section"
                data-testid="nav-profile-picture"
              >
                <Avatar className="h-12 w-12 ring-2 ring-[#b66667]/30">
                  <AvatarImage src={profileImageUrl || undefined} alt={displayName || username} />
                  <AvatarFallback className="bg-[#b66667]/10 text-[#b66667] font-semibold">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>

              {/* Profile Name - clickable, scrolls to contact */}
              <button
                onClick={() => scrollToSection("contact")}
                className="flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity focus:outline-none"
                aria-label="Go to contact section"
                data-testid="nav-profile-name"
              >
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">
                  {displayName || username}
                </h3>
                <p className="text-xs text-[#b66667]">View contact info</p>
              </button>

              {/* Share Button */}
              <button
                onClick={handleShareProfile}
                className="flex-shrink-0 p-2 rounded-full bg-[#b66667] text-white hover:bg-[#9e5556] transition-colors focus:outline-none focus:ring-2 focus:ring-[#b66667] focus:ring-offset-2"
                aria-label="Share profile"
                data-testid="nav-share-profile"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            {/* Floating accent stripe (subtle) */}
            <div
              aria-hidden
              className="absolute -left-3 top-4 h-12 w-1 rounded-full blur-[6px] opacity-90"
              style={{
                background:
                  "linear-gradient(180deg, rgba(201,104,104,0.95), rgba(208,124,124,0.7))",
                boxShadow: "0 6px 18px rgba(201,104,104,0.18)",
              }}
            />
          </div>

          {/* Navigation Items Label */}
          <div className="px-6 pt-4 pb-2">
            <p className="text-xs font-medium text-[#b66667] uppercase tracking-wider">Navigate</p>
          </div>

          {/* List area */}
          <nav className="flex-1 overflow-y-auto">
            <ul
              ref={listRef}
              className="px-4 pb-4 space-y-1"
              role="menu"
              aria-label="Sections"
            >
              {availableSections.map((section, idx) => (
                <li
                  key={section.id}
                  role="none"
                  className="relative"
                  onFocusCapture={() => setFocusedIndex(idx)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onMouseLeave={() => setFocusedIndex(null)}
                >
                  {/* floating highlight indicator */}
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-1 rounded-full transition-transform duration-180"
                    style={{
                      transform:
                        focusedIndex === idx
                          ? "translateY(-50%) scaleY(1)"
                          : "translateY(-50%) scaleY(0.6)",
                      background:
                        focusedIndex === idx
                          ? "linear-gradient(180deg,#b66667,#d07c7c)"
                          : "transparent",
                      boxShadow:
                        focusedIndex === idx
                          ? "0 6px 18px rgba(201,104,104,0.12)"
                          : "none",
                    }}
                  />

                  <button
                    data-nav-item
                    role="menuitem"
                    onClick={() => scrollToSection(section.id)}
                    className="w-full pl-8 pr-4 py-3 text-left rounded-lg flex items-center gap-3
                              bg-transparent hover:bg-white/40 focus:bg-white/40 transition-colors duration-150 focus:outline-none"
                    data-testid={`nav-item-${section.id}`}
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-[#b66667] bg-[#b66667]/10 ring-0">
                      {section.icon}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {section.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Footer with Riplect Logo */}
          <div className="px-4 py-4 border-t border-[#b66667]/20">
            <Link href="/">
              <div className="flex justify-center cursor-pointer hover:opacity-80 transition-opacity">
                <span className="font-bold text-[#b66667] text-xl tracking-tight">Riplect</span>
              </div>
            </Link>
          </div>
        </div>

        {/* CSS variables for easy theming */}
        <style>{`
          :root { --nav-accent: #b66667; }
          /* reduce motion subtle */
          @media (prefers-reduced-motion: reduce) {
            * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
          }
        `}</style>
      </aside>
    </>
  );
}
