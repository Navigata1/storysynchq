import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Register B — "tape stock" typography (docs/design-direction.md §2; brief TYPE).
// Fraunces loads as its variable font (no `weight`: the whole 100–900 axis), upright
// and italic — titles 700–800, story text 400–500, authors and quotes in italic.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

// Mono kickers, meta, readouts and codes: 400 / 500, 600 for emphasis.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// On <html>, so `:root`'s --ss-display / --ss-ui / --ss-mono (globals.css) resolve.
const fontVariables = `${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${plexMono.variable}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0e1a",
};

export const metadata: Metadata = {
  title: "StorySyncHQ — The Immersive Storybook Protocol",
  description: "Create and experience immersive, narrated storybooks. Read along. Listen. Feel. A new universal standard for storytelling.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StorySyncHQ",
  },
  other: {
    "mobile-web-app-capable": "yes",
    // Build identity: the commit Vercel built this deployment from, so anyone can
    // confirm which SHA production serves (view source → ssync-build). "local"
    // for builds outside Vercel's Git integration.
    "ssync-build": process.env.VERCEL_GIT_COMMIT_SHA || "local",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-152x152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={fontVariables}>
      <head>
        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                    .catch(function(err) { console.warn('[SW] Registration failed:', err); });
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased" style={{ overscrollBehavior: "none" }}>
        {children}
      </body>
    </html>
  );
}
