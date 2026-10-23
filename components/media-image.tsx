"use client";
import Image from "next/image";
import { useState } from "react";
import { Building2, UserRound } from "lucide-react";
import { avatarImageUrl, companyImageUrl } from "@/lib/media-path";

export function MediaImage({
  path,
  alt,
  width = 96,
  height = 96,
  className = "",
  kind = "company",
  fallback = "",
  fit = "cover",
  sizes,
}: {
  path?: string | null;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  kind?: "company" | "avatar";
  fallback?: string;
  fit?: "cover" | "contain";
  sizes?: string;
}) {
  const source =
    kind === "avatar" ? avatarImageUrl(path) : companyImageUrl(path);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (!source || failedSource === source) {
    const initials = fallback
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toLocaleUpperCase("pt-BR");
    return (
      <span
        className={`media-image media-fallback ${className}`}
        role="img"
        aria-label={alt}
        style={{
          width,
          maxWidth: "100%",
          height: "auto",
          aspectRatio: `${width}/${height}`,
        }}
      >
        {initials ||
          (kind === "avatar" ? (
            <UserRound size={24} aria-hidden="true" />
          ) : (
            <Building2 size={24} aria-hidden="true" />
          ))}
      </span>
    );
  }
  return (
    <Image
      src={source}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes || `${width}px`}
      className={`media-image ${className}`}
      style={{ objectFit: fit }}
      loading="lazy"
      decoding="async"
      unoptimized={kind === "avatar"}
      onError={() => setFailedSource(source)}
    />
  );
}
