"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_GALLERY_IMAGES } from "@/lib/media-path";
import { mediaRequest } from "@/lib/media-client";
import { MediaImage } from "./media-image";
import { MediaUploader } from "./media-uploader";
import { useNotifications } from "./notifications";

type GalleryPhoto = { id: string; storage_path: string; position: number };
export function GalleryManager({ images }: { images: GalleryPhoto[] }) {
  const router = useRouter();
  const { notify } = useNotifications();
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function change(action: "remove" | "order", recordId: string, direction = 0) {
    if (busy) return;
    const active = new AbortController(); controller.current = active;
    const timeout = setTimeout(() => active.abort(), 20_000);
    setBusy(true);
    try {
      if (action === "remove") await mediaRequest("/api/media/remove", { kind: "gallery", recordId }, active.signal);
      else {
        const ordered = [...images].sort((a, b) => a.position - b.position);
        const index = ordered.findIndex((item) => item.id === recordId); const target = index + direction;
        if (index < 0 || target < 0 || target >= ordered.length) return;
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
        await mediaRequest("/api/media/gallery/order", { ids: ordered.map((item) => item.id) }, active.signal);
      }
      if (!mounted.current) return;
      notify({ type: "success", message: action === "remove" ? "Foto removida." : "Ordem da galeria salva." }); router.refresh();
    } catch (error) {
      if (!mounted.current) return;
      notify({ type: active.signal.aborted ? "warning" : "error", message: active.signal.aborted ? "A operação demorou. Atualize a página antes de tentar novamente." : error instanceof Error ? error.message : "Não foi possível atualizar a galeria." }); router.refresh();
    } finally { clearTimeout(timeout); controller.current = null; if (mounted.current) setBusy(false); }
  }
  const sorted = [...images].sort((a, b) => a.position - b.position);
  return <div className="media-gallery" aria-busy={busy}>
    <p className="media-hint">{images.length} de {MAX_GALLERY_IMAGES} fotos. Use as setas para organizar.</p>
    {images.length < MAX_GALLERY_IMAGES && <MediaUploader kind="gallery" label="Adicionar foto" />}
    {sorted.length > 0 && <ul className="gallery-grid">{sorted.map((photo, index) => <li key={photo.id} className="gallery-item">
      <MediaImage path={photo.storage_path} alt={`Foto ${index + 1} da empresa`} width={360} height={240} sizes="(max-width: 640px) 50vw, 240px" />
      <div className="gallery-item-tools">
        <button type="button" className="button button-secondary" disabled={busy || index === 0} aria-label={`Mover foto ${index + 1} para antes`} onClick={() => change("order", photo.id, -1)}>←</button>
        <button type="button" className="button button-secondary" disabled={busy || index === sorted.length - 1} aria-label={`Mover foto ${index + 1} para depois`} onClick={() => change("order", photo.id, 1)}>→</button>
        <button type="button" className="button button-secondary" disabled={busy} aria-label={`Excluir foto ${index + 1}`} onClick={() => change("remove", photo.id)}>Excluir</button>
      </div>
    </li>)}</ul>}
  </div>;
}
