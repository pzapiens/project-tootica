import type { Metadata } from "next";

import FitToViewport from "./FitToViewport";
import LoginCard from "./LoginCard";

export const metadata: Metadata = {
  title: "Sign In — Tootica",
};

export default function LoginPage() {
  return (
    <FitToViewport className="bg-ink">
      <div className="flex flex-col items-center gap-12 px-4">
        <LoginCard />

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
