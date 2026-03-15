import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        // ── Core ────────────────────────────────────────────────────────
        default:
          "border-transparent bg-primary-600 text-white dark:bg-primary-500",
        secondary:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
        destructive:
          "border-transparent bg-red-600 text-white dark:bg-red-500",
        outline:
          "border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-300",

        // ── Brand accents ────────────────────────────────────────────────
        primary:
          "border-primary-200 bg-primary-100 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-400",
        accent:
          "border-accent-200 bg-accent-100 text-accent-700 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-400",
        // legacy aliases
        coral:
          "border-accent-200 bg-accent-100 text-accent-700 dark:border-accent-800 dark:bg-accent-900/30 dark:text-accent-400",
        teal:
          "border-teal-200 bg-teal-100 text-teal-600 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
        saradhi:
          "border-primary-200 bg-primary-100 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-400",

        // ── Status ───────────────────────────────────────────────────────
        success:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        warning:
          "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        live:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        ended:
          "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400",

        // ── Subject tags ─────────────────────────────────────────────────
        math:
          "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
        physics:
          "border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
        chemistry:
          "border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400",
        biology:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
        cs:
          "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        literature:
          "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
        art:
          "border-pink-200 bg-pink-100 text-pink-700 dark:border-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
        engineering:
          "border-indigo-200 bg-indigo-100 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, dot, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "live" || variant === "success"
              ? "bg-emerald-500"
              : variant === "coral"
              ? "bg-coral-500"
              : variant === "teal"
              ? "bg-teal-500"
              : "bg-slate-400"
          )}
        />
      )}
      {props.children}
    </div>
  );
}

export { Badge, badgeVariants };
