"use client";

import { type MeResponse } from "@/lib/api";

import AccountMenu from "./AccountMenu";

/**
 * Clinic-selection page header: the greeting and the account chip/menu. The
 * appointment stat cards + filters that used to live here now sit in the
 * {@link OverallAnalytics} section below the branch list.
 */
export default function DashboardTop({
  greetingName,
  me,
  setMe,
}: {
  greetingName: string;
  me: MeResponse;
  setMe: (me: MeResponse) => void;
}) {
  return (
    <header className="flex shrink-0 flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
      <h1 className="font-inter text-[26px] font-semibold leading-tight text-ink md:text-[35px] md:leading-[42px]">
        Welcome, {greetingName}
      </h1>
      <div className="flex flex-wrap items-center gap-3 md:gap-[19px]">
        <AccountMenu me={me} setMe={setMe} showAccounts={false} />
      </div>
    </header>
  );
}
