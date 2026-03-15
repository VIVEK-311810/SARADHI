import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        // Primary — indigo
        default:
          "bg-primary-600 text-white hover:bg-primary-500 active:bg-primary-700 shadow-sm hover:shadow-glow-primary dark:bg-primary-600 dark:hover:bg-primary-500 dark:active:bg-primary-700",
        // CTA — orange accent
        accent:
          "bg-accent-500 text-white hover:bg-accent-400 active:bg-accent-600 shadow-sm hover:shadow-glow-accent",
        // legacy alias → orange
        coral:
          "bg-accent-500 text-white hover:bg-accent-400 active:bg-accent-600 shadow-sm hover:shadow-glow-accent",
        // AI — teal
        teal:
          "bg-teal-500 text-white hover:bg-teal-400 active:bg-teal-600 shadow-sm hover:shadow-glow-teal",
        // Destructive
        destructive:
          "bg-red-600 text-white hover:bg-red-500 active:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400",
        // Outline
        outline:
          "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-primary-300 active:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:border-primary-500",
        // Secondary
        secondary:
          "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
        // Ghost
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100",
        // Glass — frosted glassmorphism
        glass:
          "bg-white/70 dark:bg-slate-800/70 backdrop-blur-md border border-white/30 dark:border-slate-700/30 text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-700/70 shadow-glass",
        // Link
        link:
          "text-primary-600 underline-offset-4 hover:underline dark:text-primary-400",
        // Success
        success:
          "bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
      },
      size: {
        xs:       "h-7 px-2.5 text-xs rounded-lg",
        sm:       "h-8 px-3 text-xs",
        default:  "h-10 px-4 py-2",
        lg:       "h-12 px-6 text-base",
        xl:       "h-14 px-8 text-lg",
        icon:     "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
