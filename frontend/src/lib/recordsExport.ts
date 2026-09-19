"use client";

/**
 * Dependency-free exporters for the Patient Records page: each table (perio-dental
 * tooth-wise remarks, medical history, Doctor/Clinic observations) → an
 * Excel-openable `.xls` (an HTML table with the Office worksheet markers, which
 * Excel opens as a sheet).
 *
 * Each builds a Blob and triggers a direct download — no third-party libraries,
 * to match the project's hand-rolled CSV export elsewhere.
 */

import type { MedHistoryEntry, ObservationEntry, ToothEntry } from "./patientRecordsStore";

/** A filename-safe slug from arbitrary text. */
function slug(s: string): string {
  return (s || "record").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "record";
}

/** Trigger a browser download for a blob. */
function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------------------- XLS */

/** Escape a value for HTML (used inside the .xls table cells). */
function htmlCell(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Wrap a table body in the Office worksheet markup Excel opens as a sheet. */
function xlsDocument(sheetName: string, table: string): Blob {
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8">` +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
    `<x:Name>${sheetName}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>` +
    `</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>` +
    `<body><table border="1" cellspacing="0" cellpadding="4">${table}</table></body></html>`;
  return new Blob([html], { type: "application/vnd.ms-excel" });
}

/** Export the perio-dental tooth-wise table as an Excel-openable `.xls` sheet. */
export function exportPerioXls(patientName: string, patientCode: string, teeth: ToothEntry[]): void {
  const header = `<tr><th>SI No.</th><th>Tooth No</th><th>Remarks</th><th>Date</th></tr>`;
  const body =
    teeth.length === 0
      ? `<tr><td colspan="4">No tooth-wise remarks recorded.</td></tr>`
      : teeth
          .map(
            (t, i) =>
              `<tr><td>${i + 1}</td><td>${htmlCell(t.toothNo)}</td><td>${htmlCell(t.remarks)}</td><td>${htmlCell(t.date)}</td></tr>`,
          )
          .join("");

  const table =
    `<tr><td colspan="4"><b>Perio-dental chart</b> — ${htmlCell(patientName)} (${htmlCell(patientCode)})</td></tr>` +
    header +
    body;

  download(xlsDocument("Perio Chart", table), `perio-chart-${slug(patientCode || patientName)}.xls`);
}

/** Export the patient medical-history table as an Excel-openable `.xls` sheet. */
export function exportMedHistoryXls(patientName: string, patientCode: string, entries: MedHistoryEntry[]): void {
  const header = `<tr><th>SI No.</th><th>Medical History</th><th>Date</th></tr>`;
  const body =
    entries.length === 0
      ? `<tr><td colspan="3">No medical history recorded.</td></tr>`
      : entries
          .map((e, i) => `<tr><td>${i + 1}</td><td>${htmlCell(e.text)}</td><td>${htmlCell(e.date)}</td></tr>`)
          .join("");

  const table =
    `<tr><td colspan="3"><b>Patient Medical History</b> — ${htmlCell(patientName)} (${htmlCell(patientCode)})</td></tr>` +
    header +
    body;

  download(xlsDocument("Medical History", table), `medical-history-${slug(patientCode || patientName)}.xls`);
}

/** Export the Doctor/Clinic observations table as an Excel-openable `.xls` sheet. */
export function exportObservationsXls(
  patientName: string,
  patientCode: string,
  entries: ObservationEntry[],
): void {
  const header = `<tr><th>SI No.</th><th>Observation</th><th>Date</th></tr>`;
  const body =
    entries.length === 0
      ? `<tr><td colspan="3">No observations recorded.</td></tr>`
      : entries
          .map((e, i) => `<tr><td>${i + 1}</td><td>${htmlCell(e.text)}</td><td>${htmlCell(e.date)}</td></tr>`)
          .join("");

  const table =
    `<tr><td colspan="3"><b>Doctor/Clinic Observations</b> — ${htmlCell(patientName)} (${htmlCell(patientCode)})</td></tr>` +
    header +
    body;

  download(xlsDocument("Observations", table), `observations-${slug(patientCode || patientName)}.xls`);
}
