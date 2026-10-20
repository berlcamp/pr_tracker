import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";
import citySeal from "@/public/logos/Ozamiz-City-Seal.png";
import asensoOzamiz from "@/public/logos/AO2.png";
import asensoMisOcc from "@/public/logos/5M's.png";
import bagongPilipinas from "@/public/logos/BAGONG PILIPINAS.png";

export { citySeal };

/** Official logos in display order. `wide` marks the Asenso Ozamiz wordmark: its PNG has wide transparent margins, so it gets a wider box and is cropped and scaled to match the seals visually. */
export const BRAND_LOGOS: { src: StaticImageData; alt: string; wide?: boolean }[] = [
  { src: citySeal, alt: "Official Seal of the City of Ozamiz" },
  { src: asensoOzamiz, alt: "Asenso Ozamiz", wide: true },
  { src: asensoMisOcc, alt: "Asenso Misamis Occidental" },
  { src: bagongPilipinas, alt: "Bagong Pilipinas" },
];

/** A row of the four official logos at a uniform height. `size` is the height in px. */
export function LogoStrip({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <ul className={cn("flex items-center", className)} aria-label="Official logos">
      {BRAND_LOGOS.map((l) => (
        <li key={l.alt} className="shrink-0">
          <Image src={l.src} alt={l.alt} title={l.alt} sizes={`${Math.round(size * (l.wide ? 3 : 1))}px`}
                 style={{ height: size, width: l.wide ? size * 2.3 : size }}
                 className={l.wide ? "scale-125 object-cover" : "object-contain"} />
        </li>
      ))}
    </ul>
  );
}
