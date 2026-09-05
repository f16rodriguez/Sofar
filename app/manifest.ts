// Installed to a home screen, Sofar should open like a book, not a browser
// tab (SPEC §6, M5). Cream ground, oxblood ribbon, light only.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sofar",
    short_name: "Sofar",
    description: "A living autobiography.",
    // Today is where a person lands day after day; the interview is a first
    // week, the book is a place you go on purpose.
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4eee2",
    theme_color: "#f4eee2",
    categories: ["lifestyle", "books"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
