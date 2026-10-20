import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-300 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:shadow-glow-primary-lg hover:bg-primary/90 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-glow-destructive-md",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-secondary/50 hover:shadow-glow-secondary-sm",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:shadow-glow-secondary-md",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:shadow-glow-accent-sm",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary/80",
        whatsapp: "bg-whatsapp text-primary-foreground hover:bg-whatsapp-dark shadow-sm hover:shadow-glow-whatsapp-md before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700",
        glowPurple: "bg-secondary text-secondary-foreground hover:bg-secondary/90 border border-secondary/50 hover:shadow-glow-aura-secondary before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-500",
        glowGradient: "bg-gradient-to-r from-primary to-secondary text-primary-foreground border border-secondary/30 hover:shadow-glow-aura-gradient before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-500",
        neon: "bg-transparent border-2 border-secondary text-secondary hover:bg-secondary/10 hover:shadow-glow-neon-inset hover:border-secondary",
        neonOutline: "bg-transparent border border-secondary/50 text-secondary hover:border-secondary hover:shadow-glow-aura-neon hover:text-secondary-foreground hover:bg-secondary/20 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-secondary/20 before:to-transparent before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700",
        success: "bg-success text-success-foreground hover:bg-success/90 hover:shadow-glow-success-md",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    return (
      <Comp 
        className={cn(buttonVariants({ variant, size, className }))} 
        ref={ref} 
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

// MotionButton — mesmas animações de hover/tap que o botão animado anterior fazia
// por JS, agora só com CSS do tema: o efeito é sutil, roda apenas com
// `motion-safe:` (quem pede movimento reduzido não recebe hover/tap animado) e usa
// `transition-transform`/`duration-200`, tokens já existentes em tailwind.config.ts.
// Botão desabilitado (ou carregando) não anima: a base traz
// `disabled:pointer-events-none`, então o hover/active nem chega ao elemento.
const motionButtonClasses =
  "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]";

interface MotionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  loadingText?: string;
}

const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ className, variant, size, isLoading = false, loadingText, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), motionButtonClasses, className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
MotionButton.displayName = "MotionButton";

export { Button, MotionButton, buttonVariants };
