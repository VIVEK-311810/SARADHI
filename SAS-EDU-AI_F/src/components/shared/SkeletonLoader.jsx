import React from 'react';

// ── Base Skeleton Primitive ─────────────────────────────────────────────────
export const Skeleton = ({ className = '', ...props }) => (
  <div
    className={`rounded-md skeleton-shimmer ${className}`}
    role="status"
    aria-label="Loading..."
    {...props}
  />
);

// ── Stat Cards (responsive grid of shimmer cards) ───────────────────────────
export const StatCardsSkeleton = ({ count = 4 }) => {
  const delayClasses = ['', 'animation-delay-100', 'animation-delay-200', 'animation-delay-300', 'animation-delay-400'];
  const gridCols = count <= 3 ? 'sm:grid-cols-3' : count === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-5';

  return (
    <div className={`grid grid-cols-2 ${gridCols} gap-3 sm:gap-6`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-6 animate-page-in ${delayClasses[i] || ''}`}
        >
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-3 w-16 sm:w-20" />
              <Skeleton className="h-6 sm:h-7 w-12 sm:w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Session List (shimmer rows matching session card layout) ────────────────
export const SessionListSkeleton = ({ rows = 4 }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-40 sm:w-56" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-28 sm:w-36" />
            <Skeleton className="h-3 w-20 sm:w-24" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

// ── Chart Area (full-height shimmer for analytics charts) ───────────────────
export const ChartAreaSkeleton = ({ height = 'h-64', className = '' }) => (
  <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-6 ${height} flex flex-col ${className}`}>
    <Skeleton className="h-4 w-32 sm:w-40 mb-4 flex-shrink-0" />
    <Skeleton className="flex-1 rounded-lg" />
  </div>
);

// ── Leaderboard (rank circle + name + points rows) ──────────────────────────
export const LeaderboardSkeleton = ({ rows = 8 }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
        <Skeleton className="h-8 w-8 sm:h-10 sm:w-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <Skeleton className="h-4 w-28 sm:w-36" />
          <Skeleton className="h-3 w-16 sm:w-20" />
        </div>
        <Skeleton className="h-6 w-14 sm:w-16 rounded-full flex-shrink-0" />
      </div>
    ))}
  </div>
);
