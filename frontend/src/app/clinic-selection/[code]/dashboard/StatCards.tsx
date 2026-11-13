"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";

import styles from "./dashboard.module.css";

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
    <div className={styles.stats}>
      {STAT_CARDS.map((card) => (
        <div
          key={card.key}
          className={`${styles.statCard} flex flex-col justify-between rounded-[20px] bg-[#0077c0]`}
        >
          <div className="flex flex-col gap-[4.667px]">
            <span className="font-inter text-[32px] font-bold leading-[36px] text-white">
              {counts[card.key]}
            </span>
            <span className="font-inter text-[14px] font-medium leading-[20px] text-white">
              {card.label}
            </span>
          </div>
          <div className="flex items-end justify-between pt-[12px]">
            <Image src={card.icon} alt="" width={28} height={28} className="size-[28px]" />
            <button
              type="button"
              onClick={() => review(card.key)}
              aria-label={`View ${card.label.toLowerCase()}`}
              className="min-h-8 cursor-pointer whitespace-nowrap font-inter text-[13px] font-medium leading-[20px] text-white"
            >
              View all
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
