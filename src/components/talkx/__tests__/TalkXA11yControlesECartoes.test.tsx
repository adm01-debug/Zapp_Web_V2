import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * TL-175D (t_eedf548a) — nome acessível dos controles e cartão sem controle aninhado.
 *
 * A varredura axe WCAG 2.1 AA da régua `e2e/talkx-visual.spec.ts` (Chromium real,
 * sessão falsa + fixture, nos dois temas) reprovava, no código do dia:
 *
 *   tela 17 · Configurações — o Switch da linha (`<button role="switch">`) sem nome
 *                             acessível (`button-name` [critical]) e os campos de texto
 *                             sem `<label for>` nem `aria-label` (`label` [critical]);
 *   tela 04 · Templates      — 4 cartões de template com `role="button"` e os botões de
 *                             ação DENTRO deles (`nested-interactive` [serious]).
 *
 * Este teste fixa, no jsdom, o comportamento que o axe passou a medir: o rótulo da
 * linha NOMEIA o controle, e o cartão não é um controle com controles dentro.
 * Vermelho antes da correção: as consultas por nome acessível não acham o elemento e
 * `closest('[role="button"]')` devolve o cartão.
 */

vi.mock('@/hooks/integrations/useTalkXSettings', () => ({
  useTalkXSettings: () => ({
    data: [
      { key: 'ai_insights', value: true, description: 'Resumo automático por IA' },
      { key: 'ai_tone', value: 'moderate', description: 'Tom das respostas' },
      { key: 'retention_days', value: '240', description: 'Janela de retenção' },
      { key: 'history_days', value: '365', description: 'Histórico de envios' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useTalkXSettingUpdate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [
      {
        id: 'tpl-1',
        name: 'Boas-vindas',
        description: 'Primeiro contato',
        category: 'geral',
        content: 'Olá {{nome}}, seja bem-vindo(a)!',
        media_url: null,
        media_type: null,
        tags: ['sintetico'],
        status: 'approved' as const,
        use_count: 12,
        created_by: null,
        custom_variables: [],
        created_at: '2026-10-01T12:00:00.000Z',
        updated_at: '2026-10-01T12:00:00.000Z',
        current_version_id: null,
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn() },
    updateTemplate: { mutate: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn() },
  }),
}));

import { TalkXSettings } from '../TalkXSettings';
import { TalkXTemplates } from '../TalkXTemplates';

describe('tela 17 · o rótulo da linha nomeia o controle (TL-175D)', () => {
  it('o Switch da linha tem nome acessível', () => {
    render(<TalkXSettings />);
    expect(screen.getByRole('switch', { name: 'ai_insights' })).toBeTruthy();
  });

  it('cada campo de texto tem nome acessível', () => {
    render(<TalkXSettings />);
    for (const chave of ['ai_tone', 'retention_days', 'history_days']) {
      expect(screen.getByRole('textbox', { name: chave })).toBeTruthy();
    }
  });
});

describe('tela 04 · o cartão de template não é controle com controle dentro (TL-175D)', () => {
  it('os botões de ação não estão dentro de um controle com papel de botão', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    const usar = screen.getByRole('button', { name: 'Usar template' });
    expect(
      usar.closest('[role="button"]'),
      'o cartão não pode ter papel de botão com botões de ação dentro (nested-interactive)',
    ).toBeNull();
    expect(usar.parentElement?.closest('button') ?? null, 'nenhum botão de ação pode ter um botão como ancestral').toBeNull();
  });

  it('o cartão continua respondendo ao clique do mouse', () => {
    render(<TalkXTemplates onUseTemplate={vi.fn()} />);
    const cartao = screen.getByRole('button', { name: 'Usar template' }).closest('div.rounded-2xl');
    expect(cartao).toBeTruthy();
    expect(cartao!.className).not.toContain('bg-primary/5');
    fireEvent.click(cartao!);
    expect(cartao!.className).toContain('bg-primary/5');
  });
});
