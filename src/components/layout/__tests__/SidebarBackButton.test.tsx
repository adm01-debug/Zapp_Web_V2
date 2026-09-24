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
});
