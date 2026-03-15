import * as React from "react";
import { cn } from "../../lib/utils";

const cardVariants = {
  default:  "rounded-2xl border border-slate-200/80 bg-white shadow-card dark:bg-slate-800 dark:border-slate-700/80 transition-all duration-200",
  glass:    "rounded-2xl border border-white/30 dark:border-slate-700/30 backdrop-blur-xl shadow-glass transition-all duration-200 bg-white/75 dark:bg-slate-800/75",
  elevated: "rounded-2xl border border-slate-200/60 bg-white shadow-card-hover dark:bg-slate-800 dark:border-slate-700/60 transition-all duration-200",
};

const Card = React.forwardRef(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(cardVariants[variant] ?? cardVariants.default, className)}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col space-y-1.5 p-4 sm:p-6", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-display font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-slate-500 dark:text-slate-400", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 sm:p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex items-center p-4 sm:p-6 pt-0", className)} {...props} />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
