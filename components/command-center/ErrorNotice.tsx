import type { ReactNode } from "react";
import type { OperatorError } from "./types";

// One consistent failure box: a concise operator message, optional context from
// the caller, and the backend's own detail text behind an expander (never as
// raw JSON, never as the primary message).
export default function ErrorNotice({
  error,
  className = "",
  children,
}: {
  error: OperatorError;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`rounded border border-vessel/40 bg-vessel/5 px-3 py-2 backdrop-blur-sm ${className}`}
    >
      <p className="font-body text-xs leading-snug text-vessel">{error.message}</p>
      {children}
      {error.detail && (
        <details className="mt-1.5">
          <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-mission text-mist/70">
            Service details
          </summary>
          <p className="mt-1 break-words font-mono text-[10px] leading-snug text-mist/70">{error.detail}</p>
        </details>
      )}
    </div>
  );
}
