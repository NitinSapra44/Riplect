import { useRef, useEffect, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { MapPin, Loader2 } from "lucide-react";
import type { PlacePrediction } from "@/hooks/use-places-autocomplete";

interface PlacesAutocompleteDropdownProps {
  predictions: PlacePrediction[];
  isLoading: boolean;
  open: boolean;
  onSelect: (prediction: PlacePrediction) => void;
  onClose: () => void;
  /** Element the dropdown should anchor to (usually the search input or its wrapper). */
  anchorRef: React.RefObject<HTMLElement | null>;
  className?: string;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
}

export function PlacesAutocompleteDropdown({
  predictions,
  isLoading,
  open,
  onSelect,
  onClose,
  anchorRef,
  className = "",
}: PlacesAutocompleteDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<AnchorRect | null>(null);

  // Recompute the dropdown position whenever it opens, the anchor changes, or the
  // page is scrolled/resized. Using fixed positioning + a portal escapes the
  // dialog's overflow/stacking context so the dropdown can never be clipped.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDropdown = ref.current?.contains(target);
      const insideAnchor = anchorRef.current?.contains(target);
      if (!insideDropdown && !insideAnchor) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onClose, anchorRef]);

  if (!open || !rect) return null;
  if (!isLoading && predictions.length === 0) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      data-places-autocomplete-portal=""
      style={{
        position: "fixed",
        top: rect.top + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 2147483647,
        // Radix's modal Dialog sets `pointer-events: none` on <body> to lock
        // out everything outside its DismissableLayer. This dropdown is
        // portaled into document.body, so without an explicit override it
        // inherits `none` and silently swallows hover/click. Clicks then
        // pass through to whatever sits inside the dialog (e.g. the embedded
        // Google Map), which is the actual source of Task #143's "click
        // falls through to the map" bug.
        pointerEvents: "auto",
      }}
      className={`bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden ${className}`}
    >
      {isLoading ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Searching...</span>
        </div>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {predictions.map((prediction, index) => (
            <li key={prediction.placeId}>
              <button
                type="button"
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors ${
                  index > 0 ? "border-t border-gray-50" : ""
                }`}
                // Use onClick (not onMouseDown) so the dropdown stays mounted
                // through the entire mousedown -> mouseup -> click sequence.
                // If we close on mousedown, React unmounts the portal before
                // mouseup fires; mouseup/click then land on whatever sits
                // beneath the dropdown (e.g. the embedded Google Map in the
                // Add Location dialog), which fires its own onClick and
                // overwrites the place we just picked. Selecting on `click`
                // keeps the click target on the dropdown button so the event
                // can never reach the map.
                onMouseDown={(e) => {
                  // Prevent the input from losing focus on mousedown — the
                  // selection still runs on click below. Without this, the
                  // input blurs synchronously and some browsers swallow the
                  // subsequent click on touch devices.
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(prediction);
                }}
                onPointerUp={(e) => {
                  // Stop pointerup from reaching anything underneath the
                  // portal. Belt-and-braces for environments where Google
                  // Maps' internal pointer tracking might still react to a
                  // pointerup at this position.
                  e.stopPropagation();
                }}
              >
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {prediction.mainText}
                  </div>
                  {prediction.secondaryText && (
                    <div className="text-xs text-gray-500 truncate">
                      {prediction.secondaryText}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}
