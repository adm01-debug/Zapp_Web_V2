import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TalkXWizardReview } from '../TalkXWizardDelivery';

describe('TalkXWizardReview — Conexão WhatsApp edita passo 3 (Entrega)', () => {
  it('chama onEditStep(3) ao clicar em Editar na row de Conexão WhatsApp', () => {
    const onEditStep = vi.fn();
    const ed = {
      name: 'Campanha Teste',
      description: 'Descrição',
      audienceSource: 'segment' as const,
      selectedSegment: { name: 'Segmento X' },
      selectedContacts: [],
      eligibleCount: 10,
      respectSuppression: true,
      suppressedCount: 2,
      selectedTemplate: { name: 'Template 1', status: 'approved' as const },
      messageTemplate: 'Olá {{nome}}',
      hasMedia: false,
      mediaUrl: '',
      speedProfile: 'normal',
      messagesPerMinute: 30,
      isScheduled: false,
      scheduledAt: '',
      sendWindowEnabled: false,
      sendWindowStart: '',
      sendWindowEnd: '',
      businessHoursOnly: false,
      scheduleTimezone: 'America/Sao_Paulo',
      confirmConsent: true,
      canProceed: { 1: true, 2: true, 3: true, 4: true },
      saving: false,
      connections: [{ id: 'conn-1', name: 'Minha Conexão', phone_number: '+551****9999' }],
      connectionId: 'conn-1',
      contacts: [{ id: 'c1', name: 'Contato Teste' }],
    } as never;

    render(
      <TalkXWizardReview
        ed={ed}
        campaign={null}
        onLaunched={vi.fn()}
        onEditStep={onEditStep}
      />,
    );

    // A row "Conexão WhatsApp" contém o label e o botão Editar com step=3.
    const whatsappLabel = screen.getByText('Conexão WhatsApp');
    const editBtn = whatsappLabel.closest('div.flex')?.querySelector('button') as HTMLButtonElement;
    expect(editBtn).not.toBeNull();
    fireEvent.click(editBtn);
    expect(onEditStep).toHaveBeenCalledWith(3);
  });
});