import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const tooltipVariants = cva(
  "z-50 overflow-hidden rounded-xl text-sm shadow-lg shadow-background/20 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "border bg-popover px-3 py-1.5 text-popover-foreground",
        dark: "bg-foreground px-3 py-1.5 text-background border-0",
        info: "bg-info px-3 py-2 text-info-foreground border-0",
        success: "bg-success px-3 py-2 text-success-foreground border-0",
        warning: "bg-warning px-3 py-2 text-warning-foreground border-0",
        error: "bg-destructive px-3 py-2 text-destructive-foreground border-0",
        neon: "bg-card border border-secondary/50 px-3 py-2 text-foreground shadow-glow-secondary-sm",
      },
      size: {
        sm: "text-xs px-2 py-1",
        default: "",
        lg: "text-base px-4 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
    VariantProps<typeof tooltipVariants> {}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, variant, size, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(tooltipVariants({ variant, size }), className)}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Enhanced tooltip with title and description
interface TooltipContentEnhancedProps extends TooltipContentProps {
  title?: string;
  description?: string;
  shortcut?: string;
}

const TooltipContentEnhanced = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentEnhancedProps
>(({ className, title, description, shortcut, children, variant, size, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(tooltipVariants({ variant, size }), "max-w-xs", className)}
    {...props}
  >
    {title || description || shortcut ? (
      <div className="flex flex-col gap-1">
        {title && (
          <div className="flex items-center justify-between gap-4">
            <span className="font-medium">{title}</span>
            {shortcut && (
              <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                {shortcut}
              </kbd>
            )}
          </div>
        )}
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
        {children}
      </div>
    ) : (
      children
    )}
  </TooltipPrimitive.Content>
));
TooltipContentEnhanced.displayName = "TooltipContentEnhanced";

// Simple tooltip wrapper for quick use
interface SimpleTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
  variant?: VariantProps<typeof tooltipVariants>['variant'];
}

function SimpleTooltip({ 
  content, 
  children, 
  side = "top", 
  delayDuration = 200,
  variant = "default",
}: SimpleTooltipProps) {
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} variant={variant}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export { 
  Tooltip, 
  TooltipTrigger, 
  TooltipContent, 
  TooltipContentEnhanced,
  TooltipProvider,
  SimpleTooltip,
  tooltipVariants,
};
