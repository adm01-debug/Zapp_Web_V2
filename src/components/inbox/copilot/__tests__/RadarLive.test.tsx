/**
 * RADAR Fases 4–6 sobre o esquema atual: conversores das linhas do banco,
 * contêiner sem sessão (motor desligado) e atalhos do painel (sem colidir com o navegador).
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { maybeSingle } = vi.hoisted(() => ({ maybeSingle: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    is: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle,
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { from: () => query, channel: () => channel, removeChannel: vi.fn() } };
});
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import RadarLive from '../RadarLive';
import { RadarPanel, type RadarPanelProps } from '../RadarPanel';
import { StageIndicator } from '../StageIndicator';
import { toCopilotSessionState } from '@/hooks/copilot/useCopilotSession';
import { splitInsights } from '@/hooks/copilot/useLiveSuggestions';
import { getBrindeQuestion } from '@/data/copilot/brinde-questions';

const LINHA = {
  id: 's1', sale_stage: 'negociando', temperature: 72, brinde_meter: 3, state_version: 4, last_tick_at: null,
  decision_role: 'decisor', occasion: 'fim de ano', comm_style: 'direto', intent: null, sentiment: null,
  stakeholders: [{ name: 'Ana', role: 'RH' }, { role: 'sem nome' }],
  brinde_evidence: { quantity: '300 canecas' },
  brinde_budget: null, brinde_responsible: 'Ana', brinde_intention: 'brinde de fim de ano',
  brinde_quantity: 300, brinde_deadline: null, brinde_delivery: '',
};

describe('toCopilotSessionState', () => {
  it('mapeia as colunas brinde_* para as letras e a evidência pela chave do motor', () => {
    const s = toCopilotSessionState(LINHA);
    expect(s.stage).toBe('negociando');
    expect(s.brinde_state).toEqual({ B: null, R: 'Ana', I: 'brinde de fim de ano', N: '300', D: null, E: null });
    expect(s.brinde_evidence.N).toBe('300 canecas');
    expect(s.stakeholders).toEqual([{ name: 'Ana', role: 'RH' }]);
  });

  it('etapa desconhecida cai em novo_contato', () => {
    expect(toCopilotSessionState({ ...LINHA, sale_stage: 'E3' }).stage).toBe('novo_contato');
  });
});

describe('splitInsights', () => {
  const base = { data: {}, created_at: '2026-10-30T10:00:00Z' };
  it('usa só a rodada mais recente e ordena avançar → descobrir → relacionar', () => {
    const r = splitInsights([
      { ...base, id: 'a', insight_type: 'suggestion', content: 'velha', state_version: 3, data: { path: 'avancar' } },
      { ...base, id: 'b', insight_type: 'suggestion', content: 'rel', state_version: 4, data: { path: 'relacionar' } },
      { ...base, id: 'c', insight_type: 'suggestion', content: 'av', state_version: 4, data: { path: 'avancar', split_messages: ['1', '2'] } },
      { ...base, id: 'd', insight_type: 'next_action', content: 'Enviar preço', state_version: 4 },
      { ...base, id: 'e', insight_type: 'alert', content: 'Comparando fornecedores', state_version: 4 },
    ]);
    expect(r.suggestions.map((s) => s.text)).toEqual(['av', 'rel']);
    expect(r.suggestions[0].split_messages).toEqual(['1', '2']);
    expect(r.nextStep).toBe('Enviar preço');
    expect(r.alerts).toEqual(['Comparando fornecedores']);
  });
});

describe('RadarLive', () => {
  it('sem sessão (motor desligado) não renderiza nada', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { container } = render(<RadarLive contactId="c1" onDraftText={vi.fn()} />);
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('com sessão mostra o painel com a etapa real', async () => {
    maybeSingle.mockResolvedValueOnce({ data: LINHA, error: null });
    render(<RadarLive contactId="c1" onDraftText={vi.fn()} />);
    expect(await screen.findByRole('complementary', { name: /RADAR Copiloto/i })).toBeTruthy();
    expect(screen.getAllByText('Negociando').length).toBeGreaterThan(0);
  });
});

describe('atalhos do RadarPanel', () => {
  const props = (): RadarPanelProps => ({
    mode: 'normal', collapsed: false, collapsedCards: [], cardOrder: ['suggestions'], isDnd: false,
    onSetMode: vi.fn(), onToggleCollapsed: vi.fn(), onToggleCard: vi.fn(), onEnableDnd: vi.fn(), onClearDnd: vi.fn(),
    session: null, sessionLoading: false, suggestionsLoading: false, onUseSuggestion: vi.fn(),
    suggestions: [{ id: 'x', path: 'avancar', text: 'Fecho hoje?', sources: [], created_at: '' }],
  });

  it('Ctrl+Shift+L recolhe e Ctrl+Alt+1 usa a sugestão; Ctrl+1 fica com o navegador', () => {
    const p = props();
    render(<RadarPanel {...p} />);
    fireEvent.keyDown(document, { key: 'L', ctrlKey: true, shiftKey: true });
    expect(p.onToggleCollapsed).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: '1', ctrlKey: true });
    expect(p.onUseSuggestion).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: '1', ctrlKey: true, altKey: true });
    expect(p.onUseSuggestion).toHaveBeenCalledWith('Fecho hoje?');
  });
});

describe('etapas reais', () => {
  it('StageIndicator mostra o rotulo e converte 0–100 em 10 barras', () => {
    render(<StageIndicator stage="fechando" temperature={73} />);
    expect(screen.getByText('Fechando')).toBeTruthy();
    expect(screen.getByLabelText('Temperatura de compra: 73/100')).toBeTruthy();
  });

  it('pergunta B·R·I·N·D·E escolhida pela fase da etapa', () => {
    expect(getBrindeQuestion('B', 'novo_contato')?.text).toMatch(/faixa de investimento/);
    expect(getBrindeQuestion('B', 'fechando')?.text).toMatch(/dentro do que foi aprovado/);
    expect(getBrindeQuestion('I', 'perdido')).toBeTruthy();
  });
});
