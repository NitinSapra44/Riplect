import { useState, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ExpandableSectionProps {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  iconBgColor: string;
  children: ReactNode;
  previewContent?: ReactNode;
  defaultExpanded?: boolean;
  hideExpander?: boolean;
}

export function ExpandableSection({
  id,
  title,
  description,
  icon,
  iconBgColor,
  children,
  previewContent,
  defaultExpanded = false,
  hideExpander = false
}: ExpandableSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  return (
    <div
      id={id}
      className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Preview Content - Always Visible */}
      {previewContent && (
        <div className="bg-white">
          {previewContent}
        </div>
      )}

      {!hideExpander && (
        <>
          {/* Expanded content flows directly after preview when open */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
              isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="overflow-hidden">
              <div className={`border-t border-gray-100 p-4 bg-white ${!isOpen ? 'invisible' : ''}`}>
                {children}
              </div>
            </div>
          </div>

          {/* Toggle button — always at the bottom */}
          <div className="border-t border-dashed border-gray-300 mx-4"></div>
          <button
            type="button"
            className="w-full px-6 py-[1.1rem] flex items-center justify-between bg-[#F5F5F5] hover:bg-[#EEEEEE] transition-colors relative group"
            onClick={() => setIsOpen(!isOpen)}
            data-section-id={id}
            data-state={isOpen ? 'open' : 'closed'}
          >
            <h3 className="text-lg font-bold text-gray-900 flex-1 text-center">
              {title}
            </h3>
            <div className="w-10 h-10 rounded-full bg-[#b66667] flex items-center justify-center group-hover:bg-[#B85858] transition-colors">
              <ChevronDown
                className={`w-5 h-5 text-white transform transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>
        </>
      )}
    </div>
  );
}
