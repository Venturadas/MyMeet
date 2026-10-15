"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_IMAGE_BYTES, type MediaKind, isMediaPath } from "@/lib/media-path";
import { mediaRequest } from "@/lib/media-client";
import { useNotifications } from "./notifications";
import { MediaImage } from "./media-image";

export function MediaUploader({ kind, currentPath, label, professionalId, onUploaded }: {
  kind: MediaKind; currentPath?: string | null; label: string; professionalId?: string; onUploaded?: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const { notify } = useNotifications();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [path, setPath] = useState(currentPath);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(true);
  useEffect(() => { setPath(currentPath); }, [currentPath]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const source = URL.createObjectURL(file);
    setPreview(source);
    return () => URL.revokeObjectURL(source);
  }, [file]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  function choose(next: File | null) {
    if (!next) return;
    if (next.size > MAX_IMAGE_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      notify({ type: "error", message: "Escolha uma imagem JPG, PNG ou WebP de até 4 MB." });
      if (input.current) input.current.value = "";
      return;
    }
    setFile(next);
  }
  async function save(remove = false) {
    if (busy || (!remove && !file)) return;
    setBusy(true);
    const active = new AbortController();
    controller.current = active;
    const timeout = setTimeout(() => active.abort(), 30_000);
    try {
      let result: Record<string, unknown>;
      if (remove) result = await mediaRequest("/api/media/remove", { kind, ...(kind === "professional" ? { recordId: professionalId } : {}) }, active.signal);
      else {
        const data = new FormData();
        data.set("kind", kind); data.set("file", file!);
        if (kind === "professional" && professionalId) data.set("professional_id", professionalId);
        result = await mediaRequest(`/api/media/upload?kind=${kind}`, data, active.signal);
        if (!isMediaPath(result.path)) throw new Error("A resposta do envio foi inválida. Atualize a página para verificar a imagem.");
      }
      if (!mounted.current) return;
      setPath(remove ? null : result.path as string);
      setFile(null);
      if (input.current) input.current.value = "";
      notify({ type: "success", message: remove ? "Imagem removida." : "Imagem salva." });
      router.refresh(); onUploaded?.();
    } catch (error) {
      if (!mounted.current) return;
      // A timeout can occur after the database committed. Discard the local
      // candidate and refresh, so a second click cannot duplicate a gallery row.
      setFile(null);
      if (input.current) input.current.value = "";
      if (active.signal.aborted) notify({ type: "warning", message: "O envio demorou. Atualize a página para verificar a imagem antes de tentar novamente." });
      else notify({ type: "error", message: error instanceof Error ? error.message : "Não foi possível salvar a imagem." });
      router.refresh();
    } finally {
      clearTimeout(timeout); controller.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return <div className="media-uploader" aria-busy={busy}>
    <label htmlFor={id}>{label}</label>
    <div className="media-tools">
      {(preview || path) && <div className="media-preview">{preview ? <img src={preview} alt={`Prévia: ${label}`} width={96} height={96} decoding="async" /> : <MediaImage path={path} kind={kind === "avatar" ? "avatar" : "company"} alt={label} width={96} height={96} />}</div>}
      <div className="media-input">
        <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => choose(event.target.files?.[0] || null)} aria-describedby={`${id}-hint`} />
        <p id={`${id}-hint`} className="media-hint">JPG, PNG ou WebP · até 4 MB</p>
        <div className="inline">
          {file && <button type="button" className="button" disabled={busy} onClick={() => save()}>{busy ? "Enviando…" : "Salvar imagem"}</button>}
          {file && <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setFile(null); if (input.current) input.current.value = ""; }}>Descartar prévia</button>}
          {path && kind !== "gallery" && <button type="button" className="button button-secondary" disabled={busy} onClick={() => save(true)}>Remover imagem</button>}
        </div>
      </div>
    </div>
  </div>;
}
