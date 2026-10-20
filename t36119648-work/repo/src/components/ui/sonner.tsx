import { useTheme } from '@/hooks/ui/useTheme';
import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="bottom-right"
      expand={false}
      richColors
      closeButton
      duration={4000}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card/98 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-[0_8px_30px_-8px_hsl(var(--foreground)/0.12)] group-[.toaster]:rounded-xl',
          description: 'group-[.toast]:text-muted-foreground group-[.toast]:text-[13px]',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:shadow-sm',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg',
          closeButton: 'group-[.toast]:bg-card group-[.toast]:border-border/40 group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground',
          success: 'group-[.toaster]:!bg-success/10 group-[.toaster]:!border-success/30 group-[.toaster]:!text-success group-[.toaster]:backdrop-blur-xl',
          error: 'group-[.toaster]:!bg-destructive/10 group-[.toaster]:!border-destructive/30 group-[.toaster]:!text-destructive group-[.toaster]:backdrop-blur-xl',
          warning: 'group-[.toaster]:!bg-warning/10 group-[.toaster]:!border-warning/30 group-[.toaster]:!text-warning group-[.toaster]:backdrop-blur-xl',
          info: 'group-[.toaster]:!bg-info/10 group-[.toaster]:!border-info/30 group-[.toaster]:!text-info group-[.toaster]:backdrop-blur-xl',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
