Especialista: edgar
Assinatura: Edgar (area-edge-api)

## Escopo (confere com o diff)
- Arquivos alterados: 6. Arquivos de teste alterados/novos: 2. Casos de teste novos: 5 (em 1 arquivo novo). Nenhum manifesto regenerado.
- `docs/TROUBLESHOOTING.md` NÃO está na lista "ARQUIVOS QUE PODE TOCAR" do cartão: a alteração foi indispensável. As 4 linhas do runbook dos eventos de grupo afirmavam "só log / sem acesso ao banco"; como o código novo passou a gravar, mantê-las criaria contradição aberta entre documento e código (recusa conhecida, ponto 7 do `afinar-edge`). A mudança é só a sincronização dessas 4 linhas (rota + prova); nenhum evento novo entrou na tabela, então a enumeração do teste de cobertura continua a mesma.

## Sensibilidade
- Área `supabase/functions/**` (sempre vai ao revisor forte). O diff NÃO toca `rateLimit`, `service_role`, `requireRole`, `verifyHmac` nem `DELETE`: troca dois blocos de `console.warn` por uma chamada de upsert.
- Nenhuma proteção afrouxada: o gate de HMAC/`instanceToken` em `evolution-webhook/index.ts` fica igual e roda ANTES do handler; o caso NEGADO (instância sem `whatsapp_connections`) tem teste próprio provando que nada é escrito.
- Nenhuma referência a banco/endpoint de produção: os testes usam Supabase FALSO em 127.0.0.1, com JID e `connection_id` sintéticos.
- Quem chama: a Evolution (webhook de entrada) — nada muda para o emissor; eventos que antes eram no-op passam a gravar.

## O que mudou e por quê
Escopo do diff: 6 arquivos alterados, sendo 2 de teste; 5 casos de teste novos no arquivo novo. Sem manifesto regenerado.

- `_shared/evolution-sync-actions.ts`: novo `handleGroupsUpdate`. `groups.upsert`/`group.update` fazem upsert por `group_id` (a UNIQUE da tabela) com `name`/`description`/`participant_count` e o `whatsapp_connection_id` da instância. `group.participants.update` só recalcula o `participant_count` sobre o valor atual (o payload traz o delta, e não traz nome/descrição — um upsert ali sobrescreveria o nome com vazio). Rename sem tamanho no payload NÃO zera o contador. Instância sem conexão cadastrada retorna sem escrever.
- `evolution-webhook/index.ts`: os dois ramos de grupo deixam de só logar e chamam `handleGroupsUpdate` ('set' e 'participants'); import novo de `_shared/evolution-sync-actions.ts`.
- `_shared/__tests__/evolution-webhook-event-coverage.test.ts`: as 4 linhas dos eventos de grupo saem de `log`/`sem-acesso-banco` para `handleGroupsUpdate`/`toca-banco`.
- `_shared/__tests__/evolution-webhook-groups-upsert.test.ts` (NOVO): prova o CORPO gravado — payload v2 (`{id, subject, size}`) e GO (`{JID, Name, Participants}`, via `translateGoPayload`), o rename sem tamanho, o recálculo de participantes e o caso negado. 5 casos de teste.
- `.tmp/relato.md`: este relato (arquivo já versionado no workspace desde o início; a alteração entra no mesmo commit).
- `docs/TROUBLESHOOTING.md`: FORA DA LISTA DO CARTÃO — indispensable porque as 4 linhas do runbook dos eventos de grupo diziam literalmente "só log / sem acesso ao banco", e o código novo passou a gravar: deixá-las assim abriria contradição entre documento e código (ponto 7 do `afinar-edge`, recusa conhecida). A mudança é só sincronização das 4 linhas (rota + prova) para o comportamento novo; nenhum evento novo entrou na tabela, então a enumeração do teste de cobertura continua a mesma.

## Prova
- vermelho antes (com as fontes no estado anterior, `git stash` de `index.ts` e `evolution-sync-actions.ts`):
  `deno test --config scripts/ci/deno.json ... evolution-webhook-groups-upsert.test.ts` → `FAILED | 1 passed | 4 failed` — `AssertionError: nenhuma escrita POST em whatsapp_groups (foi: [])`.
- verde depois:
  `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 ... evolution-webhook-groups-upsert.test.ts ... evolution-webhook-event-coverage.test.ts` → `ok | 9 passed | 0 failed (372ms)`.

## O que NÃO fiz e por quê
- A função agendada diária: o próprio cartão a declara fora do escopo.
- Nada em `src/` (front) nem no botão "Sincronizar": o cartão pede o caminho do webhook.
