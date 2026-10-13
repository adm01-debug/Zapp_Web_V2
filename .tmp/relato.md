Especialista: edgar

## Sensibilidade
- Padrões tocados: o handler usa o client de `service_role` (`supabase`) para ler `whatsapp_connections`/`contacts` e gravar `audit_logs` — só na rota `send-status`; `audit_logs` já bloqueia INSERT de `authenticated` (policy), então a trilha exige a service role, mesmo desenho do `elevenlabs-webhook`.
- Nenhuma proteção afrouxada: `send-status` saiu de `send` (liberado a quem vê contato) e entrou em `CONTROL_ACTIONS` (admin/supervisor). Prova do caso NEGADO: teste "agente (não-admin) publica status? 403 e ZERO I/O no provedor".
- Nenhuma referência a banco/endpoint de produção: os testes usam `createFakeEvolution` (127.0.0.1) e clients injetados.
- O que muda para quem chama: o front (menu "Publicar Status") continua visível a todos, mas a Edge agora responde 403 para não-admin/supervisor — o menu é do worker (telas); registro em `kanban_comment`.

## O que mudou e por quê
- supabase/functions/_shared/evolution-control-authz.ts: `send-status` movido de `SEND_ACTIONS` para `CONTROL_ACTIONS` (o status não tem contato-alvo; o gate por visibilidade negava por acidente e não era a regra explícita) e nova `sanitizeStatusPayload` (allowlist `type/content/media/backgroundColor`, teto `STATUS_CONTENT_MAX_LENGTH`, `statusJidList` reduzida aos contatos da conexão).
- supabase/functions/evolution-api/index.ts: a rota `send-status` deixa de mandar o corpo inteiro ao provedor; passa a permitir só os 4 campos (resto vai em `dropped_fields`), corta o texto no teto, filtra a lista de destinatários para os contatos da empresa e grava trilha em `audit_logs` (ator, tipo, mídia sim/não, nº de destinatários, campos/JIDs descartados — nunca conteúdo nem telefone). Falha da trilha = 500 e nada é publicado; lista com só números de fora = 403 e nada é publicado.
- Testes: em `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts` o caso que exige `send-status` como control; em `supabase/functions/evolution-api/index.test.ts` os casos R2EXT-STATUS do handler (agente negado, supervisor publica com allowlist/teto/lista da empresa e trilha, lista só de fora nega, falha da trilha não publica). As contagens de arquivos e de casos estão no bloco FATOS MEDIDOS abaixo.
- Dependência: o cartão manda trazer a faixa da base `dia/2026-10-12..2200003d6` (cartão-pai t_890bceea) via cherry-pick — feita como commit `5c64da82d`, que já carrega a matriz de autorização (agenda/conversas/mídia) sobre a qual esta entrega se apoia.

## Prova
- Escopo do diff: 5 arquivos, 2 deles de teste; 12 casos de teste novos no total (contagem do juiz do fechar — coincide com os `Deno.test` R2EXT-STATUS acrescentados nos dois arquivos).
- verde (fechar): `zapp-verify . --rapido` → OK dependencias 2s; OK db_guard 0s; OK tipos 112s; OK lint 4s; OK migrations 0s → "VERIFY: VERDE SEM BANCO".
- verde (testes): `deno test --allow-net --allow-env --allow-read <os dois arquivos>` → `ok | 50 passed | 0 failed (362ms)`.
- typecheck Deno: `deno check supabase/functions/evolution-api/index.ts` e `.../_shared/evolution-control-authz.ts` → "Check ..." sem erro (o `deno check` usa o deno.json; o lint do editor sem config é o ruído pré-existente do repo).
- vermelho antes: com só os dois fontes revertidos ao commit anterior (`git stash push -- index.ts evolution-control-authz.ts`), filtro R2EXT-STATUS → `FAILED | 1 passed | 4 failed`: "send-status é controle", "supervisor publica", "statusJidList só de fora nega", "falha da trilha não publica" — depois `git stash pop` e 50/50 verdes.

## O que NÃO fiz e por quê
- Não toquei no menu "Publicar Status" (`src/components/inbox/AdvancedMessageMenu.tsx`): esconder o item é do worker (telas) e o cartão limita meus arquivos à Edge e seus testes. Deixei `kanban_comment` para o front.
- Não gravei linha em `messages`: um status é broadcast sem contato-alvo único; a trilha vai em `audit_logs` (o cartão pede auditoria).
