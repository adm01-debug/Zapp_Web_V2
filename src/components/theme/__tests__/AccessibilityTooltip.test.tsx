/**
 * S27 do PLANO_CONTROLES_VOLUME_SIDEBAR (decisão D03, achado B3): o botão de acessibilidade da
 * sidebar — o ícone de círculo dividido, `AccessibilitySettings` — era um dos 3 botões dos
 * "Controles rápidos" sem dica nenhuma. Medido em 07/10 na pré-visualização: nenhuma dica em 4 s,
 * `title` e `aria-describedby` nulos. Aqui o que se prova:
 *
 * 1. a dica aparece ao passar o MOUSE sobre o botão;
 * 2. a dica aparece ao FOCAR (quem chega pelo teclado ou leitor de tela também vê);
 * 3. o `aria-label` do botão continua "Configurações de acessibilidade" — é o nome acessível que
 *    já existia e não pode mudar por causa da dica;
 * 4. (regressão do integrador) a dica funciona SEM TooltipProvider em volta, porque o painel é
 *    montado fora da árvore da sidebar — `routeTransitionReducedMotion.test.tsx` monta
 *    `<HighContrastProvider><AccessibilitySettings /></HighContrastProvider>`, sem provider de
 *    Tooltip: com o Tooltip solto o Radix lança "Tooltip must be used within TooltipProvider" e
 *    derruba 6 testes de outro arquivo. Por isso `montarBotao` monta só o HighContrastProvider.
 *
 * O teste renderiza o componente REAL (`AccessibilitySettings`) disparando os eventos do usuário,
 * não um mock: é o encaixe do Tooltip no botão que está sob prova.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccessibilitySettings, HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { TooltipProvider } from '@/components/ui/tooltip';

const DICA = 'Acessibilidade — alto contraste, menos movimento, texto grande';
const ROTULO = 'Configurações de acessibilidade';

// O provider reaplica a skin do tema ao montar (loadThemeConfig/applyThemePreset): caro e
// irrelevante para o que este teste prova.
vi.mock('@/components/settings/theme/presets', () => ({
  loadThemeConfig: () => ({ preset: 'default' }),
  applyThemePreset: vi.fn(),
}));

/** `HighContrastProvider` é o dono do contexto que o `AccessibilitySettings` consome — e SÓ ele:
 *  NENHUM TooltipProvider aqui fora, igual ao consumidor real em routeTransitionReducedMotion. */
function montarBotao() {
  return render(
    <HighContrastProvider>
      <AccessibilitySettings />
    </HighContrastProvider>,
  );
}

const acharBotao = () => screen.getByRole('button', { name: ROTULO });

beforeEach(() => {
  localStorage.clear();
});

describe('S27 — dica no botão de acessibilidade da sidebar', () => {
  it('ao passar o mouse, a dica aparece com o texto combinado', async () => {
    montarBotao();

    // Sem interação não há dica nenhuma (era exatamente o defeito: nenhuma em 4 s).
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(DICA);
  });

  it('ao focar pelo teclado, a dica aparece', async () => {
    montarBotao();

    acharBotao().focus();

    expect(await screen.findByRole('tooltip')).toHaveTextContent(DICA);
  });

  it('o aria-label do botão continua "Configurações de acessibilidade"', () => {
    montarBotao();

    expect(acharBotao()).toHaveAttribute('aria-label', ROTULO);
  });

  it('montado dentro do TooltipProvider do app (sidebar), a dica continua aparecendo', async () => {
    render(
      <TooltipProvider delayDuration={300}>
        <HighContrastProvider>
          <AccessibilitySettings />
        </HighContrastProvider>
      </TooltipProvider>,
    );

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent(DICA);
  });
});
