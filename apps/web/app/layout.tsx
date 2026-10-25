import type { Metadata, Viewport } from "next";
import { vazirmatn } from "./fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "بله‌کمپین | مدیریت مخاطبان و کمپین‌های بله", template: "%s | بله‌کمپین" },
  description: "سامانه مدیریت مخاطبان، فهرست‌ها و کمپین‌های پیام‌رسان بله برای کسب‌وکارها.",
};

export const viewport: Viewport = { themeColor: "#4f46e5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-dvh font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
