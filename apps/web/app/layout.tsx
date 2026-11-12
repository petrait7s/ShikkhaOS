import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@shikkhaos/screens/styles.css";

export const metadata: Metadata = { title: "ShikkhaOS", description: "School operating system", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><div id="root">{children}</div></body></html>;
}
