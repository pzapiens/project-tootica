"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, type AppointmentListItem, type DoctorSummary } from "@/lib/api";
import { frameRange } from "@/lib/analytics";
import { useAppointmentsRevision } from "@/lib/appointmentsBus";
import { Tip } from "@/components/HoverTip";
import DonutChart, { type DonutDatum } from "@/components/DonutChart";

import TimeframeFilter from "../dashboard/TimeframeFilter";
import { type Timeframe } from "../dashboard/mock";

/** "TEETH WHITENING" → "Teeth Whitening". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Minor words kept lowercase in proper-cased labels (unless they lead the string).
const MINOR_WORDS = new Set(["of", "and", "the", "to", "a", "an", "in", "on", "for", "or", "by", "with"]);

/** "WORD OF MOUTH" → "Word of Mouth" (title case, minor words lowercased). */
function properCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Whether an ISO instant falls inside a timeframe (all-time → always true). */
function inRange(iso: string, tf: Timeframe): boolean {
  const r = frameRange(tf);
  if (!r) return true;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t <= r.to.getTime();
}

/** Escape one CSV cell (wrap in quotes when it contains a comma/quote/newline). */
function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** The four summary stat cards (Figma "Dashboard - Stats Cards" reused on Analytics).
 *  `status` is the appointments-page status filter the "Review" link deep-links to. */
const STAT_CARDS = [
  { key: "total", label: "Total Appointments", icon: "/dashboard/stat_productivity.svg", status: "" },
  { key: "completed", label: "Completed Appointments", icon: "/dashboard/stat_event_available.svg", status: "Completed" },
  { key: "pending", label: "Upcoming Appointments", icon: "/dashboard/stat_hourglass_empty.svg", status: "Upcoming" },
  { key: "cancelled", label: "Cancelled Appointments", icon: "/dashboard/stat_cancel.svg", status: "Cancelled" },
] as const;

type StatKey = (typeof STAT_CARDS)[number]["key"];

/** Doctor-performance status facets. `status` is the appointments status the pie's
 *  slice drill-down filters to (empty = no status filter, e.g. Total). `chip` is
 *  the short label for the facet selector. */
const DOCTOR_COLUMNS = [
  { key: "total", header: "Total Appointments", chip: "Total", status: "" },
  { key: "upcoming", header: "Upcoming Appointments", chip: "Upcoming", status: "Upcoming" },
  { key: "completed", header: "Completed Appointments", chip: "Completed", status: "Completed" },
  { key: "noShow", header: "No Show Appointments", chip: "No Show", status: "No Show" },
  { key: "cancelled", header: "Cancelled Appointments", chip: "Cancelled", status: "Cancelled" },
] as const;

type DoctorColKey = (typeof DOCTOR_COLUMNS)[number]["key"];

interface DoctorRow {
  id: string;
  name: string;
  counts: Record<DoctorColKey, number>;
}

/** The Doctor Performance pie's status slices. Each partitions the total, so
 *  together they fill the ring and the centre readout is the true total. "Total"
 *  isn't a slice — it would double-count. `status` is the appointments-page filter
 *  the slice deep-links to; `match` is the raw appointment status it counts. */
const DOCTOR_STATUS_SLICES: {
  label: string;
  status: string;
  match: AppointmentListItem["status"];
}[] = [
  { label: "Pending", status: "Upcoming", match: "CONFIRMED" },
  { label: "On going", status: "On going", match: "ONGOING" },
  { label: "Completed", status: "Completed", match: "COMPLETED" },
  { label: "No Show", status: "No Show", match: "NO_SHOW" },
  { label: "Cancelled", status: "Cancelled", match: "CANCELLED" },
];

type Tab = "doctor" | "counts";

export default function AnalyticsClient() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const rev = useAppointmentsRevision();

  const [items, setItems] = useState<AppointmentListItem[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("doctor");

  // Per-section timeframes: the header cards, the doctor tab, and a single shared
  // timeframe for both count charts on the Consultation/Source tab.
  const [cardsTf, setCardsTf] = useState<Timeframe>({ kind: "all" });
  const [doctorTf, setDoctorTf] = useState<Timeframe>({ kind: "all" });
  const [countsTf, setCountsTf] = useState<Timeframe>({ kind: "all" });

  // Doctor Performance picker: "" = all doctors (default → every appointment).
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");

  // One all-time fetch feeds every section; each section filters by its own
  // timeframe client-side. Doctors are fetched so zero-count doctors still list.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<AppointmentListItem[]>("/appointments?limit=500"),
      apiFetch<DoctorSummary[]>("/doctors"),
    ])
      .then(([appts, docs]) => {
        if (!active) return;
        // Analytics counts only the main appointments table. Pending (SCHEDULED)
        // WhatsApp bookings live in the "WhatsApp Appointments" popup until they're
        // accepted (which flips them to CONFIRMED), so they're excluded here.
        setItems(appts.filter((a) => a.status !== "SCHEDULED"));
        setDoctors(docs);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setDoctors([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rev]);

  // Summary cards — counts within the header timeframe (pending = confirmed
  // upcoming bookings, cancelled rolls in no-shows). SCHEDULED WhatsApp requests
  // are already filtered out of `items`.
  const cardCounts = useMemo<Record<StatKey, number>>(() => {
    const inTf = items.filter((a) => inRange(a.startTime, cardsTf));
    const by = (s: AppointmentListItem["status"]) => inTf.filter((a) => a.status === s).length;
    return {
      total: inTf.length,
      completed: by("COMPLETED"),
      pending: by("CONFIRMED"),
      cancelled: by("CANCELLED") + by("NO_SHOW"),
    };
  }, [items, cardsTf]);

  // Doctor performance — every doctor (incl. zero-count), counts within the
  // doctor-section timeframe.
  const doctorRows = useMemo<DoctorRow[]>(() => {
    const inTf = items.filter((a) => inRange(a.startTime, doctorTf));
    return doctors.map((d) => {
      const mine = inTf.filter((a) => a.doctor.id === d.id);
      const by = (s: AppointmentListItem["status"]) => mine.filter((a) => a.status === s).length;
      return {
        id: d.id,
        name: d.name ? `Dr. ${d.name}` : "Unassigned",
        counts: {
          total: mine.length,
          upcoming: by("CONFIRMED"),
          completed: by("COMPLETED"),
          noShow: by("NO_SHOW"),
          cancelled: by("CANCELLED"),
        },
      };
    });
  }, [items, doctors, doctorTf]);

  // Appointment counts grouped by consultation type (a joined "A, B" value counts
  // toward each type) and by lead source, within the shared counts timeframe.
  const consultRows = useMemo(
    () =>
      countBy(
        items.filter((a) => inRange(a.startTime, countsTf)),
        (a) => (a.consultationType ?? "").split(",").map((c) => c.trim()).filter(Boolean).map(titleCase),
      ),
    [items, countsTf],
  );
  const leadRows = useMemo(
    () =>
      countBy(
        items.filter((a) => inRange(a.startTime, countsTf)),
        (a) => {
          const s = a.sourceOfEnquiry?.trim();
          return s ? [s] : [];
        },
      ),
    [items, countsTf],
  );

  // Pie inputs. Zero-count categories are dropped (a 0° slice can't be seen).
  // Doctor Performance pie — the appointment-status breakdown within the doctor
  // timeframe (Pending / On going / Completed / No Show / Cancelled). Zero-count
  // statuses are dropped; the centre total is the sum of the shown slices.
  const doctorPie = useMemo<DonutDatum[]>(() => {
    const inTf = items.filter(
      (a) =>
        inRange(a.startTime, doctorTf) &&
        (!selectedDoctorId || a.doctor.id === selectedDoctorId),
    );
    return DOCTOR_STATUS_SLICES.map((s) => ({
      key: s.status,
      label: s.label,
      value: inTf.filter((a) => a.status === s.match).length,
    })).filter((d) => d.value > 0);
  }, [items, doctorTf, selectedDoctorId]);

  // Display name of the picked doctor (for the chart subtitle + drill-down).
  const selectedDoctorName = useMemo(
    () => (selectedDoctorId ? doctors.find((d) => d.id === selectedDoctorId)?.name ?? null : null),
    [doctors, selectedDoctorId],
  );
  // Consultation slices keep the (title-cased) label as their key — the
  // appointments filter matches on the upper-cased value.
  const consultPie = useMemo<DonutDatum[]>(
    () => consultRows.map((r) => ({ key: r.label, label: r.label, value: r.count })),
    [consultRows],
  );
  // Source slices keep the RAW source as key (that's what the appointments filter
  // expects) but display it proper-cased.
  const leadPie = useMemo<DonutDatum[]>(
    () => leadRows.map((r) => ({ key: r.label, label: properCase(r.label), value: r.count })),
    [leadRows],
  );

  /** Open the appointments list with the given deep-link filters (empty values
   *  are dropped): `doctorId`, `status`, `consultationType`, `source`. */
  function openAppointments(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    const qs = sp.toString();
    router.push(`/clinic-selection/${code}/appointments${qs ? `?${qs}` : ""}`);
  }
  const drillDown = (doctorId: string, status: string) => openAppointments({ doctorId, status });

  function exportCsv() {
    let header: string[];
    let lines: string[];
    if (tab === "doctor") {
      header = ["Doctor Name", ...DOCTOR_COLUMNS.map((c) => c.header)];
      lines = doctorRows.map((r) =>
        [r.name, ...DOCTOR_COLUMNS.map((c) => String(r.counts[c.key]))].map(csvCell).join(","),
      );
    } else {
      header = ["Category", "Label", "Count"];
      lines = [
        ...consultRows.map((r) => ["Consultation Type", r.label, String(r.count)].map(csvCell).join(",")),
        ...leadRows.map((r) => ["Source of Enquiry", r.label, String(r.count)].map(csvCell).join(",")),
      ];
    }
    const csv = [header.join(","), ...lines].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col gap-[48px]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-[16px]">
        <h1 className="flex-1 font-manrope text-[35px] font-bold leading-[44px] tracking-[-0.7px] text-[#1e1e24]">
          Insights Summary
        </h1>
        <TimeframeFilter timeframe={cardsTf} onChange={setCardsTf} />
        <IconButton label="Export analytics to CSV" tip="Export" onClick={exportCsv} icon="/dashboard/download.svg" />
      </div>

      {/* Stat cards */}
      <div className="flex shrink-0 flex-wrap gap-[28px] xl:flex-nowrap">
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            className="flex h-[200px] min-w-[220px] flex-1 flex-col justify-between overflow-hidden rounded-[28px] bg-[#0077c0] p-[24px]"
          >
            <div className="flex flex-col gap-[4.667px]">
              <span className="font-inter text-[42px] font-bold leading-[46.667px] text-white">
                {loading ? "—" : cardCounts[card.key]}
              </span>
              <span className="font-inter text-[18.667px] font-medium leading-[28px] text-white">
                {card.label}
              </span>
            </div>
            <div className="flex items-end justify-between pt-[12px]">
              <Image src={card.icon} alt="" width={40} height={40} className="size-10" />
              <button
                type="button"
                onClick={() => drillDown("", card.status)}
                className="cursor-pointer font-inter text-[16.333px] font-medium leading-[23.333px] text-white"
              >
                View all
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Segmented toggle: Doctor Performance | Consultation Type & Source of Enquiry */}
      <div className="flex shrink-0 flex-col gap-[28px]">
        <div className="flex w-fit items-center gap-[6px] rounded-full border-[1.2px] border-[#c2c6d4] p-[5px]">
          <TabButton label="Doctor Performance" active={tab === "doctor"} onClick={() => setTab("doctor")} />
          <TabButton
            label="Consultation Type & Source of Enquiry"
            active={tab === "counts"}
            onClick={() => setTab("counts")}
          />
        </div>

        {tab === "doctor" ? (
          <div className="flex flex-col gap-[24px]">
            <div className="flex flex-wrap items-center gap-[12px] self-start">
              <DoctorSelect doctors={doctors} value={selectedDoctorId} onChange={setSelectedDoctorId} />
              <TimeframeFilter timeframe={doctorTf} onChange={setDoctorTf} />
            </div>
            {/* A single chart: sits in the left column (same size as a count card)
                rather than stretching across the whole page. */}
            <div className="grid grid-cols-1 gap-[28px] xl:grid-cols-2">
              <ChartCard
                title="Doctor Performance :"
                subtitle={`${
                  selectedDoctorName ? `Dr. ${selectedDoctorName}` : "All Doctors"
                } — Appointment Status Breakdown`}
                loading={loading}
                data={doctorPie}
                onSelect={(status) => openAppointments({ doctorId: selectedDoctorId, status })}
              />
            </div>
          </div>
        ) : (
          // Same scale as the sections above: a single shared timeframe, then the
          // two pie charts side by side.
          <div className="flex flex-col gap-[24px]">
            <div className="self-start">
              <TimeframeFilter timeframe={countsTf} onChange={setCountsTf} />
            </div>
            <div className="grid grid-cols-1 items-start gap-[28px] xl:grid-cols-2">
              <ChartCard
                title="Consultation Type :"
                subtitle="Appointments analytics by Consultation Type"
                loading={loading}
                data={consultPie}
                onSelect={(key) => openAppointments({ consultationType: key.toUpperCase() })}
              />
              <ChartCard
                title="Source of Enquiry :"
                subtitle="Appointments analytics by source of enquiry"
                loading={loading}
                data={leadPie}
                onSelect={(key) => openAppointments({ source: key })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Doctor picker for the Doctor Performance section. Defaults to "All Doctors"
 * (every doctor's appointments); selecting one scopes the pie + drill-down to
 * that doctor. The dropdown also lists who the clinic's doctors are.
 */
function DoctorSelect({
  doctors,
  value,
  onChange,
}: {
  doctors: DoctorSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const named = doctors.filter((d) => d.name);
  const selected = value ? named.find((d) => d.id === value) : null;
  const label = selected ? `Dr. ${selected.name}` : "All Doctors";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[54px] items-center gap-[8px] rounded-full border-[1.167px] border-[#c2c6d4] px-[16.167px] transition-colors hover:border-[#0077c0]"
      >
        <span className="whitespace-nowrap font-inter text-[16px] font-medium text-[#1e1e24]">
          {label}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1e1e24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 flex max-h-[300px] w-[248px] flex-col gap-[2px] overflow-y-auto rounded-[15px] border border-[#c2c6d4] bg-white p-[8px] drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
          <DoctorOption
            label="All Doctors"
            selected={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          />
          {named.length === 0 ? (
            <span className="px-[12px] py-[10px] font-inter text-[13px] text-[#94a3b8]">
              No doctors.
            </span>
          ) : (
            named.map((d) => (
              <DoctorOption
                key={d.id}
                label={`Dr. ${d.name}`}
                selected={value === d.id}
                onClick={() => {
                  onChange(d.id);
                  setOpen(false);
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** One row inside the DoctorSelect dropdown. */
function DoctorOption({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-[8px] rounded-[8px] px-[12px] py-[10px] text-left font-inter text-[14px] transition-colors ${
        selected ? "bg-[#0077c0]/10 font-semibold text-[#0077c0]" : "text-[#1e1e24] hover:bg-[#0077c0]/[0.06]"
      }`}
    >
      <span className="truncate">{label}</span>
      {selected && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden>
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
    </button>
  );
}

/** One pill in the segmented toggle. */
function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full px-[22px] py-[11px] font-inter text-[15px] font-semibold transition-colors ${
        active ? "bg-[#0077c0] text-white" : "text-[#727783] hover:text-[#1e1e24]"
      }`}
    >
      {label}
    </button>
  );
}

/** Count a list into `{ label, count }[]`, sorted high → low (so the biggest
 *  slice / legend row comes first). */
function countBy(
  items: AppointmentListItem[],
  keys: (a: AppointmentListItem) => string[],
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of items) {
    for (const k of keys(a)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/* ----------------------------------------------------------------- chart card */

/** A bordered analytics card: title + hint, then the shared clickable donut chart.
 *  Every slice / legend row deep-links to the filtered appointments list. */
function ChartCard({
  title,
  subtitle,
  loading,
  data,
  onSelect,
}: {
  title: string;
  subtitle: string;
  loading: boolean;
  data: DonutDatum[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[24px] rounded-[28px] border-[1.2px] border-[#c2c6d4] bg-white p-[28px]">
      <div>
        <h3 className="font-inter text-[18px] font-bold uppercase leading-[24px] tracking-[0.4px] text-[#1e1e24]">
          {title}
        </h3>
        <p className="mt-[3px] font-inter text-[14px] leading-[20px] text-[#727783]">{subtitle}</p>
      </div>
      {loading ? (
        <p className="py-6 font-inter text-[15px] text-[#94a3b8]">Loading…</p>
      ) : (
        <DonutChart data={data} onSelect={onSelect} />
      )}
    </div>
  );
}

/** Circular outlined icon button used in the header + card toolbars. */
function IconButton({
  label,
  tip,
  onClick,
  icon,
}: {
  label: string;
  tip?: string;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group relative flex size-[54px] shrink-0 items-center justify-center rounded-full border-[1.4px] border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
    >
      <Image src={icon} alt="" width={28} height={28} className="size-7" />
      <Tip label={tip ?? label} below />
    </button>
  );
}
