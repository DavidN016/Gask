import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gask — A better price around the corner",
  description: "Find and compare nearby gas stations. Less searching, more saving.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
