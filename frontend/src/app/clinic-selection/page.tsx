import type { Metadata } from "next";

import ClinicSelectionClient from "./ClinicSelectionClient";

export const metadata: Metadata = {
  title: "Select Branch — Tootica",
};

export default function ClinicSelectionPage() {
  // The greeting + branch list and the appointment stat cards are all driven by
  // the signed-in user's clinic, fetched client-side (`/api/auth/me`,
  // `/api/analytics/summary`). No seed data here.
  return <ClinicSelectionClient />;
}
