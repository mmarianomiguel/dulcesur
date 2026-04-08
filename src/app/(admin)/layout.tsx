import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
};

export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
