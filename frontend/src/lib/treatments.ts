import categories from "../data/treatments.json";

export const TREATMENT_CATEGORIES = categories;
export const UNDECIDED_TREATMENT = "CONSULTATION / TREATMENT TO BE DECIDED";
const labels = new Map(categories.flatMap(category => category.treatments.map(t => [t.value, t.label] as const)));
labels.set(UNDECIDED_TREATMENT, "Consultation / treatment to be decided");
// Keep historical values available to filters and existing appointment edits.
export const LEGACY_CONSULTATION_TYPES = [
  "GENERAL CONSULTATION / XRAY", "ROOT CANAL TREATMENT", "RE ROOT CANAL TREATMENT",
  "CROWN / VENEER / FPD", "EXTRACTION / SURGICAL EXTRACTION", "SCALING", "RESTORATION",
  "TEETH WHITENING", "ORTHODONTIC TREATMENT BRACES / ALIGNERS", "PEDODONTIC TREATMENT",
  "RPD / CD", "IMPLANTS", "TMJ DISORDERS", "GUM RELATED TREATMENTS", "INTRAORAL SCANNING",
  "OTHER LASER TREATMENTS", "OTHERS",
];
export const CONSULTATION_TYPES = [...new Set([...labels.keys(), ...LEGACY_CONSULTATION_TYPES])].sort();
export function treatmentLabel(value: string): string {
  return labels.get(value) ?? value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
function normalize(text: string): string { return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function searchTreatments(query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const found = new Map<string, {value: string; label: string; category: string}>();
  for (const category of categories) {
    for (const treatment of category.treatments) {
      const aliases = [
        treatment.value.includes("ROOT CANAL") ? "rct" : "",
        /SCALING|PROPHYLAXIS|AIR POLISHING/.test(treatment.value) ? "cleaning" : "",
      ].join(" ");
      const keywords = category.keywords.replace(/\b(cleaning|rct)\b/g, "");
      const text = normalize(treatment.label + " " + category.name + " " + keywords + " " + aliases);
      if (words.every(word => text.includes(word)) && !found.has(treatment.value)) {
        found.set(treatment.value, {...treatment, category: category.name});
      }
    }
  }
  const undecided = {value: UNDECIDED_TREATMENT, label: treatmentLabel(UNDECIDED_TREATMENT), category: "Booking reason"};
  if(words.every(word => normalize(undecided.label).includes(word))) found.set(undecided.value, undecided);
  return [...found.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
