import * as React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-2xl border text-card-foreground transition-all duration-300",
  {
    variants: {
      variant: {
        default: "border-border bg-card shadow-sm",
        elevated: "border-border/50 bg-card-elevated shadow-lg shadow-foreground/5",
        interactive: "border-border bg-card shadow-sm hover:shadow-md hover:border-primary/30 cursor-pointer",
        selected: "border-primary bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20",
        ghost: "border-transparent bg-transparent",
        glass: "border-border/30 bg-card/80 backdrop-blur-lg shadow-lg",
        neon: "border-secondary/50 bg-card shadow-glow-secondary-sm hover:shadow-glow-secondary-md hover:border-secondary/70",
        gradient: "border-0 bg-gradient-to-br from-card via-card to-muted/30 shadow-lg",
      },
      padding: {
        none: "",
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "none",
    },
  }
);

interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

interface MotionCardProps extends Omit<HTMLMotionProps<"div">, "ref">, VariantProps<typeof cardVariants> {
  hover?: boolean;
  hoverScale?: number;
  hoverY?: number;
}

const MotionCardComponent = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ className, variant, padding, hover = true, hoverScale = 1.01, hoverY = -4, ...props }, ref) => (
    <motion.div
      ref={ref}
      whileHover={hover ? { 
        y: hoverY, 
        scale: hoverScale,
        boxShadow: "0 12px 40px hsl(var(--primary) / 0.15)",
        transition: { duration: 0.2, ease: "easeOut" }
      } : undefined}
      whileTap={hover ? { scale: 0.99 } : undefined}
      className={cn(cardVariants({ variant: variant || "interactive", padding }), "cursor-pointer", className)}
      {...props}
    />
  )
);
MotionCardComponent.displayName = "MotionCardComponent";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, MotionCardComponent, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
