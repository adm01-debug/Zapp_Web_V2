import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Accordion } from '@/components/ui/accordion';
import { SinguProfileSection } from '../SinguProfileSection';
import type { ContactSidebarData, SinguProfile } from '@/types/contactSidebar';

const fullProfile: SinguProfile = {
  disc: { primary: 'D', blend: 'DI', confidence: 80, notes: null },
  vak: { primary: 'visual', visual: 80, auditory: 30, kinesthetic: 20 },
  big_five: { openness: 75, conscientiousness: 60, extraversion: 82, agreeableness: 40, neuroticism: 25, confidence: 70 },
  mbti: { type: 'ENTJ', e_i: 80, s_n: 50, t_f: 90, j_p: 55 },
  enneagram: { type: 3, wing: 2, scores: { '3': 90, '2': 40 } },
  temperament: { primary: 'colerico', secondary: 'sanguineo', notes: null },
  metaprograms: {
    toward: 80, away_from: 20, internal: 60, external: 40, options: 70,
    procedures: 30, proactive: 85, reactive: 15, global: 65, detail: 35, notes: null,
  },
  fears_motivation: {
    main_fear: 'Medo de perder o controle da operação inteira da empresa',
    motivation_primary: 'Reconhecimento', current_pressure: null, professional_goals: null,
  },
  decision: { speed: 'fast', criteria: ['price', 'quality'], needs_approval: false, approver_name: null },
  budget: { authority: 'yes', decision_role: 'final_decision', decision_power: 8 },
  influencers: [
    { contact_id: '1', name: 'Maria Souza', cargo: 'Sócia' },
    { contact_id: '2', name: 'Pedro Lima', cargo: 'Mentor' },
    { contact_id: '3', name: 'Ana Costa', cargo: 'Conselheira' },
  ],
  rapport: {
    pacing_speed: 'rapido', voice_tone_preferred: 'direto', mirroring_technique: null,
    preferred_triggers: ['urgencia'], emotional_anchors: [], resistance_triggers: [],
    notes: null, channel_scores: { visual: 80, auditory: 60, kinesthetic: 30, digital: 90 },
  },
  objection_scripts: [
    { objection_type: 'preco', script_content: 'Script de preço', neurological_bias: 'ancoragem', effectiveness_score: 0.85 },
    { objection_type: 'tempo', script_content: 'Script de tempo', neurological_bias: null, effectiveness_score: null },
    { objection_type: 'preco', script_content: 'Duplicado', neurological_bias: null, effectiveness_score: null },
  ],
  assessed_at: '2026-01-15',
};

const fullData: ContactSidebarData = { found: true, contact_id: 'crm-1', singu_profile: fullProfile };

function renderSection(overrides: Partial<Parameters<typeof SinguProfileSection>[0]> = {}) {
  const props = { index: 0, status: 'ok' as const, data: fullData, onBuscarCRM: vi.fn(), onRetry: vi.fn(), ...overrides };
  render(
    <Accordion type="multiple" defaultValue={['singu']}>
      <SinguProfileSection {...props} />
    </Accordion>,
  );
  return props;
}

const tileValue = (name: string) => within(screen.getByTestId(`singu-tile-${name}`));

describe('SinguProfileSection (etapas 69–80)', () => {
  // Tabela das 6 métricas da grade 2×3 (etapas 70–75): valor do tile e
  // aria-label da barra (Progress do Radix não expõe aria-valuenow ao
  // testing-library — o label propaga o valor já clampeado).
  const TILE_CASES: Array<{ name: string; valor: string; barra: string | null; etapa: number }> = [
    { name: 'disc', valor: 'D Dominante (DI)', barra: 'DISC: 80%', etapa: 70 },
    { name: 'vak', valor: 'Visual', barra: 'VAK: 80%', etapa: 71 },
    { name: 'big_five', valor: 'Alta Extroversão', barra: 'Big Five: 70%', etapa: 72 },
    { name: 'mbti', valor: 'ENTJ – O Comandante', barra: 'MBTI: 40%', etapa: 73 },
    { name: 'enneagram', valor: 'Tipo 3 – O Realizador (asa 2)', barra: 'Eneagrama: 90%', etapa: 74 },
    { name: 'temperament', valor: 'Colérico · Sanguíneo', barra: null, etapa: 75 },
  ];

  for (const c of TILE_CASES) {
    it(`tile ${c.name}: "${c.valor}"${c.barra ? ` com barra ${c.barra}` : ' sem barra'} (etapa ${c.etapa})`, () => {
      renderSection();
      const tile = tileValue(c.name);
      expect(tile.getByText(c.valor)).toBeInTheDocument();
      if (c.barra) expect(tile.getByRole('progressbar')).toHaveAttribute('aria-label', c.barra);
      else expect(tile.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  }

  it('7 linhas de detalhe com preview derivado (etapa 76)', () => {
    renderSection();
    const previews: Array<[string, RegExp]> = [
      ['metaprograms', /Foco em resultados/],
      ['fears', /Medo de perder o controle/],
      ['decision', /Rápido · Preço/],
      ['budget', /Aprovador final/],
      ['influencers', /Maria Souza, Pedro Lima \+1/],
      ['rapport', /urgencia/],
      ['objections', /preco, tempo/],
    ];
    for (const [kind, re] of previews) {
      const row = screen.getByTestId(`singu-row-${kind}`);
      expect(row).toBeEnabled();
      expect(within(row).getByText(re)).toBeInTheDocument();
    }
  });

  it('linha sem dado → "—" + chevron desabilitado (etapa 76)', () => {
    const onlyDisc: ContactSidebarData = {
      found: true,
      singu_profile: { ...fullProfile, metaprograms: null, fears_motivation: null, decision: null, budget: null, influencers: [], rapport: null, objection_scripts: [] },
    };
    renderSection({ data: onlyDisc });
    for (const kind of ['metaprograms', 'fears', 'decision', 'budget', 'influencers', 'rapport', 'objections']) {
      const row = screen.getByTestId(`singu-row-${kind}`);
      expect(row).toBeDisabled();
    }
  });

  it('clicar numa linha abre o Sheet de detalhe (etapa 77)', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('singu-row-decision'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Estilo de decisão')).toBeInTheDocument();
  });

  it('footer "Avaliado em dd/MM/yyyy" (etapa 78)', () => {
    renderSection();
    expect(screen.getByTestId('singu-assessed-footer')).toHaveTextContent('Avaliado em 15/01/2026');
  });

  it('perfil vazio → "Sem avaliação no Singu" (etapas 69/79)', () => {
    renderSection({ data: { found: true, singu_profile: null } });
    expect(screen.getAllByText('Sem avaliação no Singu').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('singu-assessed-footer')).toHaveTextContent('Sem avaliação no Singu');
  });

  it('5 estados de status (etapa 79)', () => {
    // loading
    renderSection({ status: 'loading', data: null });
    expect(screen.getByTestId('sidebar-singu-loading')).toBeInTheDocument();
    // disabled
    renderSection({ status: 'disabled', data: null });
    expect(screen.getByText('Integração com o Singu desligada')).toBeInTheDocument();
    // not_found + CTA
    const props = renderSection({ status: 'not_found', data: null });
    fireEvent.click(screen.getAllByRole('button', { name: 'Buscar no CRM' })[0]);
    expect(props.onBuscarCRM).toHaveBeenCalled();
    // error + retry
    const propsErr = renderSection({ status: 'error', data: null });
    fireEvent.click(screen.getAllByRole('button', { name: 'Tentar de novo' })[0]);
    expect(propsErr.onRetry).toHaveBeenCalled();
  });

  it('subtítulo exato (etapa 80)', () => {
    renderSection();
    expect(screen.getByText('Análise comportamental e estilo de comunicação')).toBeInTheDocument();
  });
});
