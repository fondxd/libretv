'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
  showJump?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  pageSizeOptions = [24, 36, 48, 60, 96],
  onPageChange,
  onPageSizeChange,
  className,
  showJump = true,
}: PaginationProps) {
  const [jumpInput, setJumpInput] = useState('');

  if (totalPages <= 1 && totalItems <= pageSizeOptions[0]) {
    return null;
  }

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 4) {
        pages.push('ellipsis');
      }
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (currentPage < totalPages - 3) {
        pages.push('ellipsis');
      }
      pages.push(totalPages);
    }
    return pages;
  };

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpInput, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      onPageChange(p);
      setJumpInput('');
    }
  };

  const pageNumbers = getPageNumbers();

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-2 select-none',
        className
      )}
    >
      {/* Summary and Page Size Selector */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
        <span>
          Showing <strong className="text-content">{startItem}</strong>–<strong className="text-content">{endItem}</strong> of{' '}
          <strong className="text-content">{totalItems}</strong> videos
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2 border-l border-line pl-3">
            <span>Per page:</span>
            <div className="flex items-center gap-1">
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onPageSizeChange(opt)}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs transition-colors',
                    pageSize === opt
                      ? 'bg-accent text-accent-contrast font-semibold shadow-sm'
                      : 'bg-chip text-muted hover:text-content hover:bg-hover'
                  )}
                  aria-label={`Show ${opt} items per page`}
                  aria-pressed={pageSize === opt}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Page Navigation Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {/* First & Prev */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="btn-ghost btn-sm !px-2 disabled:opacity-30 disabled:cursor-not-allowed"
          title="First Page"
          aria-label="First Page"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="btn-ghost btn-sm !px-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous Page"
          aria-label="Previous Page"
        >
          ‹
        </button>

        {/* Number Buttons */}
        {pageNumbers.map((p, idx) => {
          if (p === 'ellipsis') {
            return (
              <span key={`ellipsis-${idx}`} className="px-1 text-faint text-xs">
                …
              </span>
            );
          }
          const isActive = p === currentPage;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={cn(
                'min-w-[32px] h-8 px-2 rounded-md text-xs font-medium transition-all',
                isActive
                  ? 'bg-accent text-accent-contrast font-bold shadow-sm scale-105'
                  : 'bg-chip text-content hover:bg-hover'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {p}
            </button>
          );
        })}

        {/* Next & Last */}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="btn-ghost btn-sm !px-2.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next Page"
          aria-label="Next Page"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="btn-ghost btn-sm !px-2 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Last Page"
          aria-label="Last Page"
        >
          »
        </button>

        {/* Jump to Page Form */}
        {showJump && totalPages > 3 && (
          <form onSubmit={handleJump} className="flex items-center gap-1.5 ml-2 border-l border-line pl-2">
            <span className="text-xs text-faint">Go to</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder={String(currentPage)}
              className="input !h-7 !w-12 !px-1.5 text-center text-xs"
              aria-label="Jump to page number"
            />
            <button type="submit" className="btn-secondary btn-sm !h-7 !px-2 text-xs">
              Go
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
