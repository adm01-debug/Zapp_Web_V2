Especialista: senior (area-front-hooks)

## Refazer 1 (t_ce7b3b81) — branch andou depois do fechar: full rodado de novo no HEAD atual

Ponto 1: reproduzir a falha com `zapp-verify full .`, corrigir e fechar de novo — reproduzido; a única falha é pré-existente e fora do escopo, então nenhum arquivo de código muda neste refazer (só este relato).
- `zapp-verify full .` no HEAD atual → `FALHOU testes (ver .../testes.log)` / `VERIFY: VERMELHO em testes`; etapas anteriores OK: `OK db_guard`, `OK tipos 17s`, `OK lint 147s`, `OK migrations 1s`.
- Linha-resumo da suíte: `Test Files 1 failed | 1332 passed (1333)` / `Tests 1 failed | 11938 passed | 25 expected fail | 14 todo (11978)`.
- O 1 teste que falha é `src/components/talkx/__tests__/RuleValueInput.test.tsx > "em breve": Lead score e Risco de churn ficam desabilitados no catálogo` → `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"`.
- Prova de que não é deste cartão: `git diff --name-only dia/2026-10-13...HEAD` lista só `src/hooks/sla/useContactSlaTimeline.ts`, `src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx`, `src/lib/slaTimeline.ts`, `src/lib/__tests__/slaTimeline.test.ts` e este relato; busca por `slaTimeline|useContactSlaTimeline|useApplicableSLA` em `src/components/talkx` retorna 0 ocorrências; só os 4 arquivos do cartão importam `slaTimeline`.
- Prova de pré-existência/interferência entre casos: o arquivo isolado falha (`Tests 1 failed | 4 passed (5)`), mas o caso sozinho passa (`bun run vitest run ... -t "desabilitados no cat"` → `Tests 1 passed | 4 skipped (5)`); o caso anterior deixa `?view=talkx&tab=segments&mode=new` na URL do jsdom e o caso seguinte nunca vê a biblioteca.
- A correção já existe em outra trilha: commit `67d58a177a` (`test(talkx): isola a URL entre os casos do RuleValueInput`, cartão 2610130110be20) no `dia/2026-10-14`, ausente nesta branch (base `dia/2026-10-13`); trazê-lo seria código de outro cartão no meu diff, então não trouxe.
- Erro não tratado no log (`RealtimeInboxView.selectedMessagesError`, `WebSocket.dispatchEvent` vs jsdom `Event`) é da mesma natureza: fora do escopo, sem relação com SLA.
- Escopo deste cartão continua verde: `bun run vitest run src/lib/__tests__/slaTimeline.test.ts src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx` → `Test Files 2 passed (2); Tests 35 passed (35)`; `bun run test:contracts` → `Test Files 89 passed (89); Tests 1379 passed (1379)`; `bun run tsc --noEmit` → saída 0.

## O que NÃO fiz e por quê
- Não corrigi o teste do TalkX nem o erro do RealtimeInboxView: fora do escopo (achado registrado em comentário no cartão com arquivo, sintoma e a correção upstream existente); mexer ali seria "diff maior que o título".
- Não fiz rebase para o dia/2026-10-14 nem cherry-pick do commit de outro cartão: a base da tarefa está fixada no dia/2026-10-13 e trazer código alheio é o meu erro nº 1 medido.

---

Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
Item 1 — linha do tempo usa a MESMA hierarquia do cabeçalho:
- src/hooks/sla/useContactSlaTimeline.ts: acrescenta o parâmetro opcional `scope`
  (`ContactSlaScope` = company, jobTitle, contactType, queueId, agentId) e o repassa ao
  `useApplicableSLA`, que já resolve a hierarquia contato > empresa > cargo > tipo > fila >
  agente > padrão. Antes o hook mandava só `contactId`, então quando o prazo vinha de um nível
  abaixo (empresa/cargo/tipo/fila/agente) a linha do tempo caía no padrão do sistema e
  discordava do cabeçalho (`ChatPanelHeader`), que passa a conversa inteira.
- Comentário do hook atualizado para a hierarquia real (era "contato > configuração padrão >
  padrão do sistema"): o texto agora bate com o código.
- src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx: 4 testes novos que provam o
  encadeamento (empresa aplica, fila aplica, sem escopo não adivinha, escopo diferente não casa).
- Contrato: o 3º parâmetro é opcional e `useContactSlaTimeline` só é chamado pelos testes
  (`git grep`), nenhum chamador de produção quebra.

Item 2 — conversa encerrada sem resposta não vira "Estourado" com o relógio:
- src/lib/slaTimeline.ts: o ramo de 1ª resposta sem carimbo e sem violação agora olha
  `resolved_at` ANTES do ramo de relógio corrente. Com `resolved_at`, sai um marco novo
  `closed_no_response` no instante do fechamento, `durationMs = resolved_at - abertura` (fixo,
  `Math.max(0, ...)`) e situação julgada por essa duração. Sem `resolved_at`, o marco segue na
  abertura com a situação de AGORA, igual a antes. O tipo `SlaMilestoneKind` ganhou
  `closed_no_response` e o doc-comment do `buildSlaMilestones` foi reescrito para a regra nova.
- src/lib/__tests__/slaTimeline.test.ts: 2 testes — fechada em 2min e lida 10 dias depois
  continua `2min`/`ok` (e o marco `first_response` de relógio corrente não existe mais para
  essa linha); fechada depois do prazo sai `breached` com a duração do fechamento.

Job do banco que grava `first_response_breached` (pedido do supervisor): NÃO cobre este caso.
`git grep` nas migrations mostra que `conversation_sla` só é inserida/atualizada por
`register_first_response_internal`/`mark_first_response`
(supabase/migrations/20260903225000_sla_first_response_v2.sql:57-66), e ali
`first_response_breached` é gravado SEMPRE junto com `first_response_at`
(`p_responded_at > first_message_at + 5min`). Não há job que marque `breached` no fechamento,
então a linha encerrada sem resposta fica com `first_response_at` nulo e a flag falsa — era
exatamente o ramo que caía no relógio.

## Prova
- vermelho antes (item 2): `npx vitest run src/lib/__tests__/slaTimeline.test.ts` com o
  slaTimeline.ts da base → `Tests  2 failed | 22 passed (24)` (marco `closed_no_response`
  ausente / duração do relógio em vez do fechamento).
- verde depois (item 2): `npx vitest run src/lib/__tests__/slaTimeline.test.ts
  src/hooks/sla/__tests__/useContactSlaTimeline.test.tsx` →
  `Test Files  2 passed (2); Tests  35 passed (35)`.
- vermelho/verde do item 1 (execução anterior, ainda válida): `Tests  2 failed | 9 passed (11)`
  (empresa/fila caindo no padrão) → `Test Files 1 passed (1); Tests 11 passed (11)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (419s)`; tipos, lint,
  migrations e db_guard OK.

## Fora desta entrega
O `scope` é API do hook; nenhum consumidor de produção existe ainda (`git grep
useContactSlaTimeline` só acha o próprio arquivo e o teste), então passar empresa/fila/agente
da conversa é o trabalho do cartão da tela.
