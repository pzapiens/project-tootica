"use client";

import Image from "next/image";
import { useState } from "react";

import { greetingLabel } from "@/lib/api";

import { useMe } from "../session";
import { type Timeframe } from "./mock";
import NewAppointmentModal from "./NewAppointmentModal";
import NotificationBell from "./NotificationBell";
import TimeframeFilter from "./TimeframeFilter";
import styles from "./dashboard.module.css";

/**
 * Dashboard header (Figma "Dashboard - Header"): greeting on the left, the
 * timeframe filter + primary "New Appointment" action on the right. The
 * greeting matches the clinic-selection page ("Hi, <name>").
 */
export default function DashboardHeader({
  timeframe,
  onTimeframeChange,
}: {
  timeframe: Timeframe;
  onTimeframeChange: (t: Timeframe) => void;
}) {
  const me = useMe();
  const greetingName = greetingLabel(me.user);
  const [naOpen, setNaOpen] = useState(false);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="min-w-0 break-words font-inter text-[clamp(22px,1.8vw,26px)] font-semibold leading-tight text-[#1e1e24]">
        Welcome, {greetingName}
      </h1>
      <div className={styles.headerActions}>
        <TimeframeFilter compact timeframe={timeframe} onChange={onTimeframeChange} />
        <NotificationBell />
        <button
          type="button"
          onClick={() => setNaOpen(true)}
          className="app-action-button flex min-h-[40px] items-center rounded-full bg-[#0077c0] text-white py-[10px] shadow-[0px_4.667px_7px_-1.167px_rgba(0,0,0,0.1),0px_2.333px_4.667px_-2.333px_rgba(0,0,0,0.1)] transition-colors hover:bg-[#0069a8]"
        >
          <Image src="/dashboard/add.svg" alt="" width={14} height={14} className="size-3.5 shrink-0" />
          <span className="font-inter text-[13px] font-semibold leading-[20px] tracking-[0.4083px] text-white">
            NEW APPOINTMENT
          </span>
        </button>
      </div>
      {naOpen && <NewAppointmentModal onClose={() => setNaOpen(false)} />}
    </header>
  );
}
