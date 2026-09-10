"use client";

/**
 * Dependency-free exporters for the Patient Records page:
 *  - the Doctor/Clinic observation note → a real (hand-built) PDF file,
 *  - the perio-dental tooth-wise table → an Excel-openable `.xls` (an HTML table
 *    with the Office worksheet markers, which Excel opens as a sheet).
 *
 * Both build a Blob and trigger a direct download — no third-party libraries, to
 * match the project's hand-rolled CSV export elsewhere.
 */

import type { MedHistoryEntry, ToothEntry } from "./patientRecordsStore";

/** dd/mm/yyyy for today. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

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

/* --------------------------------------------------------------------- PDF */

/** Escape a string for a PDF text-showing operator (and drop non-Latin bytes). */
function pdfText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Helvetica's base encoding is ASCII/WinAnsi; drop anything outside printable
    // ASCII so the byte offsets stay 1:1 and the glyphs render.
    .replace(/[^\x20-\x7E]/g, "");
}

/** Word-wrap a paragraph to at most `max` characters per line (preserves blanks). */
function wrap(text: string, max = 92): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of raw.split(/\s+/)) {
      let w = word;
      // Break a single word that's longer than the line width.
      while (w.length > max) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, max));
        w = w.slice(max);
      }
      if (!line) line = w;
      else if ((line + " " + w).length <= max) line += " " + w;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

/** Build a minimal, valid multi-page PDF (Helvetica 12) from plain text lines. */
function buildPdf(lines: string[]): Blob {
  const pageW = 595, pageH = 842, margin = 50, size = 12, leading = 16;
  const perPage = Math.floor((pageH - 2 * margin) / leading);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (pages.length === 0) pages.push([""]);

  // Fixed objects: 1 Catalog, 2 Pages, 3 Font. Then per page: content + page obj.
  const objs: Array<{ id: number; body: string }> = [];
  const pageIds: number[] = [];
  pages.forEach((pl, p) => {
    const contentId = 4 + p * 2;
    const pageId = 5 + p * 2;
    pageIds.push(pageId);
    let stream = `BT /F1 ${size} Tf ${margin} ${pageH - margin} Td ${leading} TL\n`;
    for (const l of pl) stream += `(${pdfText(l)}) Tj T*\n`;
    stream += "ET";
    objs.push({ id: contentId, body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream` });
    objs.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
  });
  objs.push({ id: 1, body: `<< /Type /Catalog /Pages 2 0 R >>` });
  objs.push({ id: 2, body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>` });
  objs.push({ id: 3, body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>` });
  objs.sort((a, b) => a.id - b.id);
  const maxId = objs[objs.length - 1].id;

  let pdf = "%PDF-1.4\n";
  const offsets = new Array<number>(maxId + 1).fill(0);
  for (const o of objs) {
    offsets[o.id] = pdf.length;
    pdf += `${o.id} 0 obj\n${o.body}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= maxId; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

/** Export the Doctor/Clinic observation note as a PDF. */
export function exportObservationPdf(patientName: string, patientCode: string, observation: string): void {
  const lines = [
    "Patient Records - Doctor/Clinic Observations",
    "",
    `Patient: ${patientName}    Patient ID: ${patientCode}`,
    `Date: ${today()}`,
    "",
    "Observations:",
    "",
    ...wrap(observation.trim() || "(no observation recorded)"),
  ];
  download(buildPdf(lines), `observations-${slug(patientCode || patientName)}.pdf`);
}

/* --------------------------------------------------------------------- XLS */

/** Escape a value for HTML (used inside the .xls table cells). */
function htmlCell(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8">` +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
    `<x:Name>Perio Chart</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>` +
    `</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>` +
    `<body><table border="1" cellspacing="0" cellpadding="4">` +
    `<tr><td colspan="4"><b>Perio-dental chart</b> — ${htmlCell(patientName)} (${htmlCell(patientCode)})</td></tr>` +
    header +
    body +
    `</table></body></html>`;

  download(new Blob([html], { type: "application/vnd.ms-excel" }), `perio-chart-${slug(patientCode || patientName)}.xls`);
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

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8">` +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>` +
    `<x:Name>Medical History</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>` +
    `</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>` +
    `<body><table border="1" cellspacing="0" cellpadding="4">` +
    `<tr><td colspan="3"><b>Patient Medical History</b> — ${htmlCell(patientName)} (${htmlCell(patientCode)})</td></tr>` +
    header +
    body +
    `</table></body></html>`;

  download(new Blob([html], { type: "application/vnd.ms-excel" }), `medical-history-${slug(patientCode || patientName)}.xls`);
}
