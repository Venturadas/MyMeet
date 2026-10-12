import type { Metadata } from "next";
export const metadata: Metadata = { title: "Demonstração" };
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
