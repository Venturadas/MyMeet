import Image from "next/image";

export function Logo() {
  return (
    <span className="brand">
      <Image
        className="brand-icon"
        src="/brand/nuvemmeet-icon.png"
        width={34}
        height={34}
        alt=""
      />
      <span>NuvemMeet</span>
    </span>
  );
}
