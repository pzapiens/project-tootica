"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";

import { STAT_CARDS, STAT_CARD_REVIEW, type StatCounts } from "./mock";

/**
 * Row of 4 appointment stat cards (Figma "Dashboard - Stats Cards"). Solid-blue
 * cards, big count on top, an icon + "Review" link pinned to the bottom. The
 * counts change with the selected timeframe. Clicking a card's "Review" opens the
 * Appointments page pre-focused on that metric: the Total card opens it with no
 * filter; the others auto-apply the matching status filter (Completed / Upcoming
 * / Cancelled) via a `?status=` query param that AppointmentsClient reads.
 */
export default function StatCards({ counts }: { counts: StatCounts }) {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();

  function review(key: keyof StatCounts) {
    const status = STAT_CARD_REVIEW[key].status;
    const q = status && status !== "All status" ? `?status=${encodeURIComponent(status)}` : "";
    router.push(`/clinic-selection/${code}/appointments${q}`);
  }

  return (
    <div className="flex flex-wrap gap-[24px] xl:flex-nowrap">
      {STAT_CARDS.map((card) => (
        <div
          key={card.key}
          className="flex h-[180px] min-w-[210px] flex-1 flex-col justify-between overflow-hidden rounded-[24px] bg-[#0077c0] p-[22px]"
        >
          <div className="flex flex-col gap-[4.667px]">
            <span className="font-inter text-[36px] font-bold leading-[40px] text-white">
              {counts[card.key]}
            </span>
            <span className="font-inter text-[16px] font-medium leading-[24px] text-white">
              {card.label}
            </span>
          </div>
          <div className="flex items-end justify-between pt-[12px]">
            <Image src={card.icon} alt="" width={34} height={34} className="size-[34px]" />
            <button
              type="button"
              onClick={() => review(card.key)}
              className="cursor-pointer font-inter text-[14px] font-medium leading-[20px] text-white"
            >
              View all
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
