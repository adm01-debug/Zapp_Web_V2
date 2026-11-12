import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactIntelligencePanel } from '../ContactIntelligencePanel';

interface Briefing {
  opening_tip: string;
  risk_alert: string | null;
  days_since_last_contact: number | null;
  total_interactions: number;
  relationship_score: number | null;
}

interface Intel {
  found: boolean;
  briefing: Briefing | null;
  churn: {
    churn_probability: number;
    risk_level: string;
    risk_factors: Record<string, unknown> | null;
    recommended_actions: string[] | null;
  } | null;
  best_times: { day_of_week: number; hour: number; success_rate?: number }[];
  triggers: { trigger_name: string }[];
  rapport: { suggestions: string[] };
  disc_tips: { profile: string } | null;
}

const hook = vi.hoisted(() => ({
  data: null as Intel | null,
  isLoading: false,
  crmEnabled: true,
}));

vi.mock('@/hooks/system/useCRMIntegrationEnabled', () => ({
  useCRMIntegrationEnabled: () => hook.crmEnabled,
}));

vi.mock('@/hooks/crm/useContactIntelligence', () => ({
  useContactIntelligence: () => ({ data: hook.data, isLoading: hook.isLoading }),
}));

function fullData(over: Partial<Intel> = {}): Intel {
  return {
    found: true,
    briefing: {
      opening_tip: 'Retomar o orçamento de canecas enviado em setembro',
      risk_alert: 'Cliente reclamou do prazo na última compra',
      days_since_last_contact: 12,
      total_interactions: 34,
      relationship_score: 78,
    },
    churn: {
      churn_probability: 82.4,
      risk_level: 'high',
      risk_factors: { dias_sem_contato: 45, tickets_abertos: 2 },
      recommended_actions: ['Ligar hoje mesmo'],
    },
    best_times: [{ day_of_week: 1, hour: 9, success_rate: 60 }],
    triggers: [{ trigger_name: 'Escassez' }],
    rapport: { suggestions: ['Falar de futebol'] },
    disc_tips: { profile: 'D' },
    ...over,
  };
}

beforeEach(() => {
  hook.data = null;
  hook.isLoading = false;
  hook.crmEnabled = true;
});

describe('ContactIntelligencePanel — churn e melhores horários', () => {
  it('mostra o risco de churn com nível e motivo devolvidos pelo CRM', () => {
    hook.data = fullData();
    render(<ContactIntelligencePanel contactId="c1" />);

    const churn = screen.getByTestId('intelligence-churn');
    expect(churn).toBeInTheDocument();
    // nível legível + probabilidade
    expect(churn).toHaveTextContent('Alto · 82%');
    // motivo: os fatores reais do CRM, com a chave legível
    expect(churn).toHaveTextContent('dias sem contato:');
    expect(churn).toHaveTextContent('45');
    expect(churn).toHaveTextContent('tickets abertos:');
  });

  it('mostra os melhores horários observados', () => {
    hook.data = fullData();
    render(<ContactIntelligencePanel contactId="c1" />);

    const times = screen.getByTestId('intelligence-best-times');
    expect(times).toHaveTextContent('Seg');
    expect(times).toHaveTextContent('9h');
    expect(times).toHaveTextContent('60%');
  });

  it('não repete DISC, rapport nem gatilhos (já estão na seção Singu)', () => {
    hook.data = fullData();
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.queryByText(/DISC/i)).toBeNull();
    expect(screen.queryByText(/Rapport/i)).toBeNull();
    expect(screen.queryByText(/[Gg]atilhos mentais/)).toBeNull();
    expect(screen.queryByText('Escassez')).toBeNull();
    expect(screen.queryByText('Falar de futebol')).toBeNull();
  });

  it('sem ficha no CRM mostra estado vazio honesto (nada de churn nem horário)', () => {
    hook.data = { ...fullData(), found: false };
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-empty')).toHaveTextContent('Sem inteligência comercial para este contato.');
    expect(screen.queryByTestId('intelligence-churn')).toBeNull();
    expect(screen.queryByTestId('intelligence-best-times')).toBeNull();
  });

  it('com ficha sem bloco de churn diz isso, sem inventar risco', () => {
    hook.data = fullData({ churn: null });
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByText('Sem risco calculado para este contato.')).toBeInTheDocument();
  });

  it('sem horários observados não sugere horário genérico', () => {
    hook.data = fullData({ best_times: [] });
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-best-times')).toHaveTextContent('Sem horários observados para este contato.');
    expect(screen.queryByText(/9h e 11h/)).toBeNull();
  });

  it('enquanto carrega mostra esqueleto e nenhum dado', () => {
    hook.isLoading = true;
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.queryByTestId('intelligence-churn')).toBeNull();
    expect(screen.queryByTestId('intelligence-empty')).toBeNull();
  });

  it('com a integração do CRM desligada diz isso, sem chamar o CRM', () => {
    hook.crmEnabled = false;
    hook.data = fullData();
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-empty')).toHaveTextContent('Integração com o CRM desligada.');
    expect(screen.queryByTestId('intelligence-churn')).toBeNull();
  });
});

describe('ContactIntelligencePanel — briefing pré-contato do CRM', () => {
  it('mostra dica de abordagem, alerta e métricas devolvidos pelo CRM', () => {
    hook.data = fullData();
    render(<ContactIntelligencePanel contactId="c1" />);

    const briefing = screen.getByTestId('intelligence-briefing');
    expect(screen.getByText('Briefing pré-contato')).toBeInTheDocument();
    expect(briefing).toHaveTextContent('Retomar o orçamento de canecas enviado em setembro');
    expect(screen.getByRole('alert')).toHaveTextContent('Cliente reclamou do prazo na última compra');
    expect(briefing).toHaveTextContent('Último contato12d');
    expect(briefing).toHaveTextContent('Interações34');
    expect(briefing).toHaveTextContent('Score78');
  });

  it('último contato hoje aparece como "Hoje"', () => {
    hook.data = fullData({
      briefing: { opening_tip: 'Oi', risk_alert: null, days_since_last_contact: 0, total_interactions: 1, relationship_score: 10 },
    });
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-briefing')).toHaveTextContent('Último contatoHoje');
  });

  it('campos vazios do briefing viram "—" e não inventam dica nem alerta', () => {
    hook.data = fullData({
      briefing: { opening_tip: '  ', risk_alert: null, days_since_last_contact: null, total_interactions: 0, relationship_score: null },
    });
    render(<ContactIntelligencePanel contactId="c1" />);

    const briefing = screen.getByTestId('intelligence-briefing');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(briefing).toHaveTextContent('Último contato—');
    expect(briefing).toHaveTextContent('Interações0');
    expect(briefing).toHaveTextContent('Score—');
  });

  it('score zero é mostrado como 0, não como vazio', () => {
    hook.data = fullData({
      briefing: { opening_tip: 'Oi', risk_alert: null, days_since_last_contact: 3, total_interactions: 2, relationship_score: 0 },
    });
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-briefing')).toHaveTextContent('Score0');
  });

  it('ficha sem bloco de briefing mostra vazio honesto', () => {
    hook.data = fullData({ briefing: null });
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-briefing-empty')).toHaveTextContent('Sem briefing do CRM para este contato.');
    expect(screen.queryByTestId('intelligence-briefing')).toBeNull();
  });

  it('erro na consulta ao CRM (hook devolve null) não mostra briefing', () => {
    hook.data = null;
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.getByTestId('intelligence-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('intelligence-briefing')).toBeNull();
  });

  it('enquanto carrega não mostra briefing', () => {
    hook.isLoading = true;
    render(<ContactIntelligencePanel contactId="c1" />);

    expect(screen.queryByTestId('intelligence-briefing')).toBeNull();
  });
});
