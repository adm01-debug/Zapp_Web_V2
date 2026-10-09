import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TL-138 (X122) — encaixe do wizard no shell: stepper navegável por teclado,
// rodapé fixo e saída com pendência.
//
// O teste renderiza o `TalkXCampaignWizard` REAL; só o hook de estado
// (`useCampaignEditor`, testado no arquivo dele) é dublado, para o teste poder
// levar a tela ao passo e à pendência que quer provar. O que se prova aqui é o
// comportamento da TELA: teclado andando pelos passos, aviso na saída com
// alteração pendente e trilha com o nome da campanha editada.
const h = vi.hoisted(() => ({
  pending: false,
  discard: vi.fn(),
  handleSave: vi.fn(() => Promise.resolve('draft_1')),
  setStepCalls: [] as number[],
  ed: {} as Record<string, unknown>,
}));

vi.mock('@/components/talkx/useCampaignEditor', async () => {
  const React = await import('react');
  return {
    useCampaignEditor: () => {
      const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);
      return {
        ...h.ed,
        step,
        setStep: (next: number) => { h.setStepCalls.push(next); setStep(next as 1 | 2 | 3 | 4); },
        hasUnsavedChanges: () => h.pending,
        discardPendingChanges: h.discard,
        handleSave: h.handleSave,
      };
    },
    VARIABLES: [],
    MESSAGE_TEMPLATES: [],
    MEDIA_TYPES: [],
    DEFAULT_SCHEDULE_TIMEZONE: 'America/Sao_Paulo',
  };
});

vi.mock('@/hooks/crm/useContactCustomFields', () => ({
  useContactCustomFields: () => ({ fields: [] }),
}));
vi.mock('@/hooks/integrations/useTalkXSegments', () => ({
  useAudienceEstimate: () => ({ data: undefined, isFetching: false }),
  RULE_FIELDS: [{ value: 'company', label: 'Empresa', kind: 'text' }],
  RULE_OPS: { text: [{ value: 'eq', label: 'é' }] },
}));

import { TalkXCampaignWizard } from '@/components/talkx/TalkXCampaignWizard';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';

const campaign = {
  id: 'draft_1', name: 'Campanha Alfa', status: 'draft',
  sent_count: 0, failed_count: 0, delivered_count: 0, total_recipients: 0,
} as unknown as TalkXCampaign;

/** Estado mínimo (campos + setters) para os passos 1 a 4 renderizarem. */
function editorState() {
  return {
    saving: false,
    name: 'Campanha Alfa', setName: vi.fn(),
    description: '', setDescription: vi.fn(),
    objective: 'sales', setObjective: vi.fn(),
    audienceSource: 'segment', setAudienceSource: vi.fn(),
    segments: [], segmentId: '', setSegmentId: vi.fn(),
    selectedSegment: null, segmentEstimate: undefined,
    audienceCount: 10,
    audienceRules: { groups: [{ id: 'g1', match: 'and', rules: [] }] },
    addAudienceRule: vi.fn(), updateAudienceRule: vi.fn(), removeAudienceRule: vi.fn(), setGroupMatch: vi.fn(),
    contactSearch: '', setContactSearch: vi.fn(),
    companyFilter: 'all', setCompanyFilter: vi.fn(), tagFilter: 'all', setTagFilter: vi.fn(),
    companies: [], tags: [], filteredContacts: [], toggleContact: vi.fn(), selectAll: vi.fn(), clearFilters: vi.fn(),
    templates: [], templateId: '', applyTemplate: vi.fn(), selectedTemplate: null,
    messageTemplate: '', setMessageTemplate: vi.fn(), insertVariable: vi.fn(),
    mediaUrl: '', setMediaUrl: vi.fn(), mediaType: '', setMediaType: vi.fn(), hasMedia: false, toggleMedia: vi.fn(),
    connectionId: 'c1', setConnectionId: vi.fn(),
    connections: [{ id: 'c1', name: 'Linha principal', phone_number: '5511999999999' }],
    owner: null, setOwner: vi.fn(), owners: [],
    contacts: [], selectedContacts: [], audienceTotal: 12, eligibleCount: 10,
    suppressedCount: 2, respectSuppression: true, setRespectSuppression: vi.fn(),
    messagesPerMinute: 20, estimatedTime: '5 min',
    typingDelay: [1.5, 4], setTypingDelay: vi.fn(), sendInterval: [8, 20], setSendInterval: vi.fn(),
    speedProfile: 'moderate', setSpeedProfile: vi.fn(),
    isScheduled: false, scheduledAt: '', setScheduledAt: vi.fn(),
    scheduleTimezone: 'America/Sao_Paulo', setScheduleTimezone: vi.fn(),
    scheduleConfigError: null, minimumScheduledAt: '2026-10-09T10:00',
    sendWindowEnabled: false, setSendWindowEnabled: vi.fn(),
    sendWindowStart: '08:00', setSendWindowStart: vi.fn(), sendWindowEnd: '18:00', setSendWindowEnd: vi.fn(),
    businessHoursOnly: false, setBusinessHoursOnly: vi.fn(), toggleSchedule: vi.fn(),
    confirmConsent: true, setConfirmConsent: vi.fn(),
    confirmContent: true, setConfirmContent: vi.fn(),
    confirmSuppression: true, setConfirmSuppression: vi.fn(),
    canProceed: { 1: true, 2: true, 3: true, 4: true },
    draftCampaignId: 'draft_1',
  };
}

describe('TalkXCampaignWizard — encaixe no shell (TL-138)', () => {
  beforeEach(() => {
    h.pending = false;
    h.setStepCalls = [];
    h.discard.mockClear();
    h.handleSave.mockClear();
    h.handleSave.mockImplementation(() => Promise.resolve('draft_1'));
    Object.assign(h.ed, editorState());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('percorre os quatro passos pelo teclado e marca o ativo com aria-current', () => {
    render(<TalkXCampaignWizard campaign={campaign} onClose={vi.fn()} />);
    const stepper = screen.getByRole('list', { name: 'Passos da campanha' });
    const stepButton = (label: RegExp) => within(stepper).getByRole('button', { name: label });

    // Estado inicial: passo 1 ativo (e é o único alcançável pelo Tab).
    expect(stepButton(/Público/)).toHaveAttribute('aria-current', 'step');
    expect(stepButton(/Público/)).toHaveAttribute('tabindex', '0');
    expect(stepButton(/Mensagem/)).not.toHaveAttribute('aria-current');
    expect(stepButton(/Mensagem/)).toHaveAttribute('tabindex', '-1');

    const publico = stepButton(/Público/);
    publico.focus();
    fireEvent.keyDown(publico, { key: 'ArrowRight' });

    expect(h.setStepCalls).toEqual([2]);
    expect(stepButton(/Mensagem/)).toHaveAttribute('aria-current', 'step');
    expect(stepButton(/Mensagem/)).toHaveFocus();

    fireEvent.keyDown(stepButton(/Mensagem/), { key: 'ArrowRight' });
    fireEvent.keyDown(stepButton(/Entrega/), { key: 'ArrowRight' });

    expect(h.setStepCalls).toEqual([2, 3, 4]);
    expect(stepButton(/Revisão/)).toHaveAttribute('aria-current', 'step');
    expect(stepButton(/Revisão/)).toHaveFocus();

    // A seta contrária volta um passo por vez.
    fireEvent.keyDown(stepButton(/Revisão/), { key: 'ArrowLeft' });

    expect(h.setStepCalls).toEqual([2, 3, 4, 3]);
    expect(stepButton(/Entrega/)).toHaveAttribute('aria-current', 'step');
  });

  it('não deixa o teclado pular um passo ainda não liberado', () => {
    // Só o passo 1 está válido: as setas não podem avançar a tela.
    h.ed.canProceed = { 1: false, 2: false, 3: false, 4: false };
    render(<TalkXCampaignWizard campaign={campaign} onClose={vi.fn()} />);
    const stepper = screen.getByRole('list', { name: 'Passos da campanha' });

    const publico = within(stepper).getByRole('button', { name: /Público/ });
    publico.focus();
    fireEvent.keyDown(publico, { key: 'ArrowRight' });

    expect(h.setStepCalls).toEqual([1]);
    expect(publico).toHaveAttribute('aria-current', 'step');
  });

  it('sair com alteração pendente abre o aviso do kit e não fecha o wizard', () => {
    const onClose = vi.fn();
    h.pending = true;
    render(<TalkXCampaignWizard campaign={campaign} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(screen.getByText('Você tem alterações não salvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar e sair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descartar rascunho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar editando' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sair sem pendência fecha o wizard na hora, sem aviso', () => {
    const onClose = vi.fn();
    h.pending = false;
    render(<TalkXCampaignWizard campaign={campaign} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Salvar e sair' })).not.toBeInTheDocument();
  });

  it('"Salvar e sair" grava o rascunho e só então fecha', async () => {
    const onClose = vi.fn();
    h.pending = true;
    render(<TalkXCampaignWizard campaign={campaign} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar e sair' }));
    });

    expect(h.handleSave).toHaveBeenCalledWith('draft');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"Descartar rascunho" descarta a pendência e sai sem gravar', () => {
    const onClose = vi.fn();
    h.pending = true;
    render(<TalkXCampaignWizard campaign={campaign} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }));

    expect(h.discard).toHaveBeenCalledTimes(1);
    expect(h.handleSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a trilha mostra "Editar <nome>" ao editar e "Nova campanha" ao criar', () => {
    const { unmount } = render(<TalkXCampaignWizard campaign={campaign} onClose={vi.fn()} />);
    const trilha = screen.getByRole('navigation');
    expect(within(trilha).getByText('Editar Campanha Alfa')).toBeInTheDocument();
    expect(within(trilha).getByText('Público')).toBeInTheDocument();
    unmount();

    render(<TalkXCampaignWizard campaign={null} onClose={vi.fn()} />);
    expect(within(screen.getByRole('navigation')).getByText('Nova campanha')).toBeInTheDocument();
  });
});
