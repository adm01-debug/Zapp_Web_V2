Especialista: workersql

## Descrição

O cliente (papéis `authenticated`/`anon`) podia escrever direto em `public.messages`:
(a) `INSERT` livre de linha de conversa — a policy "Users can insert messages" só olhava a
VISIBILIDADE do contato, então qualquer agente com o contato visível forjava uma mensagem
`sender='agent'`; (b) `UPDATE` de tabela inteira, o que liberava `status`/`status_updated_at`
fora da trava de entrega e permitia maquiar o SLA de primeira resposta (o trigger de SLA usa
`status_updated_at` como instante da resposta). A migration fecha os dois: INSERT negado por
GRANT e pela remoção da policy órfã, UPDATE passa a ser por coluna (só as que o front escreve
de fato) e uma trigger recusa `status`/`status_updated_at` como defesa em profundidade.

## Arquivos alterados (3, sendo 1 de teste)

- `supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql` — migration
  nova (REVOKE/GRANT + trigger + bloco de rollback executável).
- `supabase/tests/messages_sem_escrita_direta_do_cliente.sql` — o 1 de teste: T1–T7 em Postgres
  descartável, com os papéis reais, aplicando o arquivo REAL da migration.
- `.tmp/relato.md` — este relato.

## Tipo de Mudança

- [x] 🔒 Segurança (bug de autorização)
- [x] 🐛 Bug fix

## Plano

- Plano do Claude: não há plano numerado para este cartão (nível worker, área banco).
- Passos executados:
  1. Levantei quem escreve em `messages` no front (`git grep` em `src/`): só 7 colunas.
  2. REVOKE INSERT (`PUBLIC, anon, authenticated`) + DROP da policy de INSERT; REVOKE UPDATE
     de tabela + GRANT UPDATE por coluna para `authenticated`.
  3. Trigger `trg_guard_message_status_fields` (defesa em profundidade para status).
  4. Prova T1–T7 em Postgres descartável, aplicando a migration real, papéis reais.
- Divergências do plano: a lista de colunas do cartão não citava `updated_at`; incluí porque
  `useChatPanelHandlers.ts:199` (edição de mensagem, R2-INB-014) escreve `content, updated_at`
  juntos — sem o GRANT, o fluxo legítimo quebraria com "permission denied".

## Banco de dados

Teste fora de produção: (1) Postgres descartável (`postgres:17-alpine`), com a suíte
`supabase/tests/messages_sem_escrita_direta_do_cliente.sql` aplicando o arquivo REAL da
migration; (2) o banco LOCAL da tarefa (`zapp-db-local up . v2-2610121210d074`), que reaplicou
todas as migrations reais — a migration nova entrou sem falha nova — e as checagens finais
rodaram como os papéis reais (abaixo). Nunca toquei produção nem o banco canônico.

migration `20261012151936_messages_sem_escrita_direta_do_cliente.sql` (classe contrato:
GRANT/REVOKE + trigger) — pendente de aplicação no banco canônico pelo fluxo de merge.

## Rollback

No topo da migration, bloco `-- Rollback (SQL executável, na ordem)`: devolve
`GRANT INSERT`/`GRANT UPDATE` de tabela a `authenticated`, derruba a trigger
`trg_guard_message_status_fields` + a função `guard_message_status_fields()` e recria a policy
de INSERT original ("Users can insert messages", nome e corpo do 20260925120000).

## Prova

- vermelho antes: com `-v sem_migration=1`, a suíte falha já em T2 (o cliente INSERE — o furo).
- verde depois: T1–T7 passam (INSERT/UPDATE do cliente negados, 7 colunas legítimas
  atualizáveis, trigger recusando status e service_role preservado).
- banco local canônico (esquema real da tarefa), como os papéis reais: `SET ROLE
  authenticated` INSERT → `permission denied for table messages`; `SET ROLE authenticated`
  `UPDATE ... SET status=...` → `permission denied for table messages`; `SET ROLE
  authenticated` `UPDATE ... SET is_read=true` → passou (fluxo legítimo intacto); `SET ROLE
  anon` INSERT → `permission denied for table messages`; trigger
  `trg_guard_message_status_fields` presente; `insert_policies=0`.

## Testes Realizados

- [x] db / contrato: suíte `supabase/tests/messages_sem_escrita_direta_do_cliente.sql` em
      container descartável aplicando a migration real
      → `TODAS as assercoes passaram (T1-T7)` (saída no bloco de fatos do fechar)
- [x] prova red-first: mesma suíte com `-v sem_migration=1` → `T2 FALHOU` (exit 3)
- [ ] typecheck/lint/build/unit: não se aplica (diff só em `supabase/`)

## Checklist

- [x] RLS/GRANT considerados (é o objeto do cartão)
- [x] `-- Rollback` executável na migration
- [x] sem secrets e sem número/identificador do banco de produção
- [x] escopo: só `supabase/migrations/**` e `supabase/tests/**`
- [x] self-review do diff completo

## Achados fora do escopo (NÃO corrigidos)

- `src/components/inbox/chat/useChatPanelHandlers.ts:199` — o front manda `updated_at`
  redundante no UPDATE de edição (o trigger `update_messages_updated_at` já o seta); pode ser
  removido para encolher a lista de colunas abertas.
- `src/components/monitoring/hooks/useMonitoringActions.ts:42` — `.delete()` direto em
  `messages`; o cartão diz "DELETE continua como está", então não mexi.
- PE-20 (apagar via RPC) e PE-55 (transcrição via Edge): `content`/`is_deleted`/
  `transcription`/`transcription_status` saem da lista de colunas quando esses cartões
  integrarem.

## Notas para Reviewer

- Não existe coluna `error_*` em `public.messages` (o erro de entrega não é exposto na
  tabela); por isso o gatilho cobre `status`/`status_updated_at`. `sender`, `external_id`,
  `agent_id`, `media_url` e `contact_id` continuam sem GRANT de coluna e, no banco real, ainda
  são bloqueados pela trigger de proveniência (`guard_message_provenance_fields`,
  20261006114108) — a suíte não monta essa trigger, então T3 mede o GRANT (42501), não a
  mensagem nomeada dela.
- A suíte é self-contained de propósito: cria a superfície mínima (roles + `public.messages`
  sem RLS) e aplica o arquivo REAL da migration; roda só em Postgres descartável e termina em
  `ROLLBACK` (zero efeito colateral). Nenhuma mudança em `.github/` nem em `scripts/`: a prova
  vive em `supabase/tests/`, a área de teste listada no cartão.
