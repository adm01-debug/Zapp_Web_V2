import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
}

export function PasswordInput({ id, className, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative group">
      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
      <Input
        id={id}
        type={showPassword ? 'text' : 'password'}
        placeholder="••••••••"
        className={cn(
          "pl-10 pr-10 glass border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all",
          className
        )}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-transparent"
        onClick={() => setShowPassword(!showPassword)}
        tabIndex={-1}
        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={showPassword}
      >
        {showPassword ? (
          <EyeOff aria-hidden="true" className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
        ) : (
          <Eye aria-hidden="true" className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
        )}
      </Button>
    </div>
  );
}
