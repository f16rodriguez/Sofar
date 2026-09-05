import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sofar",
  description: "A living autobiography.",
  applicationName: "Sofar",
  // On a home screen it opens without browser chrome, titled like a book.
  appleWebApp: { capable: true, title: "Sofar", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // A book is not a thing to be indexed while it is being written, and a
  // private one never is (SPEC §7).
  robots: { index: false, follow: false },
};

// Light only, in the ground colour, so the phone's own chrome matches the page.
export const viewport: Viewport = {
  themeColor: "#f4eee2",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Newsreader for the book, Instrument Sans for chrome (SPEC §6) —
            the same faces and axes as design/landing.html. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Instrument+Sans:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
