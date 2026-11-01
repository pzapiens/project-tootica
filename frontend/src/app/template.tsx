import DocumentTransition from "@/components/loading/DocumentTransition";

// The client wrapper keys transitions by the complete destination pathname,
// including changes below a persistent root template.
export default function Template({ children }: { children: React.ReactNode }) {
  return <DocumentTransition>{children}</DocumentTransition>;
}
