/**
 * RD-012 — de onde vêm os dados do módulo Contatos (lógica do selo 'Origem dos
 * dados' do cabeçalho; o visual é o RD-013).
 *
 * O módulo já fala com o Singu pelo lote de CRM: `useExternalContact360Batch`
 * (`src/hooks/crm/useExternalContact360Batch.ts`) → `ExternalCRMService.
 * getContact360Batch` → edge `crm-integration`, ação `contactLookupBatch`. É
 * exatamente o caminho do adaptador REAL do contrato do CT-002
 * (`src/services/crm/singu-adapter.ts`), então a consulta compartilhada na
 * família de chave `['external-contact-360-batch', …]` é o estado do Singu que
 * o módulo já tem em mãos.
 *
 * Este hook NÃO faz requisição: não chama o serviço, não abre consulta nova nem
 * saúde da Edge. Ele LÊ (a) o estado dessa consulta que o módulo já dispara,
 * pelo cache do React Query, e (b) o portão da integração
 * (`crm.integration`, o mesmo `useCRMIntegrationEnabled` que liga o CRM no
 * front).
 *
 * `fonte`:
 * - 'zapp' — ligação com o Singu desligada (flag `crm.integration` desligada ou
 *   build sem CRM): os dados são só os do Zapp;
 * - 'singu' — ligação ligada e a consulta ao Singu não falhou;
 * - 'indisponivel' — ligação ligada, mas a consulta ao Singu falhou (Singu fora
 *   do ar): a tela deve avisar, nunca mostrar resumo vazio com cara de dado
 *   real.
 *
 * `carregando` — há consulta ao Singu em voo. Enquanto ela corre, `fonte` é a
 * origem esperada (a ligação está ativa) e a tela mostra o esqueleto, em vez de
 * afirmar uma origem que ainda não respondeu.
 *
 * Em dev/teste o módulo usa o adaptador de TESTE do CT-002; este hook não o
 * importa — o mock só existe em dev/teste e não entra no bundle de produção.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryCache } from '@tanstack/react-query';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';

export type ContactsDataSource = 'singu' | 'zapp' | 'indisponivel';

export interface ContactsDataSourceState {
  fonte: ContactsDataSource;
  carregando: boolean;
}

/** Primeiro elemento da chave da consulta do lote do Singu do módulo. */
export const CONTACTS_SINGU_BATCH_QUERY_KEY = 'external-contact-360-batch';

type BatchState = 'ausente' | 'erro' | 'carregando' | 'ok';

/**
 * Estado do lote do Singu no cache, em um texto estável por valor (o
 * `useSyncExternalStore` compara o retorno para decidir se re-renderiza).
 * Nenhuma consulta em cache = nenhum Singu consultado ainda ('ausente').
 */
function readBatchState(cache: QueryCache): BatchState {
  const queries = cache.findAll({ queryKey: [CONTACTS_SINGU_BATCH_QUERY_KEY] });
  if (queries.length === 0) return 'ausente';
  if (queries.some((query) => query.state.status === 'error')) return 'erro';
  if (queries.some((query) => query.state.fetchStatus === 'fetching')) return 'carregando';
  return 'ok';
}

/**
 * Acompanha o cache das consultas do lote do Singu (resposta, falha, refetch e
 * recuperação), inclusive de consultas que o módulo dispara depois desta.
 */
function useBatchState(): BatchState {
  const cache = useQueryClient().getQueryCache();
  const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
  const snapshot = useCallback(() => readBatchState(cache), [cache]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function useContactsDataSource(): ContactsDataSourceState {
  const crmEnabled = useCRMIntegrationEnabled();
  const batchState = useBatchState();

  if (!crmEnabled) return { fonte: 'zapp', carregando: false };
  if (batchState === 'erro') return { fonte: 'indisponivel', carregando: false };
  return { fonte: 'singu', carregando: batchState === 'carregando' };
}
