import type { LucideIcon } from "lucide-react";

/** macOS-style squircle app icon: top-lit gradient from the app colour, white glyph. */
export function AppIcon({ icon: Icon, color, size = 48 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span
      className="app-icon"
      style={{
        width: size, height: size,
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 72%, #fff) 0%, ${color} 52%, color-mix(in srgb, ${color} 82%, #000) 100%)`,
      }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
