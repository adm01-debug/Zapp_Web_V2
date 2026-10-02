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
  it('metaprograms: 5 eixos com barras opostas + notas', () => {
    renderSheet('metaprograms');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Metaprogramas')).toBeInTheDocument();
    expect(screen.getByText('Foco em resultados')).toBeInTheDocument();
    expect(screen.getByText('Detalhista')).toBeInTheDocument();
    expect(screen.getByText('Notas de metaprogramas')).toBeInTheDocument();
  });

  it('fears: 4 campos', () => {
    renderSheet('fears');
    expect(screen.getByText('Perder status')).toBeInTheDocument();
    expect(screen.getByText('Reconhecimento')).toBeInTheDocument();
    expect(screen.getByText('Meta do trimestre')).toBeInTheDocument();
    expect(screen.getByText('Virar diretor')).toBeInTheDocument();
  });

  it('decision: velocidade + critérios + aprovação', () => {
    renderSheet('decision');
    expect(screen.getByText('Rápido')).toBeInTheDocument();
    expect(screen.getByText('Preço')).toBeInTheDocument();
    expect(screen.getByText('Qualidade')).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
  });

  it('budget: autoridade + papel + barra de poder 1-10', () => {
    renderSheet('budget');
    expect(screen.getByText('Aprovador final')).toBeInTheDocument();
    expect(screen.getByText('Decisor Final')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('influencers: nome + cargo por influenciador', () => {
    renderSheet('influencers');
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Sócia')).toBeInTheDocument();
    expect(screen.getByText('Pedro Lima')).toBeInTheDocument();
  });

  it('rapport: barras de canal + gatilhos + âncoras + resistências + notas', () => {
    renderSheet('rapport');
    expect(screen.getByText('urgencia')).toBeInTheDocument();
    expect(screen.getByText('time do coração')).toBeInTheDocument();
    expect(screen.getByText('pressão excessiva')).toBeInTheDocument();
    expect(screen.getByText('Notas de rapport')).toBeInTheDocument();
  });

  it('objections: cards com bias + effectiveness', () => {
    renderSheet('objections');
    expect(screen.getByText(/Não é sobre o preço/)).toBeInTheDocument();
    expect(screen.getByText(/ancoragem/)).toBeInTheDocument();
    expect(screen.getByText(/eficácia 0\.85/)).toBeInTheDocument();
  });

  it('sem dados do bloco → estado vazio honesto', () => {
    const vazio: SinguProfile = { ...profile, metaprograms: null };
    renderSheet('metaprograms', vazio);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
