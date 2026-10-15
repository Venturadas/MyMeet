import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "@/components/notifications.css";
import { NotificationProvider } from "@/components/notifications";

export const metadata: Metadata = {
  title: {
    default: "NuvemMeet · Agenda online para seu negócio",
    template: "%s · NuvemMeet",
  },
  description:
    "Receba reservas, organize horários e acompanhe seus atendimentos com o NuvemMeet. Uma agenda simples para usar no computador e no celular.",
  applicationName: "NuvemMeet",
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
