import React from 'react';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

const PAGE_SIZES = [12, 24, 48] as const;

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Builds the sequence of page numbers and ellipses ('...') to keep wide catalogs compact. */
function pageNumbers(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | '...')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(totalPages - 1, current + 1);
  if (left > 2) pages.push('...');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < totalPages - 1) pages.push('...');
  pages.push(totalPages);
  return pages;
}

/**
 * Bottom pagination bar for the library grid and table views.
 */
export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) => {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);
  const items = pageNumbers(safePage, totalPages);

  return (
    <nav
      aria-label="Library pagination"
      className="mt-8 pt-5 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="font-mono">
          Showing <strong className="text-ink">{start}–{end}</strong> of{' '}
          <strong className="text-ink">{totalItems}</strong> {totalItems === 1 ? 'game' : 'games'}
        </span>

        <label className="flex items-center gap-1.5">
          <span className="sr-only">Games per page</span>
          <select
            aria-label="Games per page"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-surface text-ink text-xs font-mono rounded-lg px-2 py-1 border border-line outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          aria-label="Previous page"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-line text-muted hover:text-ink hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <CaretLeftIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        <div className="flex items-center gap-1">
          {items.map((entry, idx) =>
            entry === '...' ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-xs font-mono text-muted select-none">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === safePage ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                className={`min-w-[2rem] h-8 px-2 rounded-xl text-xs font-mono font-semibold transition-colors ${
                  entry === safePage
                    ? 'bg-accent text-canvas font-bold'
                    : 'bg-surface border border-line text-muted hover:text-ink hover:border-accent/60'
                }`}
              >
                {entry}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          aria-label="Next page"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface border border-line text-muted hover:text-ink hover:border-accent/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <span className="hidden sm:inline">Next</span>
          <CaretRightIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
};
