"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  addDocument,
  addMedHistory,
  addToothEntry,
  getPatientRecord,
  removeDocument,
  removeMedHistory,
  removeToothEntry,
  setObservation,
  updateMedHistory,
  updateToothEntry,
  useRecordsRevision,
  type DocCategory,
  type DocEntry,
  type MedHistoryEntry,
  type ToothEntry,
} from "@/lib/patientRecordsStore";

import { exportMedHistoryXls, exportObservationPdf, exportPerioXls } from "@/lib/recordsExport";
import { deleteDocFile, getDocFile, putDocFile } from "@/lib/documentFiles";

import ConfirmDeleteDialog from "./ConfirmDeleteDialog";

/**
 * "Patient Records" view (Figma "Appts8 - Records1…7"), reached from an
 * appointment row's ⋮ → Records. Like the filter panel, it replaces the whole
 * appointments content area (with a back arrow to return to the table).
 *
 * Two working sections:
 *  - Doctor/Clinic Observations — a free-text note with Save / Discard (shows
 *    "Saved" once persisted).
 *  - Perio-dental chart — a clinical chart image beside a "Tooth-wise Remarks"
 *    form that appends rows to a table (each editable / deletable).
 *
 * There's no records backend yet, so everything persists per-patient in
 * localStorage via `lib/patientRecordsStore`. Export is a placeholder.
 */

const CARD = "rounded-[8px] border border-[#c2c6d4] bg-white/50";
const LABEL = "font-inter text-[12px] font-medium uppercase tracking-[0.6px] text-[#1e1e24]";
const MAX_TOOTH = 32;

export default function PatientRecordsView({
  patientName,
  patientCode,
  patientId,
  onClose,
}: {
  patientName: string;
  patientCode: string;
  patientId: string;
  onClose: () => void;
}) {
  const rev = useRecordsRevision();
  const record = useMemo(() => getPatientRecord(patientId), [patientId, rev]);

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
      <div className="flex shrink-0 items-start justify-between gap-4">
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

        {/* Patient card */}
        <div
          className="flex shrink-0 items-center gap-[17px] rounded-[13px] border border-[#c2c6d4] px-[18px] py-[16px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
          style={{ backgroundImage: "linear-gradient(164.8deg, #ffffff 0%, #eff4ff 100%)" }}
        >
          <div className="flex flex-col gap-[4px]">
            <span className="font-inter text-[13px] font-medium tracking-[0.6px] text-[#1e1e24]">Patient Name</span>
            <span className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">{patientName}</span>
          </div>
          <span className="h-[43px] w-px bg-[#c2c6d4]" />
          <div className="flex flex-col gap-[4px]">
            <span className="font-inter text-[13px] font-medium tracking-[0.6px] text-[#1e1e24]">Patient ID</span>
            <span className="font-manrope text-[15px] font-semibold leading-[21px] text-[#1e1e24]">{patientCode}</span>
          </div>
        </div>
      </div>

      <ObservationsCard
        patientName={patientName}
        patientCode={patientCode}
        value={record.observation}
        onSave={(text) => setObservation(patientId, text)}
      />

      <PerioSection
        patientId={patientId}
        patientName={patientName}
        patientCode={patientCode}
        teeth={record.teeth}
      />

      <MedicalHistorySection
        patientId={patientId}
        patientName={patientName}
        patientCode={patientCode}
        entries={record.medHistory}
      />

      <DocumentUploadSection
        patientId={patientId}
        category="consent"
        icon="/dashboard/article.svg"
        title="Patient Consent Form"
        documents={record.documents.filter((d) => d.category === "consent")}
      />

      <DocumentUploadSection
        patientId={patientId}
        category="xray"
        icon="/dashboard/hand_bones.svg"
        title="X-ray Document"
        documents={record.documents.filter((d) => d.category === "xray")}
      />

      <DocumentUploadSection
        patientId={patientId}
        category="other"
        icon="/dashboard/library_books.svg"
        title="Other Documents"
        documents={record.documents.filter((d) => d.category === "other")}
      />
    </div>
  );
}

/* ------------------------------------------------ Doctor/Clinic Observations */

function ObservationsCard({
  patientName,
  patientCode,
  value,
  onSave,
}: {
  patientName: string;
  patientCode: string;
  value: string;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Re-sync when the persisted value changes (e.g. another tab).
  useEffect(() => setDraft(value), [value]);

  const dirty = draft !== value;
  const saved = !dirty && value.trim().length > 0;

  return (
    <section className={`${CARD} flex flex-col gap-[17px] p-[26px]`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-[16px]">
          <Image src="/dashboard/clinical_notes.svg" alt="" width={48} height={48} className="size-[48px] shrink-0" />
          <div>
            <h2 className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">
              Doctor/Clinic Observations
            </h2>
            <p className="font-manrope text-[15px] leading-[21px] text-[#1e1e24]">
              Add your remarks regarding your observations.
            </p>
          </div>
        </div>
        <ExportButton
          enabled={value.trim().length > 0}
          onClick={() => exportObservationPdf(patientName, patientCode, value)}
        />
      </div>

      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter your observation"
          className="h-[136px] w-full resize-none rounded-[8px] border border-b-2 border-[#1e1e24] bg-white px-[18px] pb-[44px] pt-[18px] font-inter text-[15px] leading-[21px] text-[#1e1e24] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] outline-none placeholder:text-[#c2c6d4]"
        />
        <div className="absolute bottom-[14px] right-[14px] flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => setDraft(value)}
            disabled={!dirty}
            className="rounded-[13px] px-[10px] py-[8px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!dirty}
            className="flex items-center gap-[5px] rounded-[13px] px-[10px] py-[8px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#0077c0] transition-opacity hover:opacity-80 disabled:cursor-default disabled:opacity-100"
          >
            {saved && (
              <Image src="/dashboard/check_small.svg" alt="" width={16} height={16} className="size-[16px]" />
            )}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Perio-dental chart */

function PerioSection({
  patientId,
  patientName,
  patientCode,
  teeth,
}: {
  patientId: string;
  patientName: string;
  patientCode: string;
  teeth: ToothEntry[];
}) {
  const [remarks, setRemarks] = useState("");
  const [tooth, setTooth] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ToothEntry | null>(null);

  const canAdd = remarks.trim().length > 0 && tooth.trim().length > 0;

  function submit() {
    if (!canAdd) return;
    const num = String(Math.min(MAX_TOOTH, Math.max(0, Number(tooth) || 0))).padStart(2, "0");
    if (editingId) updateToothEntry(patientId, editingId, num, remarks.trim());
    else addToothEntry(patientId, num, remarks.trim());
    setRemarks("");
    setTooth("");
    setEditingId(null);
  }

  function edit(id: string) {
    const entry = teeth.find((t) => t.id === id);
    if (!entry) return;
    setEditingId(id);
    setRemarks(entry.remarks);
    setTooth(String(Number(entry.toothNo)));
  }

  function step(delta: number) {
    setTooth((t) => String(Math.min(MAX_TOOTH, Math.max(0, (Number(t) || 0) + delta))));
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
        <ExportButton
          enabled={teeth.length > 0}
          onClick={() => exportPerioXls(patientName, patientCode, teeth)}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-[32px] lg:grid-cols-2">
        {/* Left: clinical chart image */}
        <div className="relative aspect-[2959/4096] w-full overflow-hidden rounded-[8px] border border-[#1e1e24] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <Image
            src="/dashboard/perio_chart.jpg"
            alt="Perio-dental chart"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        {/* Right: tooth-wise remarks form + table */}
        <div className="flex flex-col gap-[32px]">
          <div className={`${CARD} flex flex-col gap-[16px] bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]`}>
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center gap-[8px]">
                <Image src="/dashboard/note_stack.svg" alt="" width={24} height={24} className="size-6" />
                <h3 className="font-manrope text-[20px] font-semibold leading-[28px] text-[#1e1e24]">
                  Tooth-wise Remarks
                </h3>
              </div>
              <p className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
                Select a tooth to record its remarks.
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
                <div className="flex h-[40px] items-stretch overflow-hidden rounded-[8px] border border-[#1e1e24]">
                  <input
                    value={tooth}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setTooth(digits);
                    }}
                    onBlur={() => tooth && setTooth(String(Math.min(MAX_TOOTH, Number(tooth))))}
                    inputMode="numeric"
                    placeholder="00"
                    className="min-w-0 flex-1 px-[13px] font-inter text-[14px] text-[#1e1e24] outline-none placeholder:text-[#c2c6d4]"
                  />
                  <div className="flex flex-col border-l border-[#1e1e24]">
                    <button
                      type="button"
                      aria-label="Increase tooth number"
                      onClick={() => step(1)}
                      className="flex flex-1 items-center justify-center border-b border-[#1e1e24] px-[6px] transition-colors hover:bg-[#f1f5f9]"
                    >
                      <Image src="/dashboard/chevron_dark.svg" alt="" width={14} height={14} className="size-[13px] rotate-90" />
                    </button>
                    <button
                      type="button"
                      aria-label="Decrease tooth number"
                      onClick={() => step(-1)}
                      className="flex flex-1 items-center justify-center px-[6px] transition-colors hover:bg-[#f1f5f9]"
                    >
                      <Image src="/dashboard/chevron_dark.svg" alt="" width={14} height={14} className="size-[13px] -rotate-90" />
                    </button>
                  </div>
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

          {/* Tooth-wise table */}
          <div className="overflow-hidden rounded-[11px] border border-[#c2c6d4] bg-white">
            <div className="grid grid-cols-[minmax(0,80fr)_minmax(0,200fr)_minmax(0,150fr)] items-center border-b border-[#c2c6d4] px-[16px]">
              {["Tooth No", "Remarks", "Date"].map((h) => (
                <span key={h} className="py-[18px] font-inter text-[13px] font-semibold uppercase tracking-[0.6px] text-[#1e1e24]">
                  {h}
                </span>
              ))}
            </div>
            {teeth.length === 0 ? (
              <p className="px-[16px] py-[28px] text-center font-inter text-[14px] text-[#94a3b8]">
                No tooth-wise remarks yet. Add one above.
              </p>
            ) : (
              teeth.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[minmax(0,80fr)_minmax(0,200fr)_minmax(0,150fr)] items-center border-b border-[#c2c6d4] px-[16px] last:border-b-0"
                >
                  <span className="py-[20px] font-inter text-[14px] font-medium text-[#1e1e24]">{t.toothNo}</span>
                  <span className="py-[20px] pr-2 font-inter text-[14px] text-[#1e1e24]">{t.remarks}</span>
                  <div className="flex items-center justify-between gap-2 py-[20px]">
                    <span className="font-inter text-[14px] font-medium text-[#1e1e24]">{t.date}</span>
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
                  </div>
                </div>
              ))
            )}
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
}: {
  patientId: string;
  patientName: string;
  patientCode: string;
  entries: MedHistoryEntry[];
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
        <ExportButton
          enabled={entries.length > 0}
          onClick={() => exportMedHistoryXls(patientName, patientCode, entries)}
        />
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
}: {
  patientId: string;
  category: DocCategory;
  icon: string;
  title: string;
  documents: DocEntry[];
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
      const id = addDocument(patientId, category, file.name, file.size, file.type || "application/octet-stream");
      // Persist the bytes so the file can be downloaded later (survives reloads).
      void putDocFile(id, file);
    }
    setError(
      rejected > 0
        ? `${rejected} file${rejected > 1 ? "s" : ""} skipped — only PDF, JPG, JPEG or PNG up to 10 MB are allowed.`
        : "",
    );
  }

  async function handleDownload(d: DocEntry) {
    const blob = await getDocFile(d.id);
    if (!blob) {
      setError(`"${d.name}" is no longer available to download.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-[8px] border border-[#c2c6d4] bg-white p-[26px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="flex items-center gap-[8px]">
        <Image src={icon} alt="" width={32} height={32} className="size-8 shrink-0" />
        <h2 className="font-manrope text-[21px] font-semibold leading-[30px] text-[#1e1e24]">{title}</h2>
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
                  {formatSize(d.size)} • {d.date}
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
            void deleteDocFile(pendingDelete.id);
            removeDocument(patientId, pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}

/** A small dark hover tooltip shown above an icon button (its parent needs
 *  `group relative`). Sized to sit neatly over the icon. */
function Tip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-[6px] bg-[#1e1e24] px-[8px] py-[4px] font-inter text-[12px] font-medium leading-[16px] text-white opacity-0 shadow-[0px_4px_12px_rgba(0,0,0,0.15)] transition-opacity duration-150 group-hover:opacity-100"
    >
      {label}
    </span>
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
