/**
 * Y18-4 / SHELL-11 — na barra lateral EXPANDIDA o botão de favorito era um
 * `<button>` DENTRO do `<button data-tour={item.id}>` do item
 * (`SidebarNavItem.tsx`, achado 11 da auditoria Y18): o axe reprova isso como
 * `nested-interactive` [serious] e mediu 7 nós nos 4 combos do desktop. O item
 * também tem de continuar navegando (`onViewChange`) e o favorito de continuar
 * tabulável e clicável (a auditoria registrou que ele NÃO é decorativo).
 *
 * Correção: o favorito passa a ser IRMÃO posicionado sobre o item — o item deixa
 * de ser o container dele. Esta é a prova (falha sem a correção, passa com ela).
 */
import type { ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { LayoutDashboard } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';

vi.mock('@/hooks/ui/usePrefetchOnHover', () => ({
  usePrefetchOnHover: () => ({ prefetch: vi.fn() }),
}));

const item = { id: 'security', icon: LayoutDashboard, label: 'Segurança' };

type Props = ComponentProps<typeof SidebarNavItem>;

function renderItem(over: Partial<Props> = {}) {
  return render(
    <TooltipProvider>
      <SidebarNavItem
        item={item}
        currentView="inbox"
        onViewChange={vi.fn()}
        collapsed={false}
        onToggleFavorite={vi.fn()}
        isFavorite={false}
        {...over}
      />
    </TooltipProvider>,
  );
}

afterEach(cleanup);

describe('SidebarNavItem (expandido) — favorito fora do botão do item (SHELL-11)', () => {
  it('o botão do item não contém o botão de favorito (sem nested-interactive)', async () => {
    const { container } = renderItem();

    const itemBtn = screen.getByRole('button', { name: 'Segurança' });
    const favBtn = screen.getByRole('button', { name: 'Adicionar aos favoritos' });

    // A regra que a auditoria mediu (o jsdom avalia a estrutura, não a cor).
    const results = await axe(container);
    expect(results.violations.map((v) => v.id)).not.toContain('nested-interactive');

    // Estrutura: o favorito é irmão, não descendente do item.
    expect(itemBtn.contains(favBtn)).toBe(false);
  });

  it('navegar e favoritar continuam funcionando, e favoritar não navega', () => {
    const onViewChange = vi.fn();
    const onToggleFavorite = vi.fn();
    renderItem({ onViewChange, onToggleFavorite });

    fireEvent.click(screen.getByRole('button', { name: 'Segurança' }));
    expect(onViewChange).toHaveBeenCalledWith('security');
    expect(onViewChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar aos favoritos' }));
    expect(onToggleFavorite).toHaveBeenCalledWith('security');
    // Favoritar não pode disparar a navegação do item.
    expect(onViewChange).toHaveBeenCalledTimes(1);
  });

  it('o data-tour continua no botão do item e o favorito é tabulável (não decorativo)', () => {
    renderItem();

    const itemBtn = screen.getByRole('button', { name: 'Segurança' });
    expect(itemBtn).toHaveAttribute('data-tour', 'security');

    // Sem tabIndex=-1/aria-hidden: o favorito permanece na ordem de tabulação.
    const favBtn = screen.getByRole('button', { name: 'Adicionar aos favoritos' });
    expect(favBtn).not.toHaveAttribute('tabindex', '-1');
    expect(favBtn).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('item já favorito anuncia "Remover dos favoritos"', () => {
    renderItem({ isFavorite: true });
    expect(screen.getByRole('button', { name: 'Remover dos favoritos' })).toBeInTheDocument();
  });

  it('sem onToggleFavorite nada muda: não aparece favorito', () => {
    renderItem({ onToggleFavorite: undefined });
    expect(screen.queryByRole('button', { name: /favoritos/ })).toBeNull();
  });
});
