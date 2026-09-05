"use client";

import Image from "next/image";
import { useState } from "react";

import { greetingLabel } from "@/lib/api";

import { useMe } from "../DashboardShell";
import { type Timeframe } from "./mock";
import NewAppointmentModal from "./NewAppointmentModal";
import NotificationBell from "./NotificationBell";
import TimeframeFilter from "./TimeframeFilter";

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
      <h1 className="font-inter text-[35px] font-semibold leading-[42px] text-[#1e1e24]">
        Welcome back, {greetingName}
      </h1>
      <div className="flex items-center gap-[18.667px]">
        <TimeframeFilter timeframe={timeframe} onChange={onTimeframeChange} />
        <NotificationBell />
        <button
          type="button"
          onClick={() => setNaOpen(true)}
          className="flex h-[55px] items-center gap-[9.333px] rounded-full bg-[#0077c0] px-[25px] shadow-[0px_4.667px_7px_-1.167px_rgba(0,0,0,0.1),0px_2.333px_4.667px_-2.333px_rgba(0,0,0,0.1)] transition-colors hover:bg-[#0069a8]"
        >
          <Image src="/dashboard/add.svg" alt="" width={24} height={24} className="size-6" />
          <span className="font-inter text-[16.333px] font-semibold leading-[23.333px] tracking-[0.4083px] text-white">
            NEW APPOINTMENT
          </span>
        </button>
      </div>
      {naOpen && <NewAppointmentModal onClose={() => setNaOpen(false)} />}
    </header>
  );
}
