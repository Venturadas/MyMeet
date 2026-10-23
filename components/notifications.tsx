"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
export type NotificationType = "success" | "error" | "info" | "warning";
export type NotificationInput = {
  type: NotificationType;
  message: string;
  title?: string;
};
type Notification = NotificationInput & { id: number };
const titles: Record<NotificationType, string> = {
  success: "Tudo certo",
  error: "Não foi possível concluir",
  info: "Informação",
  warning: "Atenção",
};
const durations: Record<NotificationType, number> = {
  success: 6500,
  error: 9000,
  info: 7500,
  warning: 8500,
};
const NotificationContext = createContext<{
  notify: (input: NotificationInput) => void;
} | null>(null);
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((input: NotificationInput) => {
    if (
      !Object.hasOwn(titles, input.type) ||
      typeof input.message !== "string" ||
      !input.message.trim()
    )
      return;
    const notification = {
      id: ++nextId.current,
      type: input.type,
      message: input.message.trim().slice(0, 500),
      title: input.title?.trim().slice(0, 80),
    };
    setNotifications((items) => [...items.slice(-2), notification]);
  }, []);
  const dismiss = useCallback(
    (id: number) =>
      setNotifications((items) => items.filter((item) => item.id !== id)),
    [],
  );
  const context = useMemo(() => ({ notify }), [notify]);
  return (
    <NotificationContext.Provider value={context}>
      {children}
      <div className="nm-toast-region" aria-label="Notificações">
        {notifications.map((notification) => (
          <NotificationToast
            key={notification.id}
            notification={notification}
            onDismiss={dismiss}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error("NotificationProvider precisa envolver a página.");
  return context;
}
function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [hidden, setHidden] = useState(false),
    [leaving, setLeaving] = useState(false);
  const remaining = useRef(durations[notification.type]);
  const paused = hovered || focused || hidden;
  const close = useCallback(() => setLeaving(true), []);
  useEffect(() => {
    const visibility = () => setHidden(document.visibilityState !== "visible");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (paused || leaving) return;
    const started = performance.now(),
      timeout = setTimeout(close, remaining.current);
    return () => {
      clearTimeout(timeout);
      remaining.current = Math.max(
        0,
        remaining.current - (performance.now() - started),
      );
    };
  }, [paused, leaving, close]);
  useEffect(() => {
    if (!leaving) return;
    const timeout = setTimeout(() => onDismiss(notification.id), 180);
    return () => clearTimeout(timeout);
  }, [leaving, notification.id, onDismiss]);
  return (
    <div
      className={`nm-toast nm-toast-${notification.type}${leaving ? " nm-toast-leaving" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <span className="nm-toast-icon" aria-hidden="true">
        {notification.type === "success" ? (
          <CircleCheck />
        ) : notification.type === "error" ? (
          <CircleX />
        ) : notification.type === "warning" ? (
          <TriangleAlert />
        ) : (
          <Info />
        )}
      </span>
      <div
        className="nm-toast-copy"
        role={notification.type === "error" ? "alert" : "status"}
        aria-live={notification.type === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        <p className="nm-toast-title">
          {notification.title || titles[notification.type]}
        </p>
        <p>{notification.message}</p>
      </div>
      <button
        type="button"
        className="nm-toast-close"
        onClick={close}
        aria-label="Fechar notificação"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
