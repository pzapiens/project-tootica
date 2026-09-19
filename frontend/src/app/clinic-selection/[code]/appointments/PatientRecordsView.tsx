"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  addDocument,
  addMedHistory,
  addObservation,
  addToothEntry,
  documentDownloadUrl,
  fetchRecordsLog,
  getPatientRecord,
  loadPatientRecord,
  removeDocument,
  removeMedHistory,
  removeObservation,
  removeToothEntry,
  updateMedHistory,
  updateObservation,
  updateToothEntry,
  useRecordsRevision,
  type DocCategory,
  type DocEntry,
  type LogTable,
  type MedHistoryEntry,
  type ObservationEntry,
  type RecordLogEntry,
  type ToothEntry,
} from "@/lib/patientRecordsStore";

import { exportMedHistoryXls, exportObservationsXls, exportPerioXls } from "@/lib/recordsExport";
import { Tip } from "@/components/HoverTip";

import AppointmentInfoDialog from "./AppointmentInfoDialog";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import { PERIO_TEETH, PERIO_VIEWBOX } from "./perioChartData";
import { useMe } from "../session";

/**
 * "Patient Records" view (Figma "Appts8 - Records1…7"), reached from an
 * appointment row's ⋮ → Records. Like the filter panel, it replaces the whole
 * appointments content area (with a back arrow to return to the table).
 *
 * Working sections:
 *  - Doctor/Clinic Observations — a free-text entry form that appends dated rows
 *    to a table (each editable / deletable), mirroring Medical History.
 *  - Perio-dental chart — a clinical chart image beside a "Tooth-wise Remarks"
 *    form that appends rows to a table (each editable / deletable).
 *  - Patient Medical History — dated free-text entries in a table.
 *
 * Everything persists per-patient on the backend via `lib/patientRecordsStore`
 * (`/api/patients/:patientId/records/...`). Each table exports to `.xls`.
 */

const CARD = "rounded-[8px] border border-[#c2c6d4] bg-white/50";
const LABEL = "font-inter text-[12px] font-medium uppercase tracking-[0.6px] text-[#1e1e24]";

export default function PatientRecordsView({
  patientName,
  patientCode,
  patientId,
  message = "",
  appointmentCode = "",
  appointmentDate = "",
  appointmentTime = "",
  onClose,
}: {
  patientName: string;
  patientCode: string;
  patientId: string;
  /** The appointment's notes — shown in the Additional Info dialog (Info icon). */
  message?: string;
  /** The appointment this records view was opened from (shown in the header card). */
  appointmentCode?: string;
  appointmentDate?: string;
  /** Time range, e.g. "09:00 AM - 09:30 AM" ("--" when the appointment has no time). */
  appointmentTime?: string;
  onClose: () => void;
}) {
  const rev = useRecordsRevision();
  const record = useMemo(() => getPatientRecord(patientId), [patientId, rev]);
  const [showInfo, setShowInfo] = useState(false);

  // The edit/delete audit log is admin-only (matches the gated backend endpoint).
  // `logTable` holds which table's log dialog is open (null = closed).
  const { user } = useMe();
  const isAdmin = user.role === "CLIENT_ADMIN" || user.role === "SUPER_ADMIN";
  const [logTable, setLogTable] = useState<LogTable | null>(null);

  // Hydrate this patient's records from the backend on open (the writers reload
  // it themselves after each change).
  useEffect(() => {
    loadPatientRecord(patientId).catch(() => {});
  }, [patientId]);

  // Every section commits immediately (add/edit/delete persist on click), so
  // leaving needs no unsaved-changes guard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="flex flex-1 flex-col gap-[48px]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-[15px]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to appointments"
            className="flex size-[44px] items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
          >
            <BackChevron className="h-[34px] w-[22px]" />
          </button>
          <div>
            <h1 className="font-manrope text-[32px] font-bold leading-[40px] tracking-[-0.6px] text-[#1e1e24]">
              Patient Records
            </h1>
            <p className="font-inter text-[15px] leading-[21px] text-[#1e1e24]">
              Manage the patient data and documentation.
            </p>
          </div>
        </div>

        {/* Info action + patient card */}
        <div className="flex shrink-0 items-center gap-[14px]">
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            aria-label="Additional info"
            className="group relative flex size-[44px] items-center justify-center rounded-full border border-[#c2c6d4] transition-colors hover:border-[#0077c0]"
          >
            <Image src="/dashboard/error.svg" alt="" width={24} height={24} className="size-6" />
            <Tip label="Info" />
          </button>

          {/* Patient card — compact: each column is a label with its value and a
              muted sub-line beneath (patient id / appointment date & time). */}
          <div
            className="flex items-stretch gap-[18px] rounded-[13px] border border-[#c2c6d4] px-[18px] py-[12px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
            style={{ backgroundImage: "linear-gradient(164.8deg, #ffffff 0%, #eff4ff 100%)" }}
          >
            <div className="flex flex-col gap-[1px]">
              <span className="font-inter text-[13px] font-medium tracking-[0.6px] text-[#1e1e24]">Patient Name</span>
              <span className="font-manrope text-[18px] font-semibold leading-[24px] text-[#1e1e24]">{patientName}</span>
              <span className="font-inter text-[13px] leading-[18px] text-[#727783]">{patientCode}</span>
            </div>

            {appointmentCode && (
              <>
                <span className="w-px self-stretch bg-[#c2c6d4]" />
                <div className="flex flex-col gap-[1px]">
                  <span className="font-inter text-[13px] font-medium tracking-[0.6px] text-[#1e1e24]">Appointment ID</span>
                  <span className="font-manrope text-[18px] font-semibold leading-[24px] text-[#1e1e24]">{appointmentCode}</span>
                  <span className="font-inter text-[13px] leading-[18px] text-[#727783]">
                    {appointmentDate || "--"}
                    {appointmentTime && appointmentTime !== "--" ? ` · ${appointmentTime}` : ""}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showInfo && (
        <AppointmentInfoDialog
          patientName={patientName}
          patientCode={patientCode}
          message={message}
          onClose={() => setShowInfo(false)}
        />
      )}

      {logTable && (
        <LogDialog patientId={patientId} table={logTable} onClose={() => setLogTable(null)} />
      )}

      <ObservationsSection
        patientId={patientId}
        patientName={patientName}
        patientCode={patientCode}
        entries={record.observations}
        currentUserId={user.id}
        isAdmin={isAdmin}
        onOpenLog={() => setLogTable("observation")}
      />

      <PerioSection
        patientId={patientId}
        patientName={patientName}
        patientCode={patientCode}
        teeth={record.teeth}
        currentUserId={user.id}
        isAdmin={isAdmin}
        onOpenLog={() => setLogTable("tooth")}
      />

      <MedicalHistorySection
        patientId={patientId}
        patientName={patientName}
        patientCode={patientCode}
        entries={record.medHistory}
        currentUserId={user.id}
        isAdmin={isAdmin}
        onOpenLog={() => setLogTable("medical-history")}
      />

      <DocumentUploadSection
        patientId={patientId}
        category="consent"
        icon="/dashboard/article.svg"
        title="Patient Consent Form"
        documents={record.documents.filter((d) => d.category === "consent")}
        isAdmin={isAdmin}
        onOpenLog={() => setLogTable("consent")}
      />

      <DocumentUploadSection
        patientId={patientId}
        category="xray"
        icon="/dashboard/hand_bones.svg"
        title="X-ray Document"
        documents={record.documents.filter((d) => d.category === "xray")}
        isAdmin={isAdmin}
        onOpenLog={() => setLogTable("xray")}
      />

      <DocumentUploadSection
        patientId={patientId}
        category="other"
        icon="/dashboard/library_books.svg"
        title="Other Documents"
        documents={record.documents.filter((d) => d.category === "other")}
        isAdmin={isAdmin}
        onOpenLog={() => setLogTable("other")}
      />
    </div>
  );
}

/* ------------------------------------------------ Doctor/Clinic Observations */

/** Doctor/Clinic Observations — a dated, editable list of free-text entries in a
 *  table. Mirrors {@link MedicalHistorySection}: a textarea with Discard / Add,
 *  then a table (SI No. / Observation / Date / Action) with inline edit + delete. */
function ObservationsSection({
  patientId,
  patientName,
  patientCode,
  entries,
  currentUserId,
  isAdmin,
  onOpenLog,
}: {
  patientId: string;
  patientName: string;
  patientCode: string;
  entries: ObservationEntry[];
  currentUserId: string;
  isAdmin: boolean;
  onOpenLog: () => void;
}) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ObservationEntry | null>(null);

  const canAdd = text.trim().length > 0;
  const GRID = "grid-cols-[minmax(0,72px)_minmax(0,1fr)_minmax(0,150px)_minmax(0,120px)]";

  function add() {
    if (!canAdd) return;
    addObservation(patientId, text.trim());
    setText("");
  }
  function saveEdit() {
    if (editingId && editText.trim()) updateObservation(patientId, editingId, editText.trim());
    setEditingId(null);
    setEditText("");
  }

  return (
    <section className={`${CARD} flex flex-col gap-[17px] p-[26px]`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-[16px]">
          <Image src="/dashboard/note_alt.svg" alt="" width={48} height={48} className="size-[48px] shrink-0" />
          <div>
            <h2 className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">
              Doctor/Clinic Observations
            </h2>
            <p className="font-manrope text-[15px] leading-[21px] text-[#1e1e24]">
              Add your remarks regarding your observations.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          {isAdmin && <LogButton onClick={onOpenLog} />}
          <ExportButton
            enabled={entries.length > 0}
            onClick={() => exportObservationsXls(patientName, patientCode, entries)}
          />
        </div>
      </div>

      {/* New-entry textarea with Discard / Add */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter your observation"
          className="h-[136px] w-full resize-none rounded-[8px] border border-b-2 border-[#1e1e24] bg-white px-[18px] pb-[44px] pt-[18px] font-inter text-[15px] leading-[21px] text-[#1e1e24] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#c2c6d4]"
        />
        <div className="absolute bottom-[14px] right-[14px] flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => setText("")}
            disabled={!canAdd}
            className="rounded-[13px] px-[10px] py-[8px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="rounded-[13px] px-[10px] py-[8px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Entries table */}
      <div className="overflow-hidden rounded-[12px] border border-[#c2c6d4] bg-white">
        <div className={`grid ${GRID} items-center border-b border-[#c2c6d4] px-[24px]`}>
          {["SI No.", "Observation", "Date"].map((h) => (
            <span key={h} className="py-[18px] font-inter text-[14px] font-semibold uppercase tracking-[0.7px] text-[#1e1e24]">
              {h}
            </span>
          ))}
          <span className="py-[18px] text-right font-inter text-[14px] font-semibold uppercase tracking-[0.7px] text-[#1e1e24]">
            Action
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="px-[24px] py-[28px] text-center font-inter text-[14px] text-[#94a3b8]">
            No observations yet. Add one above.
          </p>
        ) : (
          entries.map((e, i) => {
            const editing = editingId === e.id;
            return (
              <div key={e.id} className={`grid ${GRID} items-center border-b border-[#c2c6d4] px-[24px] last:border-b-0`}>
                <span className="py-[20px] font-inter text-[15px] text-[#1e1e24]">{String(i + 1).padStart(3, "0")}</span>
                <div className="py-[20px] pr-3">
                  {editing ? (
                    <input
                      value={editText}
                      onChange={(ev) => setEditText(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") saveEdit();
                      }}
                      autoFocus
                      className="w-full rounded-full border border-[#1e1e24] px-[16px] py-[6px] font-inter text-[15px] text-[#1e1e24] outline-none"
                    />
                  ) : (
                    <span className="font-inter text-[15px] text-[#1e1e24]">{e.text}</span>
                  )}
                </div>
                <span className="py-[20px] font-inter text-[15px] text-[#1e1e24]">{e.date}</span>
                <div className="flex items-center justify-end gap-[6px] py-[20px]">
                  {isAdmin || !e.createdById || e.createdById === currentUserId ? (
                    <>
                      {editing ? (
                        <button
                          type="button"
                          onClick={saveEdit}
                          aria-label="Save observation"
                          className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
                        >
                          <Image src="/dashboard/save.svg" alt="" width={22} height={22} className="size-[22px]" />
                          <Tip label="Save" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(e.id);
                            setEditText(e.text);
                          }}
                          aria-label="Edit observation"
                          className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
                        >
                          <Image src="/dashboard/edit_square.svg" alt="" width={22} height={22} className="size-[22px]" />
                          <Tip label="Edit" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPendingDelete(e)}
                        aria-label="Delete observation"
                        className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#fef2f2]"
                      >
                        <Image src="/dashboard/delete.svg" alt="" width={22} height={22} className="size-[22px]" />
                        <Tip label="Delete" />
                      </button>
                    </>
                  ) : (
                    <span className="font-inter text-[13px] text-[#94a3b8]" title="Only the creator can edit or delete this entry">—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <ConfirmDeleteDialog
          title="Delete Observation?"
          message={
            <>
              Are you sure you want to delete this observation (
              <span className="font-semibold text-[#0077c0]">{pendingDelete.text}</span>)? This action
              cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            if (editingId === pendingDelete.id) {
              setEditingId(null);
              setEditText("");
            }
            removeObservation(patientId, pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------- Perio-dental chart */

// The chart backdrop is public/dashboard/perio_chart.svg (already FDI-numbered).
// PERIO_TEETH holds one exact closed outline path per tooth (in the SVG's own
// viewBox), split out of the SVG's two compound arch paths — see perioChartData.ts.
const VALID_FDI = new Set(PERIO_TEETH.map((t) => t.n));

/** Interactive FDI odontogram. The chart SVG renders as the backdrop; an overlay
 *  SVG in the same coordinate system draws one exact, clickable path per tooth
 *  that fills blue when selected (a fainter fill when it carries remarks).
 *  Clicking a tooth calls `onSelect`. */
function PerioChart({
  teeth,
  selected,
  onSelect,
}: {
  teeth: ToothEntry[];
  selected: string;
  onSelect: (n: string) => void;
}) {
  const withRemarks = useMemo(() => new Set(teeth.map((t) => t.toothNo)), [teeth]);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      className="relative w-full overflow-hidden rounded-[8px] border border-[#1e1e24] bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]"
      style={{ aspectRatio: "2588.91 / 3847.59" }}
    >
      {/* Chart line-art (already FDI-numbered). */}
      <Image
        src="/dashboard/perio_chart.svg"
        alt="Perio-dental chart"
        fill
        unoptimized
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-contain"
      />

      {/* One exact, clickable path per tooth, aligned to the backdrop. The
          selected tooth fills solid; teeth carrying remarks get a fainter fill.
          Styles are inline (not Tailwind arbitrary classes) so state can't bleed
          between teeth. */}
      <svg viewBox={PERIO_VIEWBOX} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {PERIO_TEETH.map((t) => {
          const sel = selected === t.n;
          const rem = withRemarks.has(t.n);
          return (
            <path
              key={t.n}
              d={t.d}
              onClick={() => onSelect(t.n)}
              onMouseEnter={() => setHovered(t.n)}
              onMouseLeave={() => setHovered((h) => (h === t.n ? null : h))}
              role="button"
              aria-label={`Tooth ${t.n}${rem ? ", has remarks" : ""}`}
              aria-pressed={sel}
              style={{
                fill: "#0077c0",
                fillOpacity: sel ? 0.45 : rem ? 0.22 : hovered === t.n ? 0.16 : 0,
                pointerEvents: "fill",
                cursor: "pointer",
                transition: "fill-opacity 150ms",
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}

function PerioSection({
  patientId,
  patientName,
  patientCode,
  teeth,
  currentUserId,
  isAdmin,
  onOpenLog,
}: {
  patientId: string;
  patientName: string;
  patientCode: string;
  teeth: ToothEntry[];
  currentUserId: string;
  isAdmin: boolean;
  onOpenLog: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  const [tooth, setTooth] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ToothEntry | null>(null);

  const canAdd = remarks.trim().length > 0 && VALID_FDI.has(tooth);

  // When a tooth is selected on the chart, the table shows only that tooth's
  // remarks; with none selected it lists them all.
  const visibleTeeth = tooth ? teeth.filter((t) => t.toothNo === tooth) : teeth;

  function submit() {
    if (!canAdd) return;
    if (editingId) updateToothEntry(patientId, editingId, tooth, remarks.trim());
    else addToothEntry(patientId, tooth, remarks.trim());
    setRemarks("");
    setEditingId(null);
    // Keep `tooth` selected so the table stays filtered to just that tooth after
    // an add/update; the "Show all" button is how the user clears the filter.
  }

  function edit(id: string) {
    const entry = teeth.find((t) => t.id === id);
    if (!entry) return;
    setEditingId(id);
    setRemarks(entry.remarks);
    setTooth(entry.toothNo);
  }

  return (
    <section className="flex flex-col gap-[32px]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-manrope text-[30px] font-bold leading-[38px] tracking-[-0.6px] text-[#1e1e24]">
            Perio-dental chart
          </h2>
          <p className="font-inter text-[16px] leading-[24px] text-[#1e1e24]">
            Review the periodontal analysis and findings for each tooth below.
          </p>
        </div>
        <div className="flex items-center gap-[10px]">
          {isAdmin && <LogButton onClick={onOpenLog} />}
          <ExportButton
            enabled={teeth.length > 0}
            onClick={() => exportPerioXls(patientName, patientCode, teeth)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-[32px] lg:grid-cols-2">
        {/* Left: interactive FDI odontogram over the reference chart image. */}
        <PerioChart teeth={teeth} selected={tooth} onSelect={setTooth} />

        {/* Right: tooth-wise remarks form + table. On lg the column is given the
            chart's aspect ratio (same column width → same height), so the table
            below fills the leftover space and scrolls once its rows would grow
            past the chart's height. */}
        <div className="flex flex-col gap-[32px] lg:min-h-0 lg:overflow-hidden lg:[aspect-ratio:0.6729]">
          <div className={`${CARD} flex shrink-0 flex-col gap-[16px] bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]`}>
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center gap-[8px]">
                <Image src="/dashboard/note_stack.svg" alt="" width={24} height={24} className="size-6" />
                <h3 className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
                  Tooth-wise Remarks
                </h3>
              </div>
              <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
                Select a tooth on the chart, then record its remarks.
              </p>
            </div>

            <div className="flex items-start gap-[16px]">
              <div className="flex flex-1 flex-col gap-[8px]">
                <span className={LABEL}>Remarks</span>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter the tooth remarks."
                  className="h-[80px] w-full resize-none rounded-[8px] border border-[#1e1e24] px-[13px] py-[11px] font-inter text-[14px] leading-[20px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4]"
                />
              </div>
              <div className="flex w-[129px] flex-col gap-[8px]">
                <span className={LABEL}>Tooth Number</span>
                <div
                  className={`flex h-[40px] items-center justify-center rounded-[8px] border font-inter text-[16px] font-semibold ${
                    tooth ? "border-[#0077c0] text-[#0077c0]" : "border-[#1e1e24] text-[#c2c6d4]"
                  }`}
                >
                  {tooth || "Select"}
                </div>
              </div>
            </div>

            {/* Add Entry — right-aligned under the Tooth Number field. */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={submit}
                disabled={!canAdd}
                className={`flex min-w-[129px] items-center justify-center gap-[6px] whitespace-nowrap rounded-[8px] px-[16px] py-[9px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-opacity ${
                  canAdd ? "bg-[#0077c0] hover:opacity-90" : "bg-[#0077c0] opacity-50"
                }`}
              >
                <Image src="/dashboard/add.svg" alt="" width={18} height={18} className="size-[18px] shrink-0" />
                {editingId ? "Update" : "Add Entry"}
              </button>
            </div>
          </div>

          {/* Table title + table, grouped tightly. The title reflects the
              current tooth filter, with a Show-all toggle when one is selected. */}
          <div className="flex flex-col gap-[12px] lg:min-h-0 lg:flex-1">
          <div className="flex shrink-0 items-center justify-between">
            <span className="font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#727783]">
              {tooth ? `Remarks — Tooth ${tooth}` : "All tooth-wise remarks"}
            </span>
            {tooth && (
              <button
                type="button"
                onClick={() => {
                  setTooth("");
                  setRemarks("");
                  setEditingId(null);
                }}
                className="font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80"
              >
                Show all
              </button>
            )}
          </div>

          {/* Tooth-wise table — scrolls within the column once its rows would
              exceed the chart height (see the column's aspect-ratio above). */}
          <div className="overflow-hidden rounded-[11px] border border-[#c2c6d4] bg-white lg:min-h-0 lg:overflow-y-auto">
            <div className="sticky top-0 z-[1] grid grid-cols-[minmax(0,80fr)_minmax(0,200fr)_minmax(0,150fr)] items-center border-b border-[#c2c6d4] bg-white px-[16px]">
              {["Tooth No", "Remarks", "Date"].map((h) => (
                <span key={h} className="py-[18px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24]">
                  {h}
                </span>
              ))}
            </div>
            {visibleTeeth.length === 0 ? (
              <p className="px-[16px] py-[28px] text-center font-inter text-[14px] text-[#94a3b8]">
                {tooth
                  ? `No remarks for tooth ${tooth} yet. Add one above.`
                  : "No tooth-wise remarks yet. Add one above."}
              </p>
            ) : (
              visibleTeeth.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[minmax(0,80fr)_minmax(0,200fr)_minmax(0,150fr)] items-center border-b border-[#c2c6d4] px-[16px] last:border-b-0"
                >
                  <span className="py-[20px] font-inter text-[14px] font-medium text-[#1e1e24]">{t.toothNo}</span>
                  <span className="py-[20px] pr-2 font-inter text-[14px] text-[#1e1e24]">{t.remarks}</span>
                  <div className="flex items-center justify-between gap-2 py-[20px]">
                    <span className="font-inter text-[14px] font-medium text-[#1e1e24]">{t.date}</span>
                    {isAdmin || !t.createdById || t.createdById === currentUserId ? (
                      <div className="flex items-center gap-[6px]">
                        <button
                          type="button"
                          onClick={() => edit(t.id)}
                          aria-label={`Edit tooth ${t.toothNo} remark`}
                          className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
                        >
                          <Image src="/dashboard/edit_square.svg" alt="" width={22} height={22} className="size-[22px]" />
                          <Tip label="Edit" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(t)}
                          aria-label={`Delete tooth ${t.toothNo} remark`}
                          className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#fef2f2]"
                        >
                          <Image src="/dashboard/delete.svg" alt="" width={22} height={22} className="size-[22px]" />
                          <Tip label="Delete" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-inter text-[13px] text-[#94a3b8]" title="Only the creator can edit or delete this entry">—</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          </div>
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDeleteDialog
          title="Delete Remark?"
          message={
            <>
              Are you sure you want to delete the remark for{" "}
              <span className="font-semibold text-[#0077c0]">tooth {pendingDelete.toothNo}</span> (
              {pendingDelete.remarks})? This action cannot be undone.
            </>
          }
          confirmLabel="Delete Remark"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            if (editingId === pendingDelete.id) {
              setEditingId(null);
              setRemarks("");
              setTooth("");
            }
            removeToothEntry(patientId, pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}

/* ---------------------------------------------------- Patient Medical History */

function MedicalHistorySection({
  patientId,
  patientName,
  patientCode,
  entries,
  currentUserId,
  isAdmin,
  onOpenLog,
}: {
  patientId: string;
  patientName: string;
  patientCode: string;
  entries: MedHistoryEntry[];
  currentUserId: string;
  isAdmin: boolean;
  onOpenLog: () => void;
}) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MedHistoryEntry | null>(null);

  const canAdd = text.trim().length > 0;
  const GRID = "grid-cols-[minmax(0,72px)_minmax(0,1fr)_minmax(0,150px)_minmax(0,120px)]";

  function add() {
    if (!canAdd) return;
    addMedHistory(patientId, text.trim());
    setText("");
  }
  function saveEdit() {
    if (editingId && editText.trim()) updateMedHistory(patientId, editingId, editText.trim());
    setEditingId(null);
    setEditText("");
  }

  return (
    <section className={`${CARD} flex flex-col gap-[17px] p-[26px]`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-[16px]">
          <Image src="/dashboard/medical_information.svg" alt="" width={48} height={48} className="size-[48px] shrink-0" />
          <div>
            <h2 className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">
              Patient Medical History
            </h2>
            <p className="font-manrope text-[15px] leading-[21px] text-[#1e1e24]">
              Add the patient medical history below.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-[10px]">
          {isAdmin && <LogButton onClick={onOpenLog} />}
          <ExportButton
            enabled={entries.length > 0}
            onClick={() => exportMedHistoryXls(patientName, patientCode, entries)}
          />
        </div>
      </div>

      {/* New-entry textarea with Discard / Add */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter the medical history here."
          className="h-[136px] w-full resize-none rounded-[8px] border border-b-2 border-[#1e1e24] bg-white px-[18px] pb-[44px] pt-[18px] font-inter text-[15px] leading-[21px] text-[#1e1e24] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#c2c6d4]"
        />
        <div className="absolute bottom-[14px] right-[14px] flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => setText("")}
            disabled={!canAdd}
            className="rounded-[13px] px-[10px] py-[8px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="rounded-[13px] px-[10px] py-[8px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* Entries table */}
      <div className="overflow-hidden rounded-[12px] border border-[#c2c6d4] bg-white">
        <div className={`grid ${GRID} items-center border-b border-[#c2c6d4] px-[24px]`}>
          {["SI No.", "Medical History", "Date"].map((h) => (
            <span key={h} className="py-[18px] font-inter text-[14px] font-semibold uppercase tracking-[0.7px] text-[#1e1e24]">
              {h}
            </span>
          ))}
          <span className="py-[18px] text-right font-inter text-[14px] font-semibold uppercase tracking-[0.7px] text-[#1e1e24]">
            Action
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="px-[24px] py-[28px] text-center font-inter text-[14px] text-[#94a3b8]">
            No medical history yet. Add one above.
          </p>
        ) : (
          entries.map((e, i) => {
            const editing = editingId === e.id;
            return (
              <div key={e.id} className={`grid ${GRID} items-center border-b border-[#c2c6d4] px-[24px] last:border-b-0`}>
                <span className="py-[20px] font-inter text-[15px] text-[#1e1e24]">{String(i + 1).padStart(3, "0")}</span>
                <div className="py-[20px] pr-3">
                  {editing ? (
                    <input
                      value={editText}
                      onChange={(ev) => setEditText(ev.target.value)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") saveEdit();
                      }}
                      autoFocus
                      className="w-full rounded-full border border-[#1e1e24] px-[16px] py-[6px] font-inter text-[15px] text-[#1e1e24] outline-none"
                    />
                  ) : (
                    <span className="font-inter text-[15px] text-[#1e1e24]">{e.text}</span>
                  )}
                </div>
                <span className="py-[20px] font-inter text-[15px] text-[#1e1e24]">{e.date}</span>
                <div className="flex items-center justify-end gap-[6px] py-[20px]">
                  {isAdmin || !e.createdById || e.createdById === currentUserId ? (
                    <>
                      {editing ? (
                        <button
                          type="button"
                          onClick={saveEdit}
                          aria-label="Save medical history"
                          className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
                        >
                          <Image src="/dashboard/save.svg" alt="" width={22} height={22} className="size-[22px]" />
                          <Tip label="Save" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(e.id);
                            setEditText(e.text);
                          }}
                          aria-label="Edit medical history"
                          className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
                        >
                          <Image src="/dashboard/edit_square.svg" alt="" width={22} height={22} className="size-[22px]" />
                          <Tip label="Edit" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPendingDelete(e)}
                        aria-label="Delete medical history"
                        className="group relative flex size-[34px] items-center justify-center rounded-full transition-colors hover:bg-[#fef2f2]"
                      >
                        <Image src="/dashboard/delete.svg" alt="" width={22} height={22} className="size-[22px]" />
                        <Tip label="Delete" />
                      </button>
                    </>
                  ) : (
                    <span className="font-inter text-[13px] text-[#94a3b8]" title="Only the creator can edit or delete this entry">—</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <ConfirmDeleteDialog
          title="Delete Medical History?"
          message={
            <>
              Are you sure you want to delete this medical history entry (
              <span className="font-semibold text-[#0077c0]">{pendingDelete.text}</span>)? This action
              cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            if (editingId === pendingDelete.id) {
              setEditingId(null);
              setEditText("");
            }
            removeMedHistory(patientId, pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}

/* ---------------------------------------------------- Document upload sections */

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const MAX_BYTES = 10 * 1024 * 1024;
const VALID_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function isValidFile(f: File): boolean {
  const okExt = /\.(pdf|jpe?g|png)$/i.test(f.name);
  // Some browsers report an empty MIME type for drag-drop; fall back to the ext.
  const okType = f.type === "" || VALID_TYPES.includes(f.type);
  return okExt && okType && f.size <= MAX_BYTES;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * A file-upload section (Figma "PC Form" / "X-ray Doc"): a header (icon + title),
 * a drag-and-drop / click drop zone (PDF/JPG/JPEG/PNG ≤10 MB) and the accepted
 * files shown as cards with view / download / delete. Shared by the Consent Form
 * and X-ray sections — `category` scopes each section's own documents. There's no
 * upload backend, so only metadata persists; the bytes live in memory for the
 * session (object URLs power view/download until they're revoked).
 */
function DocumentUploadSection({
  patientId,
  category,
  icon,
  title,
  documents,
  isAdmin,
  onOpenLog,
}: {
  patientId: string;
  category: DocCategory;
  icon: string;
  title: string;
  documents: DocEntry[];
  isAdmin: boolean;
  onOpenLog: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DocEntry | null>(null);

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    let rejected = 0;
    for (const file of Array.from(list)) {
      if (!isValidFile(file)) {
        rejected += 1;
        continue;
      }
      // Uploads to the backend; the store reloads the record on success.
      void addDocument(patientId, category, file);
    }
    setError(
      rejected > 0
        ? `${rejected} file${rejected > 1 ? "s" : ""} skipped — only PDF, JPG, JPEG or PNG up to 10 MB are allowed.`
        : "",
    );
  }

  function handleDownload(d: DocEntry) {
    // Same-origin GET; cookies authorise it. Opens inline (PDF/image) in a new tab.
    window.open(documentDownloadUrl(patientId, d.id), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-[8px] border border-[#c2c6d4] bg-white p-[26px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-[8px]">
          <Image src={icon} alt="" width={32} height={32} className="size-8 shrink-0" />
          <h2 className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">{title}</h2>
        </div>
        {isAdmin && <LogButton onClick={onOpenLog} />}
      </div>

      {/* Upload drop zone */}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`mt-[24px] flex cursor-pointer flex-col items-center justify-center gap-[15px] rounded-[17px] border px-[35px] py-[40px] shadow-[inset_0px_2px_4px_1px_rgba(0,0,0,0.05)] transition-colors ${
          dragOver ? "border-[#0077c0] bg-[#e6f2fb]" : "border-[#1e1e24] bg-[#f1f5f9]"
        }`}
      >
        <Image src="/dashboard/upload_file.svg" alt="" width={32} height={32} className="size-8" />
        <p className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">Drop Files Here</p>
        <p className="max-w-[410px] text-center font-inter text-[15px] leading-[21px] text-[#1e1e24]">
          Upload your documents in PDF, JPG, JPEG, or PNG format. Each file must not exceed 10 MB in size.
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          className="rounded-[13px] bg-[#0077c0] px-[17px] py-[6px] font-inter text-[13px] font-medium tracking-[0.6px] text-white transition-colors hover:bg-[#0069a8]"
        >
          Upload Files
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-[12px] font-inter text-[13px] text-[#ba1a1a]">
          {error}
        </p>
      )}

      {/* Uploaded documents */}
      <h3 className="mt-[24px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24]">
        Uploaded Documents
      </h3>
      {documents.length === 0 ? (
        <p className="mt-[10px] font-inter text-[14px] text-[#94a3b8]">No documents uploaded yet.</p>
      ) : (
        <div className="mt-[12px] grid grid-cols-1 gap-[16px] lg:grid-cols-2">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-[8px] rounded-[8px] border border-[#1e1e24] px-[18px] py-[14px]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-inter text-[15px] font-bold text-[#1e1e24]">{d.name}</p>
                <p className="font-inter text-[13px] tracking-[0.6px] text-[#1e1e24]">
                  {formatSize(d.size)} • {d.dateTime}
                  {d.createdByName ? ` • ${d.createdByName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(d)}
                aria-label={`Download ${d.name}`}
                className="group relative flex size-[40px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#f1f5f9]"
              >
                <Image src="/dashboard/download.svg" alt="" width={24} height={24} className="size-6" />
                <Tip label="Download" />
              </button>
              <span className="mx-[2px] h-[22px] w-px shrink-0 bg-[#c2c6d4]" />
              <button
                type="button"
                onClick={() => setPendingDelete(d)}
                aria-label={`Delete ${d.name}`}
                className="group relative flex size-[40px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[#fef2f2]"
              >
                <Image src="/dashboard/delete.svg" alt="" width={24} height={24} className="size-6" />
                <Tip label="Delete" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          title="Delete Document?"
          message={
            <>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-[#0077c0]">{pendingDelete.name}</span>? This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            void removeDocument(patientId, pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ helpers */

function ExportButton({ enabled, onClick }: { enabled: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={`shrink-0 rounded-[13px] bg-[#0077c0] px-[26px] py-[9px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)] transition-opacity ${
        enabled ? "hover:opacity-90" : "cursor-not-allowed opacity-50"
      }`}
    >
      Export
    </button>
  );
}

function BackChevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M18 3L5 17l13 14" />
    </svg>
  );
}

/* --------------------------------------------------------------- change log */

const LOG_TITLES: Record<LogTable, string> = {
  observation: "Doctor/Clinic Observations",
  tooth: "Tooth-wise Remarks",
  "medical-history": "Patient Medical History",
  consent: "Patient Consent Form",
  xray: "X-ray Document",
  other: "Other Documents",
};

// Badge label + colour per log action (falls back to the raw action string).
// Text tables use CREATE/UPDATE/DELETE; document sections use UPLOAD/DOWNLOAD/DELETE.
const LOG_ACTIONS: Record<string, { label: string; cls: string }> = {
  CREATE: { label: "Create", cls: "bg-[#e7f7ec] text-[#15803d]" },
  UPLOAD: { label: "Upload", cls: "bg-[#e7f7ec] text-[#15803d]" },
  UPDATE: { label: "Edit", cls: "bg-[#e6f2fb] text-[#0077c0]" },
  DOWNLOAD: { label: "Download", cls: "bg-[#eef2ff] text-[#4338ca]" },
  DELETE: { label: "Delete", cls: "bg-[#fdecec] text-[#c0202b]" },
};

const DOC_TABLES = new Set<LogTable>(["consent", "xray", "other"]);

/** ISO timestamp → "dd/mm/yyyy, hh:mm AM/PM" (local). */
function fmtLogDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const period = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(h)}:${pad(d.getMinutes())} ${period}`;
}

/** Outlined "history" icon button (admins only) that opens a table's change log. */
function LogButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="View change log"
      className="group relative flex size-[40px] items-center justify-center rounded-full border border-[#c2c6d4] text-[#1e1e24] transition-colors hover:border-[#0077c0] hover:text-[#0077c0]"
    >
      <LogIcon className="size-[22px]" />
      <Tip label="Log" />
    </button>
  );
}

function LogIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const LOG_GRID = "grid-cols-[minmax(0,155px)_minmax(0,84px)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,150px)]";
// Document sections log a single file name (no before/after), so their table is
// Date & Time · Action · File Name · User.
const LOG_GRID_DOC = "grid-cols-[minmax(0,180px)_minmax(0,120px)_minmax(0,1fr)_minmax(0,170px)]";

/**
 * Change-log dialog for one records table (admins only). Fetches the patient's
 * audit log fresh on open and lists this table's edits/deletions — date & time,
 * action, the data before and after, and the user who made the change.
 */
function LogDialog({
  patientId,
  table,
  onClose,
}: {
  patientId: string;
  table: LogTable;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<RecordLogEntry[] | null>(null);
  const [error, setError] = useState("");
  const isDoc = DOC_TABLES.has(table);
  const grid = isDoc ? LOG_GRID_DOC : LOG_GRID;
  const headers = isDoc
    ? ["Date & Time", "Action", "File Name", "User"]
    : ["Date & Time", "Action", "Previous", "Updated", "User"];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    fetchRecordsLog(patientId)
      .then((all) => {
        if (active) setLogs(all.filter((l) => l.table === table));
      })
      .catch(() => {
        if (!active) return;
        setError("Couldn't load the change log.");
        setLogs([]);
      });
    return () => {
      active = false;
    };
  }, [patientId, table]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="records-log-title"
        className="my-auto flex max-h-[86vh] w-full max-w-[880px] flex-col gap-[18px] rounded-[15px] border border-[#c2c6d4] bg-white p-[26px] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="records-log-title" className="font-manrope text-[22px] font-semibold leading-[30px] text-[#1e1e24]">
              Change Log
            </h2>
            <p className="font-inter text-[14px] leading-[20px] text-[#727783]">
              {LOG_TITLES[table]} — edits and deletions, newest first.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[36px] shrink-0 items-center justify-center rounded-full text-[#1e1e24] transition-colors hover:bg-[#f1f5f9]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="size-5" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        {logs === null ? (
          <p className="py-8 text-center font-inter text-[14px] text-[#94a3b8]">Loading…</p>
        ) : error ? (
          <p role="alert" className="py-8 text-center font-inter text-[14px] text-[#ba1a1a]">
            {error}
          </p>
        ) : logs.length === 0 ? (
          <p className="py-8 text-center font-inter text-[14px] text-[#94a3b8]">
            No edits or deletions recorded yet.
          </p>
        ) : (
          <div className="overflow-auto rounded-[12px] border border-[#c2c6d4]">
            <div className={`grid ${grid} min-w-[680px] items-center border-b border-[#c2c6d4] bg-[#f8fafc] px-[18px]`}>
              {headers.map((h) => (
                <span key={h} className="py-[14px] font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24]">
                  {h}
                </span>
              ))}
            </div>
            {logs.map((l) => {
              const meta = LOG_ACTIONS[l.action] ?? { label: l.action, cls: "bg-[#f1f5f9] text-[#1e1e24]" };
              return (
                <div
                  key={l.id}
                  className={`grid ${grid} min-w-[680px] items-start border-b border-[#c2c6d4] px-[18px] last:border-b-0`}
                >
                  <span className="py-[14px] pr-2 font-inter text-[13px] leading-[18px] text-[#1e1e24]">
                    {fmtLogDateTime(l.createdAt)}
                  </span>
                  <div className="py-[14px]">
                    <span className={`inline-flex rounded-full px-[10px] py-[3px] font-inter text-[12px] font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>
                  {isDoc ? (
                    // Documents: a single File Name column (name lives in whichever
                    // snapshot the action set — updated for upload/download, previous for delete).
                    <span className="py-[14px] pr-3 font-inter text-[13px] leading-[18px] text-[#1e1e24]">
                      {l.updated ?? l.previous ?? "—"}
                    </span>
                  ) : (
                    <>
                      <span className="py-[14px] pr-3 font-inter text-[13px] leading-[18px] text-[#1e1e24]">
                        {l.previous ?? "—"}
                      </span>
                      <span className="py-[14px] pr-3 font-inter text-[13px] leading-[18px] text-[#1e1e24]">
                        {l.updated ?? "—"}
                      </span>
                    </>
                  )}
                  <span className="py-[14px] font-inter text-[13px] leading-[18px] text-[#1e1e24]">
                    {l.userName}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
