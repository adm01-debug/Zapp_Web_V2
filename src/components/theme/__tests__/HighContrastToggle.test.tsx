/**
 * S27 do PLANO_CONTROLES_VOLUME_SIDEBAR (decisão D03, achado B3) + o refazer 1 do Q04.
 *
 * O botão de acessibilidade da sidebar — o ícone de círculo dividido, `AccessibilitySettings` —
 * era um dos 3 botões dos "Controles rápidos" sem dica nenhuma. Medido em 07/10 na
 * pré-visualização: nenhuma dica em 4 s, `title` e `aria-describedby` nulos. Aqui o que se prova:
 *
 * 1. a dica aparece ao passar o MOUSE sobre o botão, com o texto exato combinado;
 * 2. a dica aparece ao FOCAR (quem chega pelo teclado ou leitor de tela também vê);
 * 3. a dica é pedida à DIREITA do botão — é o lado que funciona com a sidebar recolhida;
 * 4. o `aria-label` do botão continua "Configurações de acessibilidade" — é o nome acessível que
 *    já existia e não pode mudar por causa da dica.
 *
 * Por que o teste monta o componente SEM `TooltipProvider` externo: esta é exatamente a condição
 * que recusou a entrega anterior. `routeTransitionReducedMotion.test.tsx` monta o painel REAL
 * (`AccessibilitySettings`) sem passar pelo `AppProviders`, e o Radix lançava
 * `Tooltip must be used within TooltipProvider`, derrubando os 6 testes daquele arquivo. O
 * componente passa a se bastar com o `TooltipProvider` que ele mesmo monta; o teste guarda isso.
 *
 * O teste renderiza o componente REAL disparando os eventos do usuário, não um mock: é o encaixe
 * do Tooltip no botão que está sob prova.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccessibilitySettings, HighContrastProvider } from '@/components/theme/HighContrastToggle';

const DICA = 'Acessibilidade — alto contraste, menos movimento, texto grande';
const ROTULO = 'Configurações de acessibilidade';

// O provider reaplica a skin do tema ao montar (loadThemeConfig/applyThemePreset): caro e
// irrelevante para o que este teste prova.
vi.mock('@/components/settings/theme/presets', () => ({
  loadThemeConfig: () => ({ preset: 'default' }),
  applyThemePreset: vi.fn(),
}));

/** Só o `HighContrastProvider` (o dono do contexto que o `AccessibilitySettings` consome).
 *  NENHUM `TooltipProvider` externo de propósito — ver o cabeçalho. */
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

  it('a dica sai à direita do botão (o lado que a sidebar recolhida deixa livre)', async () => {
    montarBotao();

    fireEvent.pointerMove(acharBotao(), { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveAttribute('data-side', 'right');
  });

  it('o aria-label do botão continua "Configurações de acessibilidade"', () => {
    montarBotao();

    expect(acharBotao()).toHaveAttribute('aria-label', ROTULO);
  });
});
