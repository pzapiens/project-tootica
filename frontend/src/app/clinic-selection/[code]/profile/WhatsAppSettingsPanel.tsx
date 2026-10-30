"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { WhatsAppConnectionSummary } from "@/lib/whatsapp";
import { useMe } from "../session";

export default function WhatsAppSettingsPanel() {
  const { user } = useMe();
  const { code } = useParams<{ code?: string }>();
  const allowed = user.role === "CLIENT_ADMIN" || user.role === "SUPER_ADMIN";
  const [connection, setConnection] =
    useState<WhatsAppConnectionSummary | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    apiFetch<{
      connection: WhatsAppConnectionSummary | null;
      enabled: boolean;
    }>("/whatsapp/connection")
      .then((data) => {
        if (active) {
          setConnection(data.connection);
          setEnabled(data.enabled);
        }
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to load WhatsApp settings",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [allowed]);
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await apiFetch<void>("/whatsapp/disconnect", { method: "POST" });
      setConnection((c) => (c ? { ...c, connected: false } : null));
      setConfirmDisconnect(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to disconnect");
    } finally {
      setBusy(false);
    }
  }
  if (!allowed) return <p className="p-8">Clinic admin access is required.</p>;
  return (
    <section className="rounded-[16px] border border-[#c2c6d4] bg-white p-[26px] font-inter text-[#1e1e24]">
      <h2 className="text-xl font-semibold">WhatsApp</h2>
      <p className="mt-2 text-sm text-gray-600">
        This connection is shared by your clinic across its branches. Send
        patient messages from Appointments.
      </p>
      <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <button
          type="button"
          disabled
          aria-describedby="whatsapp-signup-help"
          className="cursor-not-allowed rounded-lg bg-gray-200 px-5 py-3 text-sm font-semibold text-gray-400"
        >
          Connect with WhatsApp (Embedded signup)
        </button>
        <p id="whatsapp-signup-help" className="mt-2 text-sm text-gray-500">
          Embedded signup is coming soon. Your system administrator can
          configure the connection for now.
        </p>
      </div>
      {loading && (
        <p className="mt-5" role="status">
          Loading connection...
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!loading && !error && (
        <>
          <p className="mt-5 font-semibold">
            {!enabled
              ? "Disabled by superadmin"
              : connection?.connected
                ? "Configured"
                : "Not connected"}
          </p>
          {!enabled && (
            <p className="mt-3 text-sm text-gray-600">
              WhatsApp usage is disabled for this account. Contact your
              superadmin to enable it.
            </p>
          )}
          {connection && (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
              <dt>Clinic sender</dt>
              <dd>{connection.displayNumber}</dd>
              <dt>Template</dt>
              <dd>
                {connection.templateName} ({connection.templateLanguage})
              </dd>
              <dt>Variables</dt>
              <dd>{connection.templateParameters}</dd>
            </dl>
          )}
          {connection?.connected && (
            <>
              <p className="mt-5 text-sm font-medium">Template body preview</p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-sky-50 p-4 text-sm">
                {connection.templateBody}
              </p>
              <p className="mt-3 text-xs text-gray-600">
                Configuration was verified when provisioned. Delivery and
                current Meta account status are not monitored here yet.
              </p>
              {enabled && (
                <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
                  <h3 className="text-sm font-semibold">
                    Test your connection
                  </h3>
                  <p className="mt-2 text-sm">
                    Create or choose an upcoming appointment for a test patient
                    using your own receiving WhatsApp number. Open the
                    row&apos;s three-dot menu, select WhatsApp message, then
                    review the template and send it.
                  </p>
                  {code && (
                    <Link
                      href={`/clinic-selection/${encodeURIComponent(code)}/appointments`}
                      className="mt-3 inline-flex rounded-full bg-[#0077c0] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0069a8]"
                    >
                      Test from an appointment
                    </Link>
                  )}
                </div>
              )}
              {!confirmDisconnect ? (
                <button
                  className="mt-6 rounded-full border border-red-700 px-5 py-2 text-sm text-red-700"
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect WhatsApp
                </button>
              ) : (
                <div className="mt-6 rounded-xl border border-red-200 p-4">
                  <p className="text-sm">
                    Disconnect this clinic? New sends will be blocked and the
                    saved token removed. Messages already submitted may still
                    arrive. Reconnection requires your system administrator.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <button
                      disabled={busy}
                      className="rounded-full bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                      onClick={disconnect}
                    >
                      {busy ? "Disconnecting..." : "Confirm disconnect"}
                    </button>
                    <button
                      disabled={busy}
                      className="px-3 text-sm underline"
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Keep connected
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {!connection?.connected && (
            <p className="mt-4 text-sm text-gray-600">
              Contact your system administrator to configure your clinic sender
              and an approved message template.
            </p>
          )}
        </>
      )}
    </section>
  );
}
