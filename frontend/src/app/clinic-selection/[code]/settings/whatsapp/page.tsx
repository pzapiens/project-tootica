import { redirect } from "next/navigation";

export default async function WhatsAppSettingsPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  redirect(`/clinic-selection/${encodeURIComponent(code)}/profile`);
}
