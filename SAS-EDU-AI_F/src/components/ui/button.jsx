import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saradhi-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
  {
    variants: {
      variant: {
        // Primary — saradhi violet
        default:
          "bg-saradhi-700 text-white hover:bg-saradhi-600 active:bg-saradhi-800 shadow-sm hover:shadow-glow-saradhi dark:bg-saradhi-600 dark:hover:bg-saradhi-500 dark:active:bg-saradhi-700",
        // Student CTA — coral
        coral:
          "bg-coral-500 text-white hover:bg-coral-400 active:bg-coral-600 shadow-sm hover:shadow-glow-coral",
        // AI accent — teal
        teal:
          "bg-teal-500 text-white hover:bg-teal-400 active:bg-teal-600 shadow-sm hover:shadow-glow-teal",
        // Destructive
        destructive:
          "bg-red-600 text-white hover:bg-red-500 active:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400",
        // Outline
        outline:
          "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-saradhi-300 active:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700",
        // Secondary
        secondary:
          "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600",
        // Ghost
        ghost:
          "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100",
        // Link
        link:
          "text-saradhi-600 underline-offset-4 hover:underline dark:text-saradhi-400",
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
