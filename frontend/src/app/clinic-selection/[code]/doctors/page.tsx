import type { Metadata } from "next";

import DoctorsClient from "./DoctorsClient";

export const metadata: Metadata = {
  title: "Doctors — Tootica",
};

/**
 * Doctors (Figma "Doctors"): the clinic's doctor directory — a searchable,
 * sortable, paginated table with per-row Edit / Shift / Delete actions, a
 * "Create Doctor" modal, an Apply Filter panel, and a CSV export. All state
 * lives in DoctorsClient.
 */
export default function DoctorsPage() {
  return <DoctorsClient />;
}
