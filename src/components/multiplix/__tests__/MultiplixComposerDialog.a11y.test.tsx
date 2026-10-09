/**
 * TL-045 (F86) — acessibilidade do composer de disparo Multiplix
 * (`src/components/multiplix/MultiplixComposerDialog.tsx`).
 *
 * Lacuna: os dois campos ("Nome do disparo" e "Mensagem") tinham apenas um
 * `<span>` decorativo em cima e um placeholder; o controle em si não tinha
 * NENHUM nome acessível (axe `label`, impacto `critical`) — quem navega por
 * leitor de tela ouvia só "caixa de edição" / "edição de texto". O teste fixa:
 *   1. cada campo responde ao próprio rótulo VISÍVEL (`getByLabelText`);
 *   2. a varredura axe do diálogo aberto não tem violação séria/critical;
 *   3. o fluxo por teclado continua: preencher os dois campos habilita o envio;
 *   4. o foco entra e permanece no diálogo (trap do Radix, auditado).
 *
 * Radix roda de verdade (o `ResizeObserver` já é polyfillado no
 * `src/test/setup.ts`, que também registra o matcher do axe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

const h = vi.hoisted(() => ({ busy: false }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// A criacao do disparo e a conversa com a edge: irrelevantes para a auditoria
// de acessibilidade. `MultiplixOverLimitError` e importado pelo componente
// para o `instanceof`, entao precisa existir no mock.
vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  MultiplixOverLimitError: class MultiplixOverLimitError extends Error {
    count = 0;
    limit: number | null = null;
  },
  useCreateMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: h.busy }),
}));

import { MultiplixComposerDialog } from '@/components/multiplix/MultiplixComposerDialog';

const SERIOUS = new Set(['critical', 'serious']);

function renderDialog() {
  return render(
    <MultiplixComposerDialog
      open
      onOpenChange={vi.fn()}
      selectedCompanyIds={['c1', 'c2']}
      onCreated={vi.fn()}
    />,
  );
}

beforeEach(() => {
  cleanup();
  h.busy = false;
});

describe('MultiplixComposerDialog — nomes acessíveis dos campos (TL-045/F86)', () => {
  it('"Nome do disparo" tem nome acessível ligado ao rótulo visível', () => {
    renderDialog();

    const campo = screen.getByLabelText('Nome do disparo (opcional)');
    expect(campo.tagName).toBe('INPUT');
  });

  it('"Mensagem" tem nome acessível ligado ao rótulo visível', () => {
    renderDialog();

    const campo = screen.getByLabelText('Mensagem');
    expect(campo.tagName).toBe('TEXTAREA');
  });

  it('o diálogo aberto não tem violação séria/critical no axe', async () => {
    renderDialog();

    // O DialogContent vive num portal fora do `container` do render: a
    // varredura tem de ser em `document.body` (senão o alvo fica vazio e a
    // varredura seria vácuo).
    const results = await axe(document.body);

    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });

  it('preencher os dois campos continua habilitando o envio', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nome do disparo (opcional)'), { target: { value: 'Convite feira 2026' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Ola {{empresa}}' } });

    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Salvar e iniciar agora' })).toBeEnabled();
  });

  it('o foco entra no diálogo na abertura (o Tab não começa no corpo da página)', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Novo disparo Multiplix' });
    // Radix move o foco para dentro do conteudo ao abrir e mantem os
    // elementos de fora inertes (`aria-hidden`): sem isso o Tab comecaria no
    // corpo da tela atras do modal.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('os spinners respeitam `prefers-reduced-motion` (motion-safe:)', () => {
    h.busy = true;
    renderDialog();

    // Todo elemento animado do diálogo tem de estar sob `motion-safe:`, senão
    // a animação roda também para quem pediu movimento reduzido.
    const animados = Array.from(document.body.querySelectorAll('[class*="animate-spin"]'));
    expect(animados.length).toBe(2);
    for (const el of animados) {
      expect(el.getAttribute('class')).toContain('motion-safe:animate-spin');
    }
  });

  it('o modal de confirmação ("Iniciar disparo agora?") também passa no axe', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('Nome do disparo (opcional)'), { target: { value: 'Convite feira 2026' } });
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Ola {{empresa}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e iniciar agora' }));

    expect(await screen.findByRole('alertdialog', { name: 'Iniciar disparo agora?' })).toBeInTheDocument();

    const results = await axe(document.body);
    expect({
      ...results,
      violations: results.violations.filter((v) => SERIOUS.has(v.impact ?? '')),
    }).toHaveNoViolations();
  });
});
