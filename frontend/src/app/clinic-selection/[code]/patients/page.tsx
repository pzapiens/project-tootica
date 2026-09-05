import type { Metadata } from "next";

import PatientsClient from "./PatientsClient";

export const metadata: Metadata = {
  title: "Patients — Tootica",
};

/**
 * Patients (Figma "Patients"): the clinic's patient directory — a searchable,
 * sortable, paginated table with per-row Edit / Book / Delete actions, an Apply
 * Filter panel, and a CSV export. All state lives in PatientsClient.
 */
export default function PatientsPage() {
  return <PatientsClient />;
}
