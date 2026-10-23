"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CircleCheck, Copy } from "lucide-react";
import { BUSINESS_PRICE_CENTS } from "@/lib/billing-plan";
import { dateTime, money } from "@/lib/types";

type Subscription = { active: boolean; expiresAt: string | null };
type Payment = {
  id: string;
  status: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
};
type Checkout = { payment: Payment | null; subscription: Subscription };

function paymentResponse(value: unknown): Checkout | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Checkout;
  if (!result.subscription || typeof result.subscription.active !== "boolean")
    return null;
  for (const date of [
    result.subscription.expiresAt,
    result.payment?.expiresAt,
  ]) {
    if (
      date != null &&
      (typeof date !== "string" || !Number.isFinite(Date.parse(date)))
    )
      return null;
  }
  const payment = result.payment;
  if (
    payment !== null &&
    (!payment ||
      typeof payment.id !== "string" ||
      typeof payment.status !== "string")
  )
    return null;
  if (payment) {
    if (
      payment.qrCode != null &&
      (typeof payment.qrCode !== "string" || payment.qrCode.length > 4096)
    )
      return null;
    if (
      payment.qrCodeBase64 != null &&
      (typeof payment.qrCodeBase64 !== "string" ||
        payment.qrCodeBase64.length > 320_000 ||
        !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(payment.qrCodeBase64))
    )
      return null;
  }
  return result;
}

export function PixCheckout({
  configured,
  initialSubscription,
  supportEmail = null,
}: {
  configured: boolean;
  initialSubscription: Subscription;
  supportEmail?: string | null;
}) {
  const [checkout, setCheckout] = useState<Checkout>({
    payment: null,
    subscription: initialSubscription,
  });
  const [busy, setBusy] = useState<"checking" | "starting" | null>(
    configured && !initialSubscription.active ? "checking" : null,
  );
  const [checked, setChecked] = useState(initialSubscription.active);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [now, setNow] = useState(0);
  const [verifiedAt, setVerifiedAt] = useState(0);
  const [visible, setVisible] = useState(true);
  const codeField = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const load = useCallback(async (method: "GET" | "POST") => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setBusy(method === "POST" ? "starting" : "checking");
    if (method === "POST") setChecked(false);
    setError("");
    try {
      const response = await fetch(
        method === "POST" ? "/api/billing/checkout" : "/api/billing/status",
        {
          method,
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      if (response.status === 401) {
        if (mounted.current && request.current === controller)
          setNeedsLogin(true);
        throw new Error("Entre novamente para consultar seu pagamento.");
      }
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = (body as { error?: unknown } | null)?.error;
        throw new Error(
          typeof message === "string" && message.length < 300
            ? message
            : "Não foi possível consultar o pagamento. Tente verificar novamente.",
        );
      }
      const data = paymentResponse(body);
      if (!data)
        throw new Error(
          "Não foi possível consultar o pagamento. Tente verificar novamente.",
        );
      if (mounted.current && request.current === controller) {
        setCheckout(data);
        setChecked(true);
        setNow(Date.now());
        setVerifiedAt(Date.now());
        setCopyMessage("");
      }
    } catch (cause) {
      if (mounted.current && request.current === controller)
        setError(
          cause instanceof Error && cause.name === "Error"
            ? cause.message
            : cause instanceof Error && cause.name === "AbortError"
              ? "A consulta demorou. Verifique o pagamento antes de tentar gerar outro Pix."
              : "Não foi possível consultar o pagamento. Verifique antes de gerar outro Pix.",
        );
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        if (mounted.current) setBusy(null);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const visibility = () => {
      setNow(Date.now());
      setVisible(document.visibilityState === "visible");
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    // This is external revalidation. Initial busy/error state already matches load(),
    // and the shared loader owns request deduplication, timeout and unmount cancellation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (configured && !initialSubscription.active) void load("GET");
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [configured, initialSubscription.active, load]);

  const payment = checkout.payment;
  const pending = Boolean(
    payment && ["pending", "in_process"].includes(payment.status),
  );
  const expiresAt = payment?.expiresAt ? Date.parse(payment.expiresAt) : null;
  const expired = expiresAt !== null && now > 0 && now >= expiresAt;
  const polling =
    pending &&
    visible &&
    !expired &&
    !checkout.subscription.active &&
    !needsLogin;

  useEffect(() => {
    if (!polling) return;
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void load("GET"), 15_000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(poll);
    };
  }, [polling, load]);

  async function copyCode() {
    if (!payment?.qrCode) return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
      if (mounted.current) setCopyMessage("Código Pix copiado.");
    } catch {
      codeField.current?.focus();
      codeField.current?.select();
      if (mounted.current)
        setCopyMessage(
          "Selecionei o código. Use a opção Copiar do seu aparelho.",
        );
    }
  }

  if (checkout.subscription.active) {
    return (
      <div className="stack pix-status pix-status--active" role="status">
        <CircleCheck size={24} aria-hidden="true" />
        <strong>Sua assinatura está ativa.</strong>
        {checkout.subscription.expiresAt && (
          <p className="muted">
            Acesso até {dateTime(checkout.subscription.expiresAt)}.
          </p>
        )}
        <Link className="button" href="/empresa">
          Entrar na minha empresa <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="stack pix-status">
        <button className="button" disabled>
          Pagamento indisponível
        </button>
        <p className="muted">O pagamento será liberado em breve.</p>
      </div>
    );
  }

  const seconds =
    expiresAt === null || now === 0
      ? null
      : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const remaining =
    seconds === null
      ? null
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const canGenerate =
    checked &&
    !needsLogin &&
    (!payment ||
      [
        "approved",
        "cancelled",
        "rejected",
        "refunded",
        "charged_back",
        "expired",
      ].includes(payment.status) ||
      (expired && expiresAt !== null && verifiedAt >= expiresAt));

  return (
    <div className="pix-sheet stack" aria-busy={busy !== null}>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {needsLogin ? (
        <Link className="button" href="/entrar?next=/planos">
          Entrar novamente
        </Link>
      ) : pending && !expired ? (
        <>
          <p role="status">
            Aguardando pagamento. Abra o aplicativo do seu banco e pague este
            Pix.
          </p>
          {payment?.qrCodeBase64 && (
            // The provider's validated PNG is an inline payment QR, never an external URL.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="pix-qr"
              src={`data:image/png;base64,${payment.qrCodeBase64}`}
              width="240"
              height="240"
              alt="QR Code para pagar o plano por Pix"
            />
          )}
          {payment?.qrCode && (
            <>
              <label className="field">
                Pix Copia e Cola
                <textarea
                  className="pix-code"
                  ref={codeField}
                  readOnly
                  value={payment.qrCode}
                  rows={3}
                  wrap="soft"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                className="button"
                type="button"
                onClick={() => void copyCode()}
              >
                <Copy size={17} aria-hidden="true" /> Copiar código Pix
              </button>
            </>
          )}
          {remaining && (
            <p className="muted">Este Pix expira em {remaining}.</p>
          )}
          <p className="muted">
            Após pagar, aguarde a confirmação para liberar sua empresa.
          </p>
        </>
      ) : payment ? (
        <p role="status">
          {expired || payment.status === "expired"
            ? canGenerate
              ? "Este Pix expirou. Você pode gerar um novo código."
              : "Este Pix expirou. Verifique o pagamento antes de gerar um novo código."
            : payment.status === "approved"
              ? "Seu acesso venceu. Gere um novo Pix para renovar."
              : canGenerate
                ? "Este pagamento foi encerrado. Você pode gerar um novo Pix."
                : "Verifique o status deste pagamento para continuar."}
        </p>
      ) : (
        <button
          className="button"
          type="button"
          disabled={!canGenerate || busy !== null}
          onClick={() => void load("POST")}
        >
          {busy === "starting"
            ? "Gerando Pix…"
            : busy === "checking"
              ? "Consultando pagamento…"
              : `Gerar Pix de ${money(BUSINESS_PRICE_CENTS)}`}
        </button>
      )}
      {payment && canGenerate && (
        <button
          className="button"
          type="button"
          disabled={busy !== null}
          onClick={() => void load("POST")}
        >
          {busy === "starting"
            ? "Gerando Pix…"
            : `Gerar novo Pix de ${money(BUSINESS_PRICE_CENTS)}`}
        </button>
      )}
      {!needsLogin && (error || payment) && (
        <button
          className="button button-secondary"
          type="button"
          disabled={busy !== null}
          onClick={() => void load("GET")}
        >
          {busy === "checking" ? "Verificando…" : "Verificar pagamento"}
        </button>
      )}
      {error && !needsLogin && (
        <p className="muted">
          Se você já pagou, verifique o pagamento antes de tentar outro Pix.
          {supportEmail && (
            <>
              {" "}
              Se precisar de ajuda,{" "}
              <a href={`mailto:${supportEmail}`}>fale com o suporte</a>.
            </>
          )}
        </p>
      )}
      <p className="muted" role="status" aria-live="polite">
        {copyMessage}
      </p>
    </div>
  );
}
