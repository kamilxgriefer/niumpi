import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { copy } from "./game/config/copy";

const fredoka = Fredoka({ variable: "--font-display", subsets: ["latin"] });
const nunito = Nunito({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: copy.brand.name,
  description: copy.brand.promise,
  applicationName: copy.brand.name,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: copy.brand.name, statusBarStyle: "black-translucent" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#10072B",
  colorScheme: "dark",
  // vinext's viewport serializer has no `viewportFit` branch, so the token
  // rides along on `width`. The meta content is a comma-separated list, so this
  // still renders as one valid tag with viewport-fit=cover included.
  width: "device-width, viewport-fit=cover",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fredoka.variable} ${nunito.variable}`}>{children}</body>
    </html>
  );
}
