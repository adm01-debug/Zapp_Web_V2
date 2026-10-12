Especialista: workersql

## Descrição

O cliente (papéis `authenticated`/`anon`) podia escrever direto em `public.messages`:
(a) `INSERT` livre de linha de conversa — a policy "Users can insert messages" só olhava a
VISIBILIDADE do contato, então qualquer agente com o contato visível forjava uma mensagem
`sender='agent'`; (b) `UPDATE` de tabela inteira, que liberava `status`/`status_updated_at`
fora da trava de entrega e deixava maquiar o SLA de primeira resposta (o trigger de SLA lê
`status_updated_at` como instante da resposta). A migration fecha os dois: INSERT negado por
GRANT e pela remoção da policy órfã; UPDATE passa a ser por coluna (só as que o front escreve
de fato); e uma trigger recusa `status`/`status_updated_at` como defesa em profundidade.

## Arquivos alterados (3, sendo 1 de teste)

- `supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql` — migration
  nova (REVOKE/GRANT + trigger + bloco de rollback).
- `scripts/db-audit/messages-sem-escrita-direta-cliente.test.sh` — teste de banco novo (o 1 de teste).
- `.tmp/relato.md` — este relato.

## Tipo de Mudança

- [x] 🔒 Segurança (bug de autorização — escrita direta do cliente em `messages`)

## Plano

- Plano do Claude: não há plano numerado para este cartão (nível worker, área banco).
- Passos executados:
  1. Levantei quem escreve em `messages` no front (`git grep`) — são 5 fluxos, 6 colunas.
  2. `REVOKE INSERT` (PUBLIC/anon/authenticated) + `DROP` da policy de INSERT órfã.
  3. `REVOKE UPDATE` de tabela + `GRANT UPDATE` por coluna só do que o front escreve.
  4. Trigger `trg_guard_message_status_fields` (defesa em profundidade p/ status).
  5. Prova em Postgres descartável, aplicando a migration real, com papéis reais.
- Divergências do plano: a lista de colunas do cartão não incluía `updated_at`; incluí porque
  `useChatPanelHandlers` (edição de mensagem, R2-INB-014) escreve `content, updated_at`
  juntos — sem esse GRANT a edição legítima quebraria com "permission denied".

## Banco de dados

Teste fora de produção: (1) PostgreSQL descartável (container `postgres:17-alpine`), 3 bases
independentes, aplicando o arquivo REAL
`supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql`; (2) o banco
LOCAL da tarefa (`zapp-db-local up . v2-2610121210d074`), que reaplicou todas as migrations
reais — a migration nova entrou sem falha nova (exit 0) e as checagens finais rodaram como
`authenticated`/`anon`/`service_role` (abaixo). Nunca toquei produção nem o banco canônico.

migration `20261012151936_messages_sem_escrita_direta_do_cliente.sql` (classe contrato:
GRANT/REVOKE + trigger) — pendente de aplicação no banco canônico pelo fluxo de merge.

## Rollback

No topo da migration, bloco `-- Rollback (SQL executável, na ordem)`: devolve
`GRANT INSERT`/`GRANT UPDATE` de tabela a `authenticated`, derruba a trigger
`trg_guard_message_status_fields` e sua função, e recria a policy de INSERT original
(nome e corpo do `20260925120000`).

## Prova

- vermelho antes: bloco ANTES do contrato — com o estado canônico reproduzido, o papel
  `authenticated` INSERE e ATUALIZA em `messages` com sucesso (o furo).
- verde depois: aplicada a migration, `authenticated`/`anon` recebem "permission denied" no
  INSERT e no UPDATE de `status`, as colunas legítimas continuam atualizáveis e a trigger
  recusa `status`/`status_updated_at` mesmo com GRANT de coluna extra.
- banco local canônico (esquema real da tarefa), como os papéis reais:
  `SET ROLE authenticated` INSERT → `permission denied for table messages`;
  `SET ROLE authenticated` `UPDATE ... SET status=...` → `permission denied for table messages`;
  `SET ROLE authenticated` `UPDATE ... SET is_read=true` → passa (fluxo legítimo intacto);
  `SET ROLE anon` INSERT → `permission denied for table messages`;
  trigger `trg_guard_message_status_fields` presente; `insert_policies=0`; colunas
  `status/status_updated_at/sender/agent_id/external_id` sem GRANT de UPDATE.
- comando: `bash scripts/db-audit/messages-sem-escrita-direta-cliente.test.sh`
  (a linha de resumo e as contagens estão no bloco FATOS MEDIDOS PELO FECHAR, abaixo).

## Testes Realizados

- [x] db / contrato: `bash scripts/db-audit/messages-sem-escrita-direta-cliente.test.sh`
      → `[OK] contrato messages sem escrita direta do cliente verificado`
- [x] prova red-first + mutation: o bloco ANTES prova o furo e 3 mutações (sem o GRANT por
      coluna; sem a trigger; sem o `DROP POLICY`) reprovam o contrato
- [ ] typecheck / lint / build / unit: não se aplica (diff só em `supabase/` e
      `scripts/db-audit/`)

## Checklist

- [x] RLS/GRANT considerados (é o objeto do cartão)
- [x] `-- Rollback` executável na migration
- [x] sem secrets e sem identificador do banco de produção (nem em teste)
- [x] escopo: só `supabase/migrations/**` e o teste de banco

## Achados fora do escopo (NÃO corrigidos)

- `src/components/inbox/chat/useChatPanelHandlers.ts:199` — o front manda `updated_at`
  redundante no UPDATE de edição (a trigger `update_messages_updated_at` já o seta); pode
  ser removido para encolher a lista de colunas abertas.
- `src/components/monitoring/hooks/useMonitoringActions.ts:42` — `.delete()` direto em
  `messages`; o cartão diz "o DELETE continua como está", então não mexi.
- Coexistência com PE-20 (apagar via RPC) e PE-55 (transcrição via Edge): `content`/
  `is_deleted`/`transcription`/`transcription_status` saem da lista de colunas abertas
  quando esses cartões integrarem.

## Notas para Reviewer

- Arquivo fora da lista `ARQUIVOS QUE PODE TOCAR` (`scripts/db-audit/...test.sh`) — ele é
  INDISPENSÁVEL para a prova que o próprio cartão exige ("papel real authenticated/anon/
  service_role"): as suítes `supabase/tests/*.sql` (a área de teste que o cartão lista) rodam
  como `service_role` (BYPASSRLS) e por contrato nunca provam enforcement — é o que diz o
  comentário em `.github/workflows/db-guard.yml:334`. Só o harness `scripts/db-audit/*.test.sh`
  executa sob papéis reais em Postgres descartável. Por isso a prova vive lá (o `supabase/tests/`
  do cartão não tem runner que prove permissão).
- Não existe coluna `error_*` em `public.messages` (o erro de entrega não é exposto na
  tabela); por isso o gatilho cobre `status`/`status_updated_at`. `sender`, `external_id`,
  `agent_id`, `media_url` e `contact_id` já são bloqueados pela trigger de proveniência
  (`guard_message_provenance_fields`, `20261006114108`) e continuam sem GRANT de coluna.
- `REGISTRO PENDENTE: scripts/db-audit/messages-sem-escrita-direta-cliente.test.sh` — é
  `.test.sh` novo: falta o passo correspondente em `.github/workflows/db-guard.yml` e o
  registro no inventário (arquivos que este cartão não manda tocar).
- O arquivo residual da tentativa anterior deste cartão
  (`supabase/tests/messages_sem_escrita_direta_do_cliente.sql`) foi movido para fora da
  árvore (`/tmp/messages_sem_escrita_direta_do_cliente.sql.residual-tentativa-anterior`);
  não entrou no commit.
