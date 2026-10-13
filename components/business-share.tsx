"use client";

import { useRef, useState } from "react";

export function BusinessShare({
  name,
  url,
  qrDataUrl,
}: {
  name: string;
  url: string;
  qrDataUrl: string | null;
}) {
  const linkInput = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "copying" | "copied" | "manual"
  >("idle");

  async function copyLink() {
    setCopyStatus("copying");
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setCopyStatus("manual");
    }
  }

  return (
    <section className="card stack" aria-label="Compartilhar sua agenda">
      <div>
        <span className="eyebrow">Seu link de agendamento</span>
        <h2>Compartilhe sua agenda</h2>
        <p className="muted">
          Seus clientes podem escolher o serviço e reservar um horário por este
          link.
        </p>
      </div>
      <label className="field">
        Link público da agenda
        <input
          ref={linkInput}
          type="text"
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="inline">
        <button
          className="button"
          type="button"
          onClick={copyLink}
          disabled={copyStatus === "copying"}
        >
          {copyStatus === "copying" ? "Copiando…" : "Copiar link"}
        </button>
        <a
          className="button button-secondary"
          href={`https://wa.me/?text=${encodeURIComponent(`Agende seu horário em ${name}: ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Compartilhar no WhatsApp
        </a>
        <a
          className="button button-secondary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Visualizar página
        </a>
      </div>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          copyStatus === "copied" || copyStatus === "manual"
            ? "muted"
            : "sr-only"
        }
      >
        {copyStatus === "copied" && "Link copiado. Agora é só compartilhar."}
        {copyStatus === "manual" &&
          "O navegador não permitiu copiar automaticamente. O link está selecionado; use a opção Copiar do seu dispositivo."}
      </p>
      {qrDataUrl ? (
        <details className="business-share-qr">
          <summary className="button button-secondary">QR Code</summary>
          <div className="stack">
            <p className="muted">
              Aponte a câmera do celular para abrir a agenda de {name}.
            </p>
            {/* A imagem é gerada no servidor e não usa serviços externos. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              width={256}
              height={256}
              loading="lazy"
              alt={`QR Code do link de agendamento de ${name}`}
            />
          </div>
        </details>
      ) : (
        <p className="muted">O QR Code não está disponível. Use o link acima.</p>
      )}
    </section>
  );
}
