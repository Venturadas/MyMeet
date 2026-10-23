import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";
import "@/components/notifications.css";
import { NotificationProvider } from "@/components/notifications";

const description =
  "NuvLink conecta clientes e negócios por meio de agendamentos simples, rápidos e online.";

function siteOrigin(): URL {
  const fallback = new URL("https://nuvemmeet.vercel.app");
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) return fallback;
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return fallback;
    }
    return url;
  } catch {
    return fallback;
  }
}

export const metadata: Metadata = {
  metadataBase: siteOrigin(),
  title: {
    default: "NuvLink",
    template: "%s · NuvLink",
  },
  description,
  applicationName: "NuvLink",
  appleWebApp: {
    capable: true,
    title: "NuvLink",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/brand/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icon-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/brand/favicon.ico",
    apple: [{ url: "/brand/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "NuvLink",
    title: "NuvLink",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "NuvLink",
    description,
    images: [{ url: "/opengraph-image", alt: "NuvLink — Encontre. Agende. Conecte." }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2F80FF",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main">
          Pular para o conteúdo
        </a>
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  );
}
