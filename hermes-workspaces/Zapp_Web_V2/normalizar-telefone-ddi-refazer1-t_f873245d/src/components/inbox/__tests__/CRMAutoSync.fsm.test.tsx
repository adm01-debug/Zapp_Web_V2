/**
 * SL-071 (ADR-005, passo 3) — o auto-sync com o CRM dispara pelo estado PERSISTIDO
 * (`contacts.conversation_status`).
 *
 * Antes: com a flag `inbox.status-fsm` desligada (default `false` em
 * `CRMAutoSync.tsx:58`), o componente comparava `conversation.status`, valor que a UI
 * nunca produz como `resolved` (o encerramento grava em `contacts.conversation_status`)
 * — o auto-sync só existia no papel. O mock da flag devolve `false`, como o banco sem
 * a chave: depois da correção a flag não é consultada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  syncConversation: vi.fn(),
  useFeatureFlag: vi.fn(() => false),
}));

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: mocks.useFeatureFlag }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversation: mocks.syncConversation, isConfigured: true }),
}));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { CRMAutoSync } from '../CRMAutoSync';

// `derivado` é o `conversation.status` que a UI mantém — nunca vira `resolved` aqui.
const conversa = (persistido: string | null, derivado: string) =>
  ({
    id: 'conv-1',
    status: derivado,
    contact: { id: 'c1', name: 'Contato', conversation_status: persistido },
  }) as never;

describe('CRMAutoSync — sincroniza pelo conversation_status (SL-071)', () => {
  beforeEach(() => {
    mocks.syncConversation.mockClear();
    mocks.useFeatureFlag.mockClear();
  });

  it('sincroniza quando contacts.conversation_status é resolved', () => {
    render(<CRMAutoSync conversation={conversa('resolved', 'open')} messages={[]} />);

    expect(mocks.syncConversation).toHaveBeenCalledTimes(1);
    expect(mocks.syncConversation).toHaveBeenCalledWith({ contactId: 'c1' }, expect.anything());
  });

  it('não sincroniza conversa em estado aberto', () => {
    render(<CRMAutoSync conversation={conversa('open', 'open')} messages={[]} />);

    expect(mocks.syncConversation).not.toHaveBeenCalled();
  });

  it('não consulta mais a flag inbox.status-fsm', () => {
    render(<CRMAutoSync conversation={conversa('open', 'open')} messages={[]} />);

    expect(mocks.useFeatureFlag).not.toHaveBeenCalled();
  });
});
