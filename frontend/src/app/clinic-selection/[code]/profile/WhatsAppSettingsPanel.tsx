"use client";

import { useMe } from "../session";

export default function WhatsAppSettingsPanel() {
  const { user } = useMe();
  if (user.role !== "CLIENT_ADMIN" && user.role !== "SUPER_ADMIN") return null;

  return (
    <section className="app-page app-record-card rounded-[13px] border-[1.167px] border-black bg-white p-[22px] font-inter text-[#1e1e24]">
      <h2 className="font-manrope text-[18px] font-semibold leading-[26px]">
        WhatsApp
      </h2>
      <p className="mt-2 text-sm text-black">
        Connect your clinic&apos;s WhatsApp number to Tootica.
      </p>
      <div className="mt-5 rounded-xl border-[1.167px] border-black bg-[#f8fafc] p-3.5">
        <button
          type="button"
          disabled
          aria-describedby="whatsapp-signup-help"
          className="cursor-not-allowed rounded-lg bg-gray-200 px-4 py-3 text-sm font-semibold text-gray-400"
        >
          Connect with WhatsApp (Embedded signup)
        </button>
        <p id="whatsapp-signup-help" className="mt-2 text-sm text-black">
          Embedded signup is coming soon.
        </p>
      </div>
    </section>
  );
}
