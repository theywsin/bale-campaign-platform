import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { vazirmatn } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "بله‌کمپین | مدیریت مخاطبان و کمپین‌های بله", template: "%s | بله‌کمپین" },
  description: "سامانه مدیریت مخاطبان، فهرست‌ها و کمپین‌های پیام‌رسان بله برای کسب‌وکارها.",
};

export const viewport: Viewport = { themeColor: "#4f46e5", width: "device-width", initialScale: 1 };

/**
 * Reading the request headers renders every page per request, which the nonce-based
 * CSP from middleware.ts needs: Next adds the nonce to its scripts only when rendering.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
