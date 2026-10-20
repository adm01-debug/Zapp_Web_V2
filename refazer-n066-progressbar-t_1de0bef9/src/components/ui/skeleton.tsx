import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const skeletonVariants = cva(
  "rounded-md bg-muted relative overflow-hidden",
  {
    variants: {
      variant: {
        pulse: "animate-pulse-soft",
        shimmer: "skeleton-shimmer",
        wave: "skeleton-wave",
        subtle: "animate-pulse opacity-60",
      },
      // More subtle and slower animation speeds
      speed: {
        slow: "[animation-duration:3s]",
        default: "[animation-duration:2s]",
        fast: "[animation-duration:1.5s]",
      },
    },
    defaultVariants: {
      variant: "shimmer",
      speed: "default",
    },
  }
);

interface SkeletonProps 
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  /** Delay in ms for staggered animations */
  delay?: number;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ 
    className, 
    variant, 
    speed,
    delay = 0,
    style,
    ...props 
  }, ref) {
    return (
      <div 
        ref={ref}
        className={cn(skeletonVariants({ variant, speed }), className)} 
        style={{ 
          ...style,
          animationDelay: delay ? `${delay}ms` : undefined,
        }}
        role="status"
        aria-label="Loading..."
        {...props} 
      />
    );
  }
);

/** Skeleton with shimmer wrapper for cards */
function SkeletonCard({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-card border border-border", className)}>
      {children}
      <div 
        className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-background/40 to-transparent pointer-events-none [animation-duration:2.5s]" 
        aria-hidden="true"
      />
    </div>
  );
}

/** Staggered skeleton list for better visual feedback */
function SkeletonList({ 
  count = 5, 
  children,
  staggerDelay = 100,
}: { 
  count?: number; 
  children: (index: number) => React.ReactNode;
  staggerDelay?: number;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i}
          className="animate-fade-in"
          style={{ 
            animationDelay: `${i * staggerDelay}ms`,
            animationFillMode: 'backwards'
          }}
        >
          {children(i)}
        </div>
      ))}
    </>
  );
}

/** Common skeleton patterns */
const SkeletonText = ({ lines = 3, className }: { lines?: number; className?: string }) => (
  <div className={cn("space-y-2", className)}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton 
        key={i} 
        className={cn("h-4", i === lines - 1 ? "w-3/4" : "w-full")}
        delay={i * 80}
      />
    ))}
  </div>
);

const SkeletonAvatar = ({ size = "default" }: { size?: "sm" | "default" | "lg" }) => {
  const sizes = { sm: "w-8 h-8", default: "w-10 h-10", lg: "w-12 h-12" };
  return <Skeleton className={cn("rounded-full", sizes[size])} />;
};

const SkeletonButton = ({ size = "default" }: { size?: "sm" | "default" | "lg" }) => {
  const sizes = { sm: "h-8 w-20", default: "h-10 w-24", lg: "h-11 w-32" };
  return <Skeleton className={cn("rounded-lg", sizes[size])} />;
};

export { 
  Skeleton, 
  SkeletonCard, 
  SkeletonList, 
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  skeletonVariants,
};
