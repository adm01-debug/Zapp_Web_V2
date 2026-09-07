import { ChevronLeft, Home } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLayoutContext } from '@/contexts/LayoutContext';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
  variant?: 'card' | 'plain';
  topRight?: React.ReactNode;
}

/**
 * Contextual page header with breadcrumbs and quick actions
 * Provides wayfinding and navigation context
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  showBack = false,
  onBack,
  actions,
  className,
  variant = 'card',
  topRight,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasBreadcrumbBar } = useLayoutContext();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  // Um único item "Início": se o chamador já o passa como primeiro breadcrumb,
  // ele vira o próprio link Home (ícone + texto visível) em vez de duplicar
  // com o sr-only do link genérico abaixo.
  const hasExplicitHome = breadcrumbs[0]?.label === 'Início';
  const homeCrumb = hasExplicitHome ? breadcrumbs[0] : undefined;
  const restCrumbs = hasExplicitHome ? breadcrumbs.slice(1) : breadcrumbs;

  return (
    <header className={cn(
      variant === 'plain'
        ? 'flex flex-col gap-2 px-0 pt-0 pb-2'
        : 'flex flex-col gap-2 px-6 py-4 border-b border-border/50 bg-card',
      className
    )}>
      {/* Breadcrumbs row — omitido quando o BreadcrumbBar global (AppShell) já cobre a trilha */}
      {((!hasBreadcrumbBar && breadcrumbs.length > 0) || topRight) && (
        <div className={cn('flex items-center justify-between gap-3 flex-wrap', variant === 'plain' && 'sm:h-14')}>
          {!hasBreadcrumbBar && breadcrumbs.length > 0 && (
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href="/"
                    onClick={(e) => {
                      if (homeCrumb?.onClick) {
                        e.preventDefault();
                        homeCrumb.onClick();
                      }
                    }}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Home className="w-3.5 h-3.5" />
                    {hasExplicitHome ? <span>Início</span> : <span className="sr-only">Início</span>}
                  </BreadcrumbLink>
                </BreadcrumbItem>

                {restCrumbs.map((crumb, index) => {
                  const isLast = index === restCrumbs.length - 1;

                  return (
                    <BreadcrumbItem key={crumb.label}>
                      <BreadcrumbSeparator />
                      {isLast ? (
                        <BreadcrumbPage className="font-semibold text-foreground">{crumb.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          href={crumb.href}
                          onClick={(e) => {
                            if (crumb.onClick) {
                              e.preventDefault();
                              crumb.onClick();
                            }
                          }}
                          className="hover:text-foreground transition-colors"
                        >
                          {crumb.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          )}

          {topRight && <div className="shrink-0">{topRight}</div>}
        </div>
      )}

      {/* Title row with actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="w-8 h-8 shrink-0"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}

          <div className="min-w-0">
            <h1 className={cn(
              variant === 'plain'
                ? 'text-[38px] font-extrabold tracking-[-0.02em] leading-none text-foreground truncate'
                : 'text-xl font-display font-bold text-foreground truncate'
            )}>{title}</h1>
            {subtitle && (
              <p className={cn(
                variant === 'plain' ? 'text-lg text-muted-foreground mt-2 truncate' : 'text-sm text-muted-foreground truncate'
              )}>{subtitle}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
