import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MyMeet · Seu tempo, bem agendado",
    template: "%s · MyMeet",
  },
  description:
    "Uma agenda simples para empresas e clientes. Escolha seu serviço, encontre um horário e acompanhe seu agendamento.",
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
