import { describe, it } from 'vitest';

/**
 * Inventário de lacunas do módulo de Telefonia.
 * Itens antes "verificados" aqui com expect(true).toBe(true) — que não
 * executavam nenhuma asserção real — foram removidos e substituídos por
 * cobertura de comportamento de verdade:
 *  - ciclo de chamada SIP (discagem, atendimento, corridas, duração,
 *    recebimento de INVITE): src/hooks/__tests__/useSipClient.test.ts
 *  - reconexão com cancelamento de timer: src/hooks/sip/__tests__/useSipConnection.test.ts
 *  - escopo da consulta por agente e paginação real: src/components/calls/__tests__/VoIPPanel.test.tsx
 *
 * O que resta aqui são lacunas genuinamente abertas (it.todo — não fingem
 * passar, aparecem como pendentes no relatório do vitest).
 */
describe('Telefonia — lacunas conhecidas (não corrigidas nesta rodada)', () => {
  it.todo('credenciais SIP por usuário, em vez de um único usuário/senha compartilhado (TEL-051)');
  it.todo('gravação de chamada com artefato e política reais, hoje sem integração de backend (TEL-043)');
  it.todo('transporte de chamada de voz do WhatsApp definido e homologado (TEL-033) — sem isso, mute/DTMF/hold do CallDialog usado no fluxo WhatsApp continuam sem efeito em áudio real');
  it.todo('espera, transferência e conferência de chamada (fora do escopo desta fase)');
  it.todo('enforcement de SRTP explícito nas opções do SessionDescriptionHandler');
  it.todo('coordenação entre abas para não atender a mesma chamada duas vezes (TEL-042)');
});
