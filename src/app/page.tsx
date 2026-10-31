import { readdirSync } from "node:fs";
import path from "node:path";
import { LockScreen } from "@/components/LockScreen";
import { WALLPAPER_FIT } from "@/lib/event";

// Every image in public/couple/ becomes a lock-screen wallpaper, in name order.
function couplePhotos() {
  try {
    return readdirSync(path.join(process.cwd(), "public", "couple"))
      .filter((file) => /\.(jpe?g|png|webp|avif)$/i.test(file))
      .sort()
      .map((file) => ({ src: `/couple/${file}`, ...WALLPAPER_FIT[file] }));
  } catch {
    return [];
  }
}

export default function Home() {
  return <LockScreen photos={couplePhotos()} />;
}
