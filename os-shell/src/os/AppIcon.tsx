import type { LucideIcon } from "lucide-react";

/** macOS Big Sur-style squircle: soft gradient from the app colour, white glyph. */
export const bigSurBackground = (color: string) => `linear-gradient(160deg, color-mix(in srgb, ${color} 58%, #fff) 0%, ${color} 100%)`;

export function AppIcon({ icon: Icon, color, size = 48 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span className="app-icon" style={{ width: size, height: size, background: bigSurBackground(color), ["--ic" as string]: color }}>
      <Icon size={Math.round(size * 0.52)} strokeWidth={2.1} />
    </span>
  );
}
