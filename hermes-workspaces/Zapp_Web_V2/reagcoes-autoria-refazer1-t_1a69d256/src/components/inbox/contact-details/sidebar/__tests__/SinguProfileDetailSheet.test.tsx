import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SinguProfileDetailSheet, type SinguDetailKind } from '../SinguProfileDetailSheet';
import type { SinguProfile } from '@/types/contactSidebar';

const profile: SinguProfile = {
  disc: null, vak: null, big_five: null, mbti: null, enneagram: null, temperament: null,
  metaprograms: {
    toward: 80, away_from: 20, internal: 60, external: 40, options: 70,
    procedures: 30, proactive: 85, reactive: 15, global: 65, detail: 35, notes: 'Notas de metaprogramas',
  },
  fears_motivation: {
    main_fear: 'Perder status', motivation_primary: 'Reconhecimento',
    current_pressure: 'Meta do trimestre', professional_goals: 'Virar diretor',
  },
  decision: { speed: 'fast', criteria: ['price', 'quality'], needs_approval: true, approver_name: 'Maria Souza' },
  budget: { authority: 'yes', decision_role: 'final_decision', decision_power: 8 },
  influencers: [
    { contact_id: '1', name: 'Maria Souza', cargo: 'Sócia' },
    { contact_id: '2', name: 'Pedro Lima', cargo: 'Mentor' },
  ],
  rapport: {
    pacing_speed: 'rapido', voice_tone_preferred: 'direto', mirroring_technique: 'postura',
    preferred_triggers: ['urgencia'], emotional_anchors: ['time do coração'],
    resistance_triggers: ['pressão excessiva'], notes: 'Notas de rapport',
    channel_scores: { visual: 80, auditory: 60, kinesthetic: 30, digital: 90 },
  },
  objection_scripts: [
    { objection_type: 'preco', script_content: 'Não é sobre o preço, é sobre o retorno', neurological_bias: 'ancoragem', effectiveness_score: 0.85 },
  ],
  assessed_at: '2026-01-15',
};

const LABELS: Record<SinguDetailKind, string> = {
  metaprograms: 'Metaprogramas', fears: 'Medos & Motivação', decision: 'Estilo de decisão',
  budget: 'Autoridade de orçamento', influencers: 'Influenciadores',
  rapport: 'Rapport & gatilhos', objections: 'Scripts de objeção',
};

function renderSheet(kind: SinguDetailKind, p: SinguProfile | null = profile) {
  return render(
    <SinguProfileDetailSheet open onOpenChange={vi.fn()} row={{ kind, label: LABELS[kind] }} profile={p} />,
  );
}

describe('SinguProfileDetailSheet (etapa 77)', () => {
  // Tabela dos 7 blocos de detalhe: cada caso afirma os textos-chave que o
  // detalhe daquele kind deve exibir.
  const CASES: Array<{ kind: SinguDetailKind; esperado: Array<string | RegExp> }> = [
    {
      kind: 'metaprograms',
      esperado: ['Metaprogramas', 'Foco em resultados', 'Detalhista', 'Notas de metaprogramas'],
    },
    { kind: 'fears', esperado: ['Perder status', 'Reconhecimento', 'Meta do trimestre', 'Virar diretor'] },
    { kind: 'decision', esperado: ['Rápido', 'Preço', 'Qualidade', 'Maria Souza'] },
    { kind: 'budget', esperado: ['Aprovador final', 'Decisor Final', '8'] },
    { kind: 'influencers', esperado: ['Maria Souza', 'Sócia', 'Pedro Lima'] },
    {
      kind: 'rapport',
      esperado: ['urgencia', 'time do coração', 'pressão excessiva', 'Notas de rapport'],
    },
    { kind: 'objections', esperado: [/Não é sobre o preço/, /ancoragem/, /eficácia 0\.85/] },
  ];

  for (const c of CASES) {
    it(`${c.kind}: renderiza o detalhe com os campos esperados`, () => {
      renderSheet(c.kind);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      for (const texto of c.esperado) {
        expect(screen.getByText(texto)).toBeInTheDocument();
      }
    });
  }

  it('sem dados do bloco → estado vazio honesto', () => {
    const vazio: SinguProfile = { ...profile, metaprograms: null };
    renderSheet('metaprograms', vazio);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
