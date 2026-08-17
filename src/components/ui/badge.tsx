import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default: "bg-brand/15 text-brand ring-1 ring-inset ring-brand/30",
        secondary: "bg-elevated text-muted ring-1 ring-inset ring-line",
        success: "bg-success/15 text-success ring-1 ring-inset ring-success/30",
        destructive: "bg-danger/15 text-danger ring-1 ring-inset ring-danger/30",
        warning: "bg-warning/15 text-warning ring-1 ring-inset ring-warning/30",
        outline: "border border-line text-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
