/**
 * O auto-sync do navegador saiu deste caminho: quem enfileira o CRM é o gatilho
 * de banco `trg_enqueue_crm_sync_from_closure`
 * (`supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql:66-104`),
 * disparado em `conversation_closures` com idempotência `closure:<id>`.
 *
 * O que este arquivo guarda:
 * 1. renderizar uma conversa `resolved` — ou `open` — NÃO chama o CRM pelo navegador;
 * 2. o erro 409 da Edge ('Resolve the conversation before syncing') não gera
 *    segunda chamada ao re-renderizar — antes o `onError` zerava
 *    `lastSyncedStatus`/`lastSyncedId` e o objeto `conversation` novo (tempo
 *    real) reexecutava o efeito, sem backoff;
 * 3. a flag `inbox.status-fsm` não é mais consultada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  // Reproduz o caminho real do 409: a Edge responde 409, `callCRMIntegration`
  // lança (`src/lib/crmIntegration.ts:24-37`) e o react-query chama o `onError`
  // que o componente passou — era ali que os refs eram zerados.
  syncConversation: vi.fn((_params: unknown, options?: { onError?: () => void }) => {
    options?.onError?.();
  }),
  useFeatureFlag: vi.fn(() => false),
}));

vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: mocks.useFeatureFlag }));
vi.mock('@/hooks/integrations/useSyncToCRM', () => ({
  useSyncToCRM: () => ({ syncConversation: mocks.syncConversation, isConfigured: true }),
}));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() })} , getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }), createLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), withCorrelation: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }) }),}));

import { CRMAutoSync } from '../CRMAutoSync';

const conversa = (persistido: string | null, derivado = 'open') =>
  ({
    id: 'conv-1',
    status: derivado,
    contact: { id: 'c1', name: 'Contato', conversation_status: persistido },
  }) as never;

const mensagem = (id: string) => ({ id, content: 'ok', sender: 'contact' }) as never;

describe('CRMAutoSync — o gatilho do navegador saiu (SL-071 + cartão do 409)', () => {
  beforeEach(() => {
    mocks.syncConversation.mockClear();
    mocks.useFeatureFlag.mockClear();
  });

  it('não dispara sync no navegador para conversa resolvida (a fila é do banco)', () => {
    render(<CRMAutoSync conversation={conversa('resolved', 'open')} messages={[]} />);

    expect(mocks.syncConversation).not.toHaveBeenCalled();
  });

  it('erro 409 não gera segunda chamada ao re-renderizar', () => {
    const { rerender } = render(<CRMAutoSync conversation={conversa('resolved')} messages={[]} />);

    // Re-render com objeto e lista de mensagens NOVOS: era o que reexecutava o
    // efeito depois de o `onError` ter zerado os refs.
    rerender(<CRMAutoSync conversation={conversa('resolved')} messages={[mensagem('m2')]} />);

    expect(mocks.syncConversation).not.toHaveBeenCalled();
  });

  it('não sincroniza conversa em estado aberto (nem no re-render com objeto novo)', () => {
    // [refazer 1] Teste restaurado: a rodada anterior apagou este caso ao
    // reaproveitar o corpo dele no teste do 409 (o revisor pegou a divergência
    // entre o relato e o diff). O estado aberto continua sem disparo no navegador.
    const { rerender } = render(<CRMAutoSync conversation={conversa('open', 'open')} messages={[]} />);

    rerender(<CRMAutoSync conversation={conversa('open', 'open')} messages={[mensagem('m3')]} />);

    expect(mocks.syncConversation).not.toHaveBeenCalled();
  });

  it('não consulta mais a flag inbox.status-fsm', () => {
    render(<CRMAutoSync conversation={conversa('open', 'open')} messages={[]} />);

    expect(mocks.useFeatureFlag).not.toHaveBeenCalled();
  });
});
