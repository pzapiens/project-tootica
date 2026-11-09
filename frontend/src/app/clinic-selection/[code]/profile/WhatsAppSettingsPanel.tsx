"use client";

import { useMe } from "../session";

export default function WhatsAppSettingsPanel() {
  const { user } = useMe();
  if (user.role !== "CLIENT_ADMIN" && user.role !== "SUPER_ADMIN") return null;

  return (
    <section className="rounded-[16px] border border-[#c2c6d4] bg-white p-[26px] font-inter text-[#1e1e24]">
      <h2 className="font-manrope text-[21px] font-semibold leading-[30px]">
        WhatsApp
      </h2>
      <p className="mt-2 text-sm text-[#727783]">
        Connect your clinic&apos;s WhatsApp number to Tootica.
      </p>
      <div className="mt-5 rounded-xl border border-[#c2c6d4] bg-[#f8fafc] p-4">
        <button
          type="button"
          disabled
          aria-describedby="whatsapp-signup-help"
          className="cursor-not-allowed rounded-lg bg-gray-200 px-5 py-3 text-sm font-semibold text-gray-400"
        >
          Connect with WhatsApp (Embedded signup)
        </button>
        <p id="whatsapp-signup-help" className="mt-2 text-sm text-[#727783]">
          Embedded signup is coming soon.
        </p>
      </div>
    </section>
  );
}
