import Image from "next/image";

import { STAT_CARDS, type StatCounts } from "./mock";

/**
 * Row of 4 appointment stat cards (Figma "Dashboard - Stats Cards"). Solid-blue
 * cards, big count on top, an icon + "Review" link pinned to the bottom. The
 * counts change with the selected timeframe. The "Review" link's action is
 * disabled for now (kept visually as part of the card design).
 */
export default function StatCards({ counts }: { counts: StatCounts }) {
  return (
    <div className="flex flex-wrap gap-[28px] xl:flex-nowrap">
      {STAT_CARDS.map((card) => (
        <div
          key={card.key}
          className="flex h-[224px] min-w-[220px] flex-1 flex-col justify-between overflow-hidden rounded-[28px] bg-[#0077c0] p-[28px]"
        >
          <div className="flex flex-col gap-[4.667px]">
            <span className="font-inter text-[42px] font-bold leading-[46.667px] text-white">
              {counts[card.key]}
            </span>
            <span className="font-inter text-[18.667px] font-medium leading-[28px] text-white">
              {card.label}
            </span>
          </div>
          <div className="flex items-end justify-between pt-[18.667px]">
            <Image src={card.icon} alt="" width={40} height={40} className="size-10" />
            <button
              type="button"
              className="font-inter text-[16.333px] font-medium leading-[23.333px] text-white hover:underline"
            >
              Review
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
