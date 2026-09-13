import type { ReactNode } from "react";

// Content renders fully visible immediately — no timer/animation gates
// visibility. A staggered fade-in was tried and dropped: in degraded
// rendering conditions (backgrounded/throttled tabs) it could leave panels
// stuck invisible, which is a worse outcome than simply omitting the
// entrance flourish. `delay`/`className` stay as props for API stability.
export default function RevealOnMount({
  children,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
