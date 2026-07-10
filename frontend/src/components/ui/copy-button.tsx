import { useCallback, useState } from "react";
import clsx from "clsx";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
        copied
          ? "bg-success-subtle text-success"
          : "bg-surface-subtle text-text-secondary hover:text-text-primary hover:border-border-strong border border-border",
        className,
      )}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6L5 8.5L9.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="2.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.25" />
            <path d="M8 3V2.5A1.5 1.5 0 0 0 6.5 1h-4A1.5 1.5 0 0 0 1 2.5v4A1.5 1.5 0 0 0 2.5 8H3" stroke="currentColor" strokeWidth="1.25" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
