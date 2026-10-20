import * as React from "react";
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

// MotionCardComponent — o hover/tap que antes vinha do runtime de animação agora é
// CSS do tema: `motion-safe:` (movimento reduzido não recebe efeito), transição de
// `transform` E `box-shadow` (o realce de sombra do token `shadow-glow-primary-sm`
// também anima, como animava o hover do runtime de animação) com o token `duration-200`.
// `hoverScale`/`hoverY` continuam sendo respeitados, via variáveis CSS lidas pelas
// utilidades arbitrárias do Tailwind.
const motionCardClasses =
  "motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:translate-y-[var(--motion-card-y)] motion-safe:hover:scale-[var(--motion-card-scale)] motion-safe:hover:shadow-glow-primary-sm motion-safe:active:scale-[0.99]";

interface MotionCardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  hover?: boolean;
  hoverScale?: number;
  hoverY?: number;
}

const MotionCardComponent = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ className, variant, padding, hover = true, hoverScale = 1.01, hoverY = -4, style, ...props }, ref) => (
    <div
      ref={ref}
      style={
        {
          "--motion-card-y": `${hoverY}px`,
          "--motion-card-scale": `${hoverScale}`,
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        cardVariants({ variant: variant || "interactive", padding }),
        "cursor-pointer",
        hover && motionCardClasses,
        className
      )}
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
