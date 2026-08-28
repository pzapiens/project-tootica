"use client";

import { useEffect, useRef, useState } from "react";

import AppointmentsTable from "./AppointmentsTable";
import MiniCalendar from "./MiniCalendar";

/**
 * Lower dashboard row: the appointments table and the mini calendar side by
 * side. On desktop the table is capped to the calendar's height so their
 * bottoms line up; if the appointment list is taller, the table body scrolls.
 * On smaller screens they stack and the table grows naturally.
 */
export default function LowerSection() {
  const calRef = useRef<HTMLDivElement>(null);
  const [calHeight, setCalHeight] = useState<number>();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = calRef.current;
    if (!el) return;
    const measure = () => setCalHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-stretch gap-[37.333px] xl:flex-row xl:items-start">
      <AppointmentsTable height={isDesktop ? calHeight : undefined} />
      <div ref={calRef} className="shrink-0 self-start">
        <MiniCalendar />
      </div>
    </div>
  );
}
