Especialista: workersql (area-sql-banco)

## Como resolvi o motivo da retomada (conflito com dia/2026-10-12)
Motivo registrado: aprovado, mas CONFLITAVA com a ponta de dia/2026-10-12 (arquivos de CI e de tipos). Antes de mexer, conferi no código ATUAL (base dia/2026-10-12) se o defeito ainda existia: `git grep sender_participant_jid|sender_display_name -- supabase src` não devolvia NADA — as colunas ainda não existem, a lacuna segue aberta. Não reescrevi nada à mão: trouxe o trabalho anterior da branch `v2/messages-group-sender-261011110237a8` por `git cherry-pick` dos dois commits (95e563d6c "feat(messages)…" e 72c316fce "fix(messages): adapter do Evolution…").

Os arquivos que o integrador marcou como conflitantes foram reaplicados assim:
- `.github/workflows/db-guard.yml` e `src/integrations/supabase/types.ts`: autocombinaram sem conflito no cherry-pick (a adição do passo do teste foi para o fim do job; as colunas novas de `messages` entraram em ordem alfabética no Row/Insert/Update de `src/integrations/supabase/types.ts`, ao lado de `sender`).
- `src/adapters/evolutionAdapter.ts`: ÚNICO conflito real. A ponta atual já tinha trocado `mapMessageType(...)` pela classificação `classifyMessageType(...)` (com `unsupportedKind`); preservei ESSA versão (a que entrou na base) e somei as duas linhas do trabalho anterior (`sender_participant_jid: null` e `sender_display_name: null`). O adapter precisa dessas linhas porque `RealtimeMessage = MessageRow` (src/hooks/chat/useRealtimeMessages.ts) e as duas colunas novas nascem NÃO-opcionais em `MessageRow` — é a "cascata do tipo" do commit original.

## O que mudou e por quê (diff desta entrega = trabalho anterior + 1 ajuste)
- `supabase/migrations/20261011140613_messages_group_sender.sql` (NOVO, único DDL): acrescenta a `public.messages` as duas colunas ADITIVAS e ANULÁVEIS `sender_participant_jid text` e `sender_display_name text`, com `if not exists`. Sem backfill, sem NOT NULL, sem default, sem GRANT, sem policy nova, sem índice — as colunas herdam a RLS/GRANT já vigentes em `messages`. Primeira linha é `-- Rollback:` com o SQL executável (DROP das duas colunas).
- `scripts/db-audit/messages-group-sender.test.sh` (NOVO): prova em PostgreSQL 17 descartável, aplicando as MIGRATIONS REAIS do caminho de leitura e executando como PAPEL REAL (authenticated por `request.jwt.claim.sub`, anon, service_role) — nunca como postgres nas provas de visibilidade.
- `.github/workflows/db-guard.yml`: passo que roda o teste acima (o inventário de testes exige o passo, senão o `.test.sh` fica órfão).
- `src/integrations/supabase/types.ts`: os dois campos nos três blocos (Row/Insert/Update) da tabela `messages` — tipos gerados atualizados no mesmo cartão, como o pedido manda.
- `src/adapters/evolutionAdapter.ts`: preenche as duas colunas com `null` no caminho do Evolution (cascata do tipo, item acima).

Ajuste meu nesta retomada: o cabeçalho do `.test.sh` dizia "REGISTRO PENDENTE: falta o passo em db-guard.yml" mas o passo já tinha sido adicionado no mesmo commit — corrigi o comentário para "REGISTRO: o passo … já consta em db-guard.yml", para o comentário não contradizer o diff.

## Prova
- Migração (PostgreSQL 17 descartável, migrations reais): `bash scripts/db-audit/messages-group-sender.test.sh` → `[OK] messages: remetente de grupo (participante e nome) validado em PostgreSQL 17`, todos os pontos [PASS]: coluna existe e é text, aceita nulo (B1–B4); sem backfill (as linhas antigas ficam NULL, B5); INSERT omitindo e informando as colunas (B6–B7); leitura por papel NÃO muda — dono lê, outsider não lê, anônimo barrado, admin vê tudo, e o valor do participante não vaza para quem não podia ver a linha (A3–A6, B8–B13); nenhuma policy de `messages` criada/removida (B14); reaplicação idempotente (B15); o rollback do cabeçalho derruba as colunas e reaplicar recria (B16–B17).
- Verificação rápida: `zapp-verify . --rapido` → `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; `VERIFY: VERDE SEM BANCO (71s)`. O banco_local do zapp-verify é pulado sem nome de conjunto (é assim que o fechar chama); a prova real de banco é o `.test.sh` acima.

## O que NÃO fiz e por quê
- Não criei índice em `sender_participant_jid`: as consultas de conversa filtram por `contact_id` e agrupam por participante em memória; não há padrão de busca por participante que justifique peso de escrita na tabela mais quente (o pedido item 2 diz "se houver índice útil").
- Não mexi em policy/GRANT: o pedido item 3 diz explicitamente "nenhuma política nova; as colunas herdam as existentes".
- Não rodei nem citei o banco de produção; nenhum dado de cliente entrou no teste (telefones/nomes sintéticos).

## Sobre o aviso "código alterado sem teste novo/alterado"
Não procede para o que importa neste cartão: `src/integrations/supabase/types.ts` é GERADO (o pedido manda atualizá-lo no mesmo cartão) e `src/adapters/evolutionAdapter.ts` é só a cascata do tipo — preenche as duas colunas com `null`, sem mudança de comportamento. O que tem comportamento (as colunas novas + a RLS/GRANT herdados) é provado pelo teste de banco no mesmo diff: `scripts/db-audit/messages-group-sender.test.sh`, que executa como PAPEL REAL (authenticated/anon/service_role). Um teste de `src/**` para o adapter seria de outra área (front), fora do escopo deste cartão. Repito o fechar sem mudar o código.

## Sobre o aviso "o cartão diz SEM DDL/migration"
Alarme falso: o rodapé do cartão traz "sem DDL/Edge/dependência nova SALVO SE O PEDIDO ORIGINAL EXIGIA", e o pedido original EXIGE — o PROBLEMA e os itens 1 a 5 mandam acrescentar exatamente as duas colunas em `public.messages` e atualizar os tipos no mesmo cartão. Sem a migration (o DDL) a entrega não cumpre o cartão; o `.test.sh` só a prova. Repito o fechar sem mudar nada.
