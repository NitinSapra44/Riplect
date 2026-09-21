import { ReactNode } from "react";

const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

export function linkifyText(text: string): ReactNode {
  const parts = text.split(URL_SPLIT_REGEX);
  return parts.map((part, i) =>
    part.startsWith("http://") || part.startsWith("https://") ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800 break-all"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}
