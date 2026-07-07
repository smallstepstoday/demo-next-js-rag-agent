import type React from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

/**
 * Font Configuration
 *
 * Geist: Sans-serif font for body text and headings
 * Geist Mono: Monospace font for code blocks and technical content
 *
 * These are loaded from Google Fonts and optimized by Next.js:
 * - Font files are self-hosted for performance
 * - FOUT (Flash of Unstyled Text) is eliminated
 * - Fonts are preloaded for instant rendering
 */
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

/**
 * SEO Metadata
 *
 * This metadata object is exported and used by Next.js to:
 * - Set the browser tab title
 * - Provide description for search engines
 * - Configure favicons with theme-aware icons
 *
 * FAVICON STRATEGY:
 * - Light mode: Uses light-colored icon on dark browser UI
 * - Dark mode: Uses dark-colored icon on light browser UI
 * - SVG: Vector icon for high-resolution displays
 * - Apple: Special icon format for iOS devices
 */
export const metadata: Metadata = {
  title: "Biography Workflow Manager",
  description: "Multi-step RAG agent for generating AI-powered biographies",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

/**
 * Root Layout Component
 *
 * This component wraps the entire application and provides:
 * - HTML document structure (<html>, <body>)
 * - Font classes applied via Tailwind
 * - Analytics tracking for page views and interactions
 *
 * @param children - Page content to render inside the layout
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* 
        Body classes:
        - font-sans: Applies Geist sans-serif font (configured in globals.css)
        - antialiased: Smooth font rendering on all screens
      */}
      <body
        className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {/* Page content rendered here */}
        {children}

        {/* 
          Vercel Analytics Component
          - Tracks page views automatically
          - Records Web Vitals (LCP, FID, CLS)
          - Privacy-friendly (no cookies)
        */}
        <Analytics />
      </body>
    </html>
  );
}
