// Monoline icon set (~1.75px stroke, rounded) — matches the reference's minimal line style.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
function S({ size = 20, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <S {...p}>
    <path d="M4 11.5 12 4l8 7.5" />
    <path d="M6 10v9h12v-9" />
  </S>
);
// Moments: a spark / pulse
export const IconSpark = (p: P) => (
  <S {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M12 8.5 13.4 11 16 12l-2.6 1L12 15.5 10.6 13 8 12l2.6-1L12 8.5Z" />
  </S>
);
// Earnings: bolt
export const IconBolt = (p: P) => (
  <S {...p}>
    <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" />
  </S>
);
export const IconUser = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
  </S>
);
export const IconArrowLeft = (p: P) => (
  <S {...p}>
    <path d="M15 5l-7 7 7 7" />
  </S>
);
export const IconArrowRight = (p: P) => (
  <S {...p}>
    <path d="M9 5l7 7-7 7" />
  </S>
);
export const IconArrowDown = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12l7 7 7-7" />
  </S>
);
export const IconCheck = (p: P) => (
  <S {...p}>
    <path d="M5 12.5 10 17l9-10" />
  </S>
);
export const IconPlay = (p: P) => (
  <S {...p}>
    <path d="M7 5l12 7-12 7V5Z" />
  </S>
);
export const IconMute = (p: P) => (
  <S {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M17 9l4 6M21 9l-4 6" />
  </S>
);
export const IconSound = (p: P) => (
  <S {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    <path d="M16 8.5a5 5 0 0 1 0 7" />
  </S>
);
export const IconReceipt = (p: P) => (
  <S {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </S>
);
