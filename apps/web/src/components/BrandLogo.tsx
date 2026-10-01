import Image from "next/image";

const ALT = "Smart JobHub: hire & get hired";
// Intrinsic size of both files in /public; CSS sets the rendered size.
const WIDTH = 460;
const HEIGHT = 114;

type BrandLogoProps = {
  /** Size classes, e.g. "h-10 w-auto". */
  className?: string;
  /**
   * "theme" follows light/dark mode. "dark" always uses the dark logo, for
   * surfaces that are dark in both themes (the footer).
   */
  variant?: "theme" | "dark";
  priority?: boolean;
};

/**
 * The Smart JobHub wordmark. Both PNGs are tiny, so they're served as-is
 * (unoptimized) instead of going through the image optimizer.
 */
export default function BrandLogo({
  className = "h-10 w-auto",
  variant = "theme",
  priority = false,
}: BrandLogoProps) {
  if (variant === "dark") {
    return (
      <Image
        src="/logo-dark.png"
        alt={ALT}
        width={WIDTH}
        height={HEIGHT}
        className={className}
        priority={priority}
        unoptimized
      />
    );
  }

  // Both are rendered and CSS shows one, so the right logo is there on the
  // first paint (the theme class is set before hydration). display:none also
  // hides the other from screen readers.
  return (
    <>
      <Image
        src="/logo-light.png"
        alt={ALT}
        width={WIDTH}
        height={HEIGHT}
        className={`${className} dark:hidden`}
        priority={priority}
        unoptimized
      />
      <Image
        src="/logo-dark.png"
        alt={ALT}
        width={WIDTH}
        height={HEIGHT}
        className={`${className} hidden dark:block`}
        priority={priority}
        unoptimized
      />
    </>
  );
}
