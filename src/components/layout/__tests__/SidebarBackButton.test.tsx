import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarBackButton } from '../SidebarBackButton';

type Props = React.ComponentProps<typeof SidebarBackButton>;

function renderButton(props: Props) {
  return render(
    <TooltipProvider>
      <SidebarBackButton {...props} />
    </TooltipProvider>
  );
}

describe('SidebarBackButton', () => {
  it('não aparece quando não há histórico para voltar', () => {
    renderButton({ canGoBack: false, onGoBack: vi.fn(), collapsed: false });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('não aparece sem handler de voltar', () => {
    renderButton({ canGoBack: true, collapsed: false });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('chama onGoBack ao clicar quando há histórico', () => {
    const onGoBack = vi.fn();
    renderButton({ canGoBack: true, onGoBack, collapsed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à tela anterior' }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('também aparece e funciona com a sidebar recolhida', () => {
    const onGoBack = vi.fn();
    renderButton({ canGoBack: true, onGoBack, collapsed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à tela anterior' }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('recolhida: reserva o espaço mesmo sem histórico, para o menu não pular quando o botão aparece', () => {
    const { container } = renderButton({ canGoBack: false, onGoBack: vi.fn(), collapsed: true });
    expect(screen.queryByRole('button')).toBeNull();
    const placeholder = container.querySelector('[aria-hidden="true"]');
    expect(placeholder).not.toBeNull();
    expect(placeholder).toHaveClass('h-[38px]');
  });

  it('expandida: sem histórico não renderiza nada (a linha do topo já tem altura fixa)', () => {
    const { container } = renderButton({ canGoBack: false, onGoBack: vi.fn(), collapsed: false });
    expect(container.firstChild).toBeNull();
  });

  it('recolhida: o placeholder some e vira o botão real quando o histórico aparece (sem duplicar)', () => {
    const hasPlaceholder = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('div')).some((el) => el.classList.contains('h-[38px]'));

    const onGoBack = vi.fn();
    const { container, rerender } = render(
      <TooltipProvider>
        <SidebarBackButton canGoBack={false} onGoBack={onGoBack} collapsed />
      </TooltipProvider>
    );
    expect(hasPlaceholder(container)).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();

    rerender(
      <TooltipProvider>
        <SidebarBackButton canGoBack={true} onGoBack={onGoBack} collapsed />
      </TooltipProvider>
    );
    expect(hasPlaceholder(container)).toBe(false);
    expect(screen.getAllByRole('button', { name: 'Voltar à tela anterior' })).toHaveLength(1);
  });
});
