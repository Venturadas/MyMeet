import type { Metadata } from "next";
import "./globals.css";

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
        {children}
      </body>
    </html>
  );
}
