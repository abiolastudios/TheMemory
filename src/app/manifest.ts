import type { MetadataRoute } from "next";
import { EVENT } from "@/lib/event";

// Lets guests "Add to Home Screen" so the site opens full-screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  const names = EVENT.partners.join(" & ");
  return {
    name: names,
    short_name: names,
    description: EVENT.tagline,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0a0a",
    theme_color: "#0b0a0a",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
