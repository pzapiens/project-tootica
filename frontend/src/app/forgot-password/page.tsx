import type { Metadata } from "next";

import FitToViewport from "../login/FitToViewport";
import ForgotPasswordFlow from "./ForgotPasswordFlow";

export const metadata: Metadata = {
  title: "Reset Password — Tootica",
};

export default function ForgotPasswordPage() {
  return (
    <FitToViewport className="bg-ink">
      <div className="flex w-full flex-col items-center gap-7 px-2 sm:gap-10 sm:px-3.5">
        <ForgotPasswordFlow />

        {/* System footer (non-nav version) */}
        <footer className="flex flex-col items-center text-center">
          <p className="font-inter text-[12px] font-medium leading-4 tracking-[1.2px] text-white">
            © 2026 Tootica. All Rights Reserved.
          </p>
        </footer>
      </div>
    </FitToViewport>
  );
}
