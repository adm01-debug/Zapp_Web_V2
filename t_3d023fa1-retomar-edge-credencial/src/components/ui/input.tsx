import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

const inputVariants = cva(
  "flex w-full rounded-xl border bg-background text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 md:text-sm",
  {
    variants: {
      variant: {
        default: "border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        glow: "border-input focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:shadow-glow-primary-sm",
        neon: "border-secondary/30 focus-visible:outline-none focus-visible:border-secondary focus-visible:ring-4 focus-visible:ring-secondary/20 focus-visible:shadow-glow-secondary-md",
        ghost: "border-transparent bg-muted/50 focus-visible:outline-none focus-visible:bg-background focus-visible:border-input",
        underline: "border-0 border-b-2 border-input rounded-none px-0 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-0",
      },
      inputSize: {
        sm: "h-9 px-3 text-sm",
        default: "h-10 px-3 py-2",
        lg: "h-12 px-4 text-base",
      },
    },
    defaultVariants: {
      variant: "glow",
      inputSize: "default",
    },
  }
);

interface InputProps extends Omit<React.ComponentProps<"input">, "size">, VariantProps<typeof inputVariants> {
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  error?: boolean;
  success?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, inputSize, leftIcon: LeftIcon, rightIcon: RightIcon, leftElement, rightElement, error, success, ...props }, ref) => {
    const hasLeftAddon = LeftIcon || leftElement;
    const hasRightAddon = RightIcon || rightElement;

    const inputElement = (
      <input
        type={type}
        className={cn(
          inputVariants({ variant, inputSize }),
          hasLeftAddon && "pl-10",
          hasRightAddon && "pr-10",
          error && "border-destructive focus-visible:ring-destructive/20 focus-visible:border-destructive",
          success && "border-success focus-visible:ring-success/20 focus-visible:border-success",
          className,
        )}
        ref={ref}
        {...props}
      />
    );

    if (!hasLeftAddon && !hasRightAddon) {
      return inputElement;
    }

    return (
      <div className="relative">
        {hasLeftAddon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {leftElement || (LeftIcon && <LeftIcon className="w-4 h-4" />)}
          </div>
        )}
        {inputElement}
        {hasRightAddon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {rightElement || (RightIcon && <RightIcon className="w-4 h-4" />)}
          </div>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
