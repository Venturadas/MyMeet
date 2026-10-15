"use client";
import { useEffect, useRef } from "react";
import { useNotifications, type NotificationType } from "./notifications";
export type NoticeParams = { notice?: string | string[]; error?: string | string[]; notice_type?: string | string[]; notice_title?: string | string[]; notice_id?: string | string[] };
export function Notices({ params }: { params: NoticeParams }) {
  const { notify } = useNotifications();
  const error = typeof params.error === "string" ? params.error.trim().slice(0, 500) : "", notice = typeof params.notice === "string" ? params.notice.trim().slice(0, 500) : "";
  const message = error || notice;
  const type: NotificationType = error ? "error" : params.notice_type === "info" || params.notice_type === "warning" ? params.notice_type : "success";
  const title = typeof params.notice_title === "string" ? params.notice_title.trim().slice(0, 80) : undefined;
  const displayed = useRef<NoticeParams | null>(null);
  useEffect(() => {
    if (!message || displayed.current === params) return;
    displayed.current = params; notify({ type, title, message });
    const url = new URL(window.location.href);
    if ((url.searchParams.get(error ? "error" : "notice") || "").trim().slice(0, 500) === message) {
      for (const key of ["notice", "error", "notice_type", "notice_title", "notice_id"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [params, message, type, title, error, notify]);
  return <noscript>{message && <p className={`notice${error ? " error" : ""}`} role={error ? "alert" : "status"}>{message}</p>}</noscript>;
}
