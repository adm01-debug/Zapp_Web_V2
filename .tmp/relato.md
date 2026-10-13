Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/sla/useContactSlaTimeline.ts: acrescenta o parâmetro opcional `scope`
  (`ContactSlaScope` = company, jobTitle, contactType, queueId, agentId) e o repassa ao
  `useApplicableSLA`, que já resolve a hierarquia contato > empresa > cargo > tipo > fila >
  agente > padrão. Antes o hook mandava só `contactId`, então quando o prazo vinha de um nível
  abaixo (empresa/cargo/tipo/fila/agente) a linha do tempo caía no padrão do sistema e
  discordava do cabeçalho (`ChatPanelHeader`), que passa a conversa inteira.
- src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx: 4 testes novos que provam o
  encadeamento (empresa aplica, fila aplica, sem escopo não adivinha, escopo diferente não casa).
- Comentário do hook atualizado para a hierarquia real (era "contato > configuração padrão >
  padrão do sistema"): o texto agora bate com o código.
- Contrato: o 3º parâmetro é opcional; `useContactSlaTimeline` só é chamado pelos testes
  (`git grep`), nenhum chamador de produção quebra.

## Prova
- vermelho antes: `npx vitest run src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx`
  (com o hook da base) → `Tests  2 failed | 9 passed (11)` — "expected 5 to be 2" (empresa) e
  "expected 5 to be 3" (fila): sem o escopo o prazo aplicado era o padrão.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 11 passed (11)`.
- sem regressão na área: `npx vitest run src/hooks/sla` → `Test Files 5 passed (5); Tests 39 passed (39)`.
