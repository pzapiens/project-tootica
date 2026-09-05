/**
 * Dental specializations offered in the Doctors module (Figma "Doctors" — the
 * New Doctor Profile select + the Apply Filter specialization chips). Kept in
 * one place so the list, filter panel and create/edit forms stay in sync.
 */
export const SPECIALIZATIONS = [
  "General Dentistry",
  "Endodontic Treatment",
  "Pedodontic Treatment",
  "Periodontic Treatment",
  "Prosthodontic Treatment",
  "Orthodontic Treatment",
  "Surgical Treatment",
] as const;

export type Specialization = (typeof SPECIALIZATIONS)[number];
