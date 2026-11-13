"use client";

import Image from "next/image";
import { useRef } from "react";
import FloatingPanel from "./FloatingPanel";
import { useExclusiveDropdown } from "@/lib/useExclusiveDropdown";

const PAGE_SIZES = [10, 20, 50, 100];

function pageList(current: number, total: number): Array<number | "\u2026"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: Array<number | "\u2026"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("\u2026");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < total - 1) pages.push("\u2026");
  pages.push(total);
  return pages;
}

/** App-standard record count, page size, and numbered navigation below a table. */
export default function TablePagination({
  totalRecords,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  paginationLabel = "Revenue transaction pages",
}: {
  totalRecords: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  paginationLabel?: string;
}) {
  const [open, setOpen] = useExclusiveDropdown();
  const trigger = useRef<HTMLButtonElement>(null);
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const first = (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, totalRecords);

  if (totalRecords === 0) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3.5">
      <div className="app-pagination flex items-center gap-[20px]">
        <span className="font-inter text-[14px] leading-[20px] text-[#1e1e24]">
          Showing {first}-{last} of {totalRecords} records
        </span>
        <div className="flex items-center gap-[10px]">
          <span className="font-inter text-[12px] font-semibold uppercase tracking-[0.6px] text-[#727783]">Show:</span>
          <button
            ref={trigger}
            type="button"
            aria-label="Rows per page"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(value => !value)}
            className="flex h-[44px] items-center gap-[10px] rounded-[10px] border-[1.167px] border-black px-[13px] font-inter text-[14px] text-[#1e1e24] transition-colors"
          >
            {pageSize} per page
            <Image src="/dashboard/chevron_dark.svg" alt="" width={20} height={20} className={`size-5 transition-transform ${open ? "rotate-90" : "-rotate-90"}`} />
          </button>
          {open && (
            <FloatingPanel anchor={trigger} align="start" width={176} role="menu" label="Rows per page" onClose={() => setOpen(false)} className="flex flex-col gap-[5px] rounded-[13px] border-[1.167px] border-black bg-white p-[14px] shadow-lg">
              {PAGE_SIZES.map(size => (
                <button
                  key={size}
                  type="button"
                  role="menuitemradio"
                  aria-checked={size === pageSize}
                  onClick={() => { onPageSizeChange(size); setOpen(false); }}
                  className="app-option-hover flex w-full items-center justify-between rounded-[8px] bg-[#f1f5f9] p-[10px] text-left font-manrope text-[14px] font-semibold text-[#1e1e24] transition-colors"
                >
                  {size} per page
                  <span className="flex size-3 shrink-0 items-center justify-center rounded-full border-[1.167px] border-black">
                    {size === pageSize && <span className="size-1.5 rounded-full bg-[#1e1e24]" />}
                  </span>
                </button>
              ))}
            </FloatingPanel>
          )}
        </div>
      </div>
      {totalPages > 1 && (
        <nav aria-label={paginationLabel} className="app-pagination-controls flex items-center gap-[8px]">
          <PageArrow label="Previous page" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} flip />
          {pageList(currentPage, totalPages).map((page, index) => typeof page === "string" ? (
            <span key={`ellipsis-${index}`} className="px-[6px] font-inter text-[14px] text-[#94a3b8]">{page}</span>
          ) : (
            <button
              key={page}
              type="button"
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? "page" : undefined}
              onClick={() => onPageChange(page)}
              className={`flex size-[40px] items-center justify-center rounded-[10px] font-inter text-[14px] transition-colors ${page === currentPage ? "bg-[#0077c0] font-semibold text-white" : "app-option-hover text-[#1e1e24]"}`}
            >
              {page}
            </button>
          ))}
          <PageArrow label="Next page" disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} />
        </nav>
      )}
    </div>
  );
}

function PageArrow({ label, disabled, onClick, flip = false }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  flip?: boolean;
}) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex size-[40px] items-center justify-center rounded-[10px] border-[1.167px] border-black transition-colors disabled:cursor-not-allowed disabled:opacity-40">
      <Image src="/dashboard/chevron_dark.svg" alt="" width={20} height={20} className={`size-5 ${flip ? "" : "rotate-180"}`} />
    </button>
  );
}
