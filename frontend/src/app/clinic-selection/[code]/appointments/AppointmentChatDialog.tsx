"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  getAppointmentWhatsApp,
  openWhatsAppChat,
  sendAppointmentWhatsApp,
  type AppointmentWhatsAppBundle,
  type WhatsAppSubmission,
} from "@/lib/whatsapp";

function submissionLabel(status: string) {
  if (status === "SUBMITTED")
    return "Submitted to WhatsApp. Delivery is not confirmed.";
  if (status === "FAILED")
    return "WhatsApp rejected this submission. Contact your clinic admin before trying again.";
  return "Submission outcome is not confirmed. Do not resend; ask your clinic admin to check it.";
}
export default function AppointmentChatDialog({
  appointmentId,
  patientName,
  patientCode,
  phone,
  onClose,
}: {
  appointmentId: string;
  patientName: string;
  patientCode: string;
  phone: string;
  onClose: () => void;
}) {
  const [bundle, setBundle] = useState<AppointmentWhatsAppBundle | null>(null);
  const [parameters, setParameters] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WhatsAppSubmission | null>(null);
  const submission = useRef<{
    requestKey: string;
    parameters: string[];
    consentConfirmed: true;
  } | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let active = true;
    getAppointmentWhatsApp(appointmentId)
      .then((data) => {
        if (!active) return;
        setBundle(data);
        setParameters(
          Array.from(
            { length: data.connection?.templateParameters ?? 0 },
            (_, i) => (i === 0 ? patientName : ""),
          ),
        );
      })
      .catch((e: unknown) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load WhatsApp connection",
          );
      });
    return () => {
      active = false;
    };
  }, [appointmentId, patientName]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  async function send() {
    if (busy) return;
    submission.current ??= {
      requestKey: crypto.randomUUID(),
      parameters: parameters.map((p) => p.trim()),
      consentConfirmed: true,
    };
    setLocked(true);
    setBusy(true);
    setError("");
    try {
      setResult(
        await sendAppointmentWhatsApp(appointmentId, submission.current),
      );
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Unable to submit") +
          " Retry below checks the same submission; it will not automatically send a second copy.",
      );
    } finally {
      setBusy(false);
    }
  }
  const connection = bundle?.connection;
  const unresolved = bundle?.messages.some(
    (m) => m.status === "PENDING" || m.status === "UNKNOWN",
  );
  const preview = connection?.templateBody.replace(
    /{{(\d+)}}/g,
    (match, n: string) => parameters[Number(n) - 1]?.trim() || match,
  );
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="appt-chat-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#c2c6d4] bg-white p-6 font-inter text-[#1e1e24] shadow-xl"
      >
        <div className="flex items-center gap-3">
          <Image src="/dashboard/chat.svg" alt="" width={24} height={24} />
          <h2
            id="appt-chat-title"
            className="font-manrope text-xl font-semibold"
          >
            WhatsApp message
          </h2>
        </div>
        <p className="mt-4 text-sm">
          To{" "}
          <strong>
            {patientName} ({patientCode})
          </strong>
          <br />
          {phone || "No patient phone recorded"}
        </p>
        {!bundle && !error && (
          <p role="status" className="mt-4 text-sm">
            Loading clinic connection...
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}
        {bundle && !connection?.connected && (
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm">
            WhatsApp API sending is not configured. Ask your clinic admin to
            check Clinic settings.
          </p>
        )}
        {connection?.connected && (
          <>
            <p className="mt-4 text-sm">
              From <strong>{connection.displayNumber}</strong>
            </p>
            <p className="mt-2 text-xs text-gray-600">
              Template: {connection.templateName} ({connection.templateLanguage}
              )
            </p>
            {parameters.map((value, i) => (
              <label key={i} className="mt-3 block text-sm">
                Template variable {i + 1}
                <input
                  value={value}
                  disabled={locked || !!unresolved}
                  maxLength={500}
                  onChange={(e) =>
                    setParameters((values) =>
                      values.map((v, j) => (j === i ? e.target.value : v)),
                    )
                  }
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 disabled:bg-gray-100"
                />
              </label>
            ))}
            <p className="mt-4 text-xs font-semibold uppercase text-gray-600">
              Template body preview
            </p>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-sky-50 p-4 text-sm">
              {preview}
            </p>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={consent}
                disabled={locked || !!unresolved}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1"
              />
              I confirm this patient agreed to receive this message on WhatsApp.
            </label>
            {unresolved && (
              <p role="status" className="mt-3 text-sm text-amber-800">
                A previous submission has an unconfirmed outcome. Ask your
                clinic admin to check it before sending another message.
              </p>
            )}
            {result && (
              <p
                role="status"
                className={`mt-4 text-sm ${result.status === "SUBMITTED" ? "text-green-800" : "text-amber-800"}`}
              >
                {submissionLabel(result.status)}
                {result.metaMessageId && (
                  <span className="mt-1 block break-all text-xs">
                    Reference: {result.metaMessageId}
                  </span>
                )}
                {result.errorCode && (
                  <span className="block text-xs">
                    Meta error code: {result.errorCode}
                  </span>
                )}
              </p>
            )}
            <button
              type="button"
              onClick={send}
              disabled={
                busy ||
                !!result ||
                !!unresolved ||
                !consent ||
                !phone ||
                parameters.some((p) => !p.trim())
              }
              className="mt-5 w-full rounded-full bg-[#0077c0] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Submitting..."
                : locked
                  ? "Check / retry submission"
                  : "Send template"}
            </button>
          </>
        )}
        {!!bundle?.messages.length && (
          <details className="mt-5 text-sm">
            <summary className="cursor-pointer">Recent submissions</summary>
            <ul className="mt-2 space-y-2">
              {bundle.messages.map((m) => (
                <li key={m.id} className="rounded-lg bg-gray-50 p-2">
                  {new Date(m.createdAt).toLocaleString()} ? {m.status}
                  {m.errorCode && ` (Meta ${m.errorCode})`}
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            disabled={!phone.replace(/\D/g, "")}
            onClick={() => openWhatsAppChat(phone)}
            className="text-sm text-[#0077c0] underline disabled:opacity-50"
          >
            Open WhatsApp Web
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-gray-400 px-5 py-2 text-sm disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
