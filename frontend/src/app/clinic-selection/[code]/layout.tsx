import DashboardShell from "./DashboardShell";

/**
 * Layout for the per-clinic dashboard area. The `[code]` segment is the
 * clinic/branch code (e.g. `c001`) the user picked on the clinic-selection
 * screen. The shell (sidebar + white content panel) is shared across every
 * nested route and preserves state on navigation.
 */
export default async function ClinicLayout(
  props: LayoutProps<"/clinic-selection/[code]">,
) {
  const { code } = await props.params;
  return <DashboardShell code={code}>{props.children}</DashboardShell>;
}
