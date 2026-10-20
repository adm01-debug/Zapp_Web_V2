/**
 * Etapa 62 — a COR do badge do item Tarefas precisa dizer o estado:
 * vermelho quando ha tarefa atrasada, amarelo quando o badge e so de avisos
 * ja disparados e nao tratados. O `SidebarNavItem` pintava `bg-destructive`
 * fixo, ignorando os dois casos (achado do dono em 02/10).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutDashboard } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';

vi.mock('@/hooks/ui/usePrefetchOnHover', () => ({
  usePrefetchOnHover: () => ({ prefetch: vi.fn() }),
}));

const item = { id: 'tasks', icon: LayoutDashboard, label: 'Tarefas' };

function renderBadge(badgeVariant?: 'destructive' | 'warning') {
  return render(
    <TooltipProvider>
      <SidebarNavItem
        item={item}
        currentView="inbox"
        onViewChange={vi.fn()}
        badge={3}
        badgeVariant={badgeVariant}
        collapsed={false}
      />
    </TooltipProvider>
  );
}

describe('SidebarNavItem — cor do badge de Tarefas (etapa 62)', () => {
  it('com tarefa atrasada: badge vermelho (bg-destructive)', () => {
    renderBadge('destructive');
    const badge = screen.getByText('3');
    expect(badge.className).toContain('bg-destructive');
    expect(badge.className).not.toContain('bg-warning');
  });

  it('sem atrasada (so avisos disparados): badge amarelo (bg-warning)', () => {
    renderBadge('warning');
    const badge = screen.getByText('3');
    expect(badge.className).toContain('bg-warning');
    expect(badge.className).not.toContain('bg-destructive');
  });

  it('sem a variante explicita continua vermelho (compatibilidade com o inbox)', () => {
    renderBadge();
    expect(screen.getByText('3').className).toContain('bg-destructive');
  });
});
