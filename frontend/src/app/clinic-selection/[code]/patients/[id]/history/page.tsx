import type { Metadata } from "next";
import { Suspense } from "react";

import PatientHistoryClient from "./PatientHistoryClient";

export const metadata: Metadata = {
  title: "Patient History Summary — Tootica",
};

/**
 * Patient History Summary (Figma "Appts8 - Records3"): a read-only view of a
 * patient's previous appointments and overall care journey, reached by clicking
 * a patient's name in the Patients or Appointments table. Each past appointment
 * is a card whose tabs (Doctor/Clinical observation · Perio dental chart ·
 * Medical history) surface the records logged on that visit. All state lives in
 * PatientHistoryClient.
 */
export default function PatientHistoryPage() {
  return (
    <Suspense>
      <PatientHistoryClient />
    </Suspense>
  );
}
