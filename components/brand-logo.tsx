import Image from "next/image";

export type BrandLogoVariant = "full" | "icon" | "compact" | "light" | "dark";

const logoAssets: Record<BrandLogoVariant, string> = {
  full: "/brand/logo-full.png",
  icon: "/brand/logo-icon.png",
  compact: "/brand/logo-compact.png",
  light: "/brand/logo-light.png",
  dark: "/brand/logo-dark.png",
};

export function BrandLogo({
  variant = "full",
  className = "",
}: {
  variant?: BrandLogoVariant;
  className?: string;
}) {
  const symbol = variant === "icon" || variant === "compact";

  return (
    <span
      className={`brand-logo brand-logo--${variant}${className ? ` ${className}` : ""}`}
      data-variant={variant}
    >
      <Image
        className="brand-logo-image"
        src={logoAssets[variant]}
        width={symbol ? 40 : 240}
        height={symbol ? 40 : 56}
        sizes={symbol ? "40px" : "(max-width: 639px) 164px, 190px"}
        alt="NuvLink"
        loading="eager"
      />
    </span>
  );
}
