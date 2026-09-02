// A `template.tsx` re-mounts on every navigation (unlike `layout.tsx`, which
// persists), so this wrapper replays its entrance animation on each route
// change — the standard App Router spot for a page transition.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
