import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { WelcomeModal } from '../WelcomeModal';

/**
 * O modal de boas-vindas (src/pages/Index.tsx, irmão do <AppShell>) é um overlay `fixed inset-0`
 * com o card do tour dentro, mas SEM papel de diálogo. Sem `role="dialog"` o axe trata todo o
 * conteúdo do card como conteúdo fora de landmark (regra `region`): eram ~3 dos 5 nós vistos em
 * 5 telas, estáveis nos 4 estados de tema.
 *
 * Corrigido com `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apontando para o próprio
 * <h2 id="welcome-modal-title"> — nome acessível resolvido pelo título que já existia.
 */
const fechar = () => undefined;
const iniciarTour = () => undefined;

describe('a11y: modal de boas-vindas (landmark dialog)', () => {
  it('o card é um dialog modal com nome acessível vindo do próprio título', () => {
    const { container } = render(
      <WelcomeModal isOpen onClose={fechar} onStartTour={iniciarTour} userName="Ana" />,
    );

    const dlg = container.querySelector('[role="dialog"]');
    expect(dlg).toBeTruthy();
    expect(dlg?.getAttribute('aria-modal')).toBe('true');

    const id = dlg?.getAttribute('aria-labelledby');
    expect(id).toBe('welcome-modal-title');
    expect(container.querySelector(`#${id}`)?.textContent).toMatch(/Bem-vindo/);
  });

  it('axe não acusa conteúdo fora de landmark (regra region)', async () => {
    const { container } = render(
      <WelcomeModal isOpen onClose={fechar} onStartTour={iniciarTour} userName="Ana" />,
    );

    // jsdom não tem layout: contraste fica fora (declarado); `region` é estrutural e é o alvo aqui.
    // Varre o document.body: com o container (fragmento) a regra nao dispara em jsdom.
    const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.filter((v) => v.id === 'region')).toEqual([]);
  });

  it('fechado não renderiza nada', () => {
    const { container } = render(
      <WelcomeModal isOpen={false} onClose={fechar} onStartTour={iniciarTour} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
