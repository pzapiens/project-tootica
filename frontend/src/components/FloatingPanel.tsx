"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { floatingPanelPosition } from "@/lib/floating-panel";

/** Body portal shared by menus and filters inside scrolling pages and dialogs. */
export default function FloatingPanel({
  anchor,
  width,
  gap = 8,
  align = "end",
  onClose,
  children,
  className = "",
  role,
  label,
  id,
  datePopover = false,
}: {
  anchor: RefObject<HTMLElement | null>;
  width?: number;
  gap?: number;
  align?: "start" | "end";
  onClose: () => void;
  children: ReactNode;
  className?: string;
  role?: "menu" | "dialog";
  label?: string;
  id?: string;
  datePopover?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<
    typeof floatingPanelPosition
  > | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const requestedWidth = Math.min(width ?? rect.width, Math.max(0, window.innerWidth - 24));
      if (panel.current) panel.current.style.width = String(requestedWidth) + "px";
      setPosition(
        floatingPanelPosition(
          rect,
          { width: window.innerWidth, height: window.innerHeight },
          requestedWidth,
          panel.current?.scrollHeight ?? 360,
          gap,
          align,
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [anchor, width, gap, align]);
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        anchor.current?.contains(target) ||
        panel.current?.contains(target) ||
        target.closest("[data-date-popover]")
      )
        return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        anchor.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape, datePopover);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape, datePopover);
    };
  }, [anchor, onClose, datePopover]);
  return createPortal(
    <div
      ref={panel}
      id={id}
      data-floating-panel
      data-date-popover={datePopover || undefined}
      role={role}
      aria-label={label}
      className={`app-floating-panel ${className}`}
      style={{
        position: "fixed",
        width,
        maxWidth: "calc(100vw - 24px)",
        ...position,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
