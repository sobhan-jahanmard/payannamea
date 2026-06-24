import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "relative inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:bg-teal-700",
        secondary: "border-secondary bg-secondary text-secondary-foreground hover:bg-orange-600",
        outline: "border-border bg-white hover:bg-muted",
        ghost: "border-transparent bg-transparent hover:bg-muted",
        destructive: "border-destructive bg-destructive text-destructive-foreground hover:bg-red-700"
      },
      size: {
        default: "px-4",
        sm: "h-9 px-3",
        icon: "h-10 w-10 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={!asChild ? disabled || loading : disabled}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          </span>
        ) : null}
        <span className={cn("inline-flex items-center justify-center gap-2", loading && "opacity-0")}>
          {children}
        </span>
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
