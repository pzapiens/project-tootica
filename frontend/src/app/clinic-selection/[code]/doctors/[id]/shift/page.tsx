import type { Metadata } from "next";

import ShiftClient from "./ShiftClient";

export const metadata: Metadata = {
  title: "Edit Doctor Shift — Tootica",
};

/**
 * Edit Doctor Shift (Figma "Doctors2 - Edit"): the per-doctor shift scheduler
 * reached from the Doctors table's edit action. Shift data lives in local state
 * (frontend-first) until the doctor-shifts backend endpoints are built.
 */
export default function DoctorShiftPage() {
  return <ShiftClient />;
}
