import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      size: {
        xs: "h-6 w-6 text-3xs",
        sm: "h-8 w-8 text-xs",
        default: "h-10 w-10 text-sm",
        lg: "h-12 w-12 text-base",
        xl: "h-16 w-16 text-lg",
        "2xl": "h-20 w-20 text-xl",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

interface AvatarProps 
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatarVariants> {}

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  AvatarProps
>(({ className, size, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(avatarVariants({ size }), className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image ref={ref} className={cn("aspect-square h-full w-full object-cover", className)} {...props} />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted font-medium", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

// Status indicator component
type StatusType = 'online' | 'away' | 'busy' | 'offline' | 'dnd';

interface StatusIndicatorProps {
  status: StatusType;
  size?: 'sm' | 'default' | 'lg';
  pulse?: boolean;
  className?: string;
}

const statusStyles: Record<StatusType, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  busy: 'bg-destructive',
  offline: 'bg-muted-foreground/50',
  dnd: 'bg-destructive',
};

const statusSizes = {
  sm: 'w-2 h-2',
  default: 'w-3 h-3',
  lg: 'w-4 h-4',
};

const StatusIndicator = React.memo(function StatusIndicator({ status, size = 'default', pulse = true, className }: StatusIndicatorProps) {
  return (
    <span className={cn("relative flex", className)}>
      <span className={cn(
        "rounded-full ring-2 ring-background",
        statusStyles[status],
        statusSizes[size],
      )} />
      {pulse && status === 'online' && (
        <motion.span
          className={cn(
            "absolute inset-0 rounded-full",
            statusStyles[status],
          )}
          animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </span>
  );
});

// Avatar with status indicator
interface AvatarWithStatusProps extends AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  status?: StatusType;
  statusPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  showStatusPulse?: boolean;
}

const positionStyles = {
  'bottom-right': 'bottom-0 right-0',
  'bottom-left': 'bottom-0 left-0',
  'top-right': 'top-0 right-0',
  'top-left': 'top-0 left-0',
};

function AvatarWithStatus({
  src,
  alt,
  fallback,
  status,
  statusPosition = 'bottom-right',
  showStatusPulse = true,
  size,
  className,
  ...props
}: AvatarWithStatusProps) {
  const statusSize = size === 'xs' || size === 'sm' ? 'sm' : size === 'lg' || size === 'xl' || size === '2xl' ? 'lg' : 'default';

  return (
    <div className="relative inline-block">
      <Avatar size={size} className={className} {...props}>
        <AvatarImage src={src} alt={alt} />
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      {status && (
        <span className={cn("absolute", positionStyles[statusPosition])}>
          <StatusIndicator status={status} size={statusSize} pulse={showStatusPulse} />
        </span>
      )}
    </div>
  );
}

// Avatar group component
interface AvatarGroupProps {
  avatars: Array<{
    src?: string;
    alt?: string;
    fallback?: string;
  }>;
  max?: number;
  size?: VariantProps<typeof avatarVariants>['size'];
  className?: string;
}

function AvatarGroup({ avatars, max = 4, size = 'default', className }: AvatarGroupProps) {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visibleAvatars.map((avatar, index) => (
        <Avatar 
          key={index} 
          size={size}
          className="ring-2 ring-background"
        >
          <AvatarImage src={avatar.src} alt={avatar.alt} />
          <AvatarFallback>{avatar.fallback}</AvatarFallback>
        </Avatar>
      ))}
      {remainingCount > 0 && (
        <Avatar size={size} className="ring-2 ring-background">
          <AvatarFallback className="bg-muted text-muted-foreground">
            +{remainingCount}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

export { 
  Avatar, 
  AvatarImage, 
  AvatarFallback, 
  AvatarWithStatus,
  AvatarGroup,
  StatusIndicator,
  avatarVariants,
  type StatusType,
};
