import { type ReactNode } from 'react';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarEmptyProps {
  /** sufixo do data-testid: `sidebar-empty-<cause>` */
  cause: string;
  message: string;
  icon?: ReactNode;
  cta?: { label: string; onClick: () => void };
}

/**
 * Estado vazio por seção: ícone 40px em círculo `bg-muted/20`, frase e CTA
 * opcional (etapa 47 do plano).
 */
export function SidebarEmpty({ cause, message, icon, cta }: SidebarEmptyProps) {
  return (
    <div data-testid={`sidebar-empty-${cause}`} className="flex flex-col items-center gap-2 py-4 text-center">
      <div className="w-10 h-10 rounded-full bg-muted/20 flex items-center justify-center text-muted-foreground [&>svg]:w-5 [&>svg]:h-5">
        {icon ?? <SearchX />}
      </div>
      <p className="text-xs text-muted-foreground max-w-[220px]">{message}</p>
      {cta && (
        <Button variant="outline" size="sm" onClick={cta.onClick}>
          {cta.label}
        </Button>
      )}
    </div>
  );
}
