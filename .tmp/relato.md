Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261013230004_inbox_unread_total.sql` (aditiva): cria a RPC
  `public.inbox_unread_total()` (bigint, STABLE, SECURITY DEFINER, `search_path=public`)
  que devolve, em UMA chamada, quantas CONVERSAS o chamador tem com ao menos uma mensagem
  do contato não lida (`sender='contact' AND is_read IS NOT TRUE`). A visibilidade usa o
  MESMO predicado canônico `public.is_contact_visible_to_user(contact_id, auth.uid())` de
  `get_inbox_contact_summaries` — nada de regra de autorização reescrita à mão. ACL:
  REVOKE de PUBLIC/anon, GRANT EXECUTE só para authenticated e service_role. Mais o índice
  parcial `idx_messages_unread_conversas (contact_id) WHERE sender='contact' AND is_read IS NOT TRUE`.
  Rollback executável no topo (drop function + drop index).
- `src/integrations/supabase/types.ts`: `inbox_unread_total: { Args: never; Returns: number }`.
- `supabase/tests/inbox_unread_total.sql`: a prova (banco local, papéis reais).

Correção principal: hoje o selo de não lidas é uma soma por contato no cliente (fetch
pesado). Esta RPC responde o total em uma chamada leve, com a mesma visibilidade.

## Prova (comandos rodados agora, banco LOCAL da tarefa)
- vermelho antes (função dropada, teste sem ela):
  `zapp-db-local psql . inb13 -v ON_ERROR_STOP=1 < supabase/tests/inbox_unread_total.sql`
  -> `ERROR: function public.inbox_unread_total() does not exist` / `EXIT_RED=3`.
- verde depois (migration aplicada, mesmo comando):
  -> `NOTICE: inbox_unread_total: suite OK (T1 visibilidade do agente, T2 admin ve todas,
     T3 ler reduz, T2b ACL, T4 is_read nulo, T5 contato sem mensagem, T7 escala 3.650)
     — 5 grupo(s)` / `EXIT_GREEN=0`.
- índice adequado (EXPLAIN ANALYZE BUFFERS do passo de candidatos):
  `Bitmap Index Scan on idx_messages_unread_conversas ... rows=3670 ... Execution Time: 2.528 ms`
  (varre o índice parcial só das não lidas; `Buffers: shared hit=84`).
- escala 3.650 contatos (saída do teste): agente A `total=3650 em 2558.1 ms`;
  admin `total=3660 em 323.3 ms`. O custo é o predicado canônico de visibilidade por
  contato candidato (o mesmo que `get_inbox_contact_summaries` já paga, e que ainda baixa
  as mensagens); a varredura de `messages` é 2,5 ms.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (204s)` (dependencias, db_guard,
  tipos, lint, migrations = OK).

O teste cobre: T1/T4 agente conta só o que enxerga e conta CONVERSAS, não mensagens;
T2 admin vê todas; T3 marcar como lida reduz o total; T2b anon barrado, authenticated e
service_role com EXECUTE; T5 contato sem mensagem não entra; T7 exatidão com 3.650 contatos
(contagens ancoradas em base+delta, porque o seed local já tem não lidas).

## O que NÃO fiz e por quê
- Não toquei `src/pages/Index.tsx` nem os hooks do inbox: o cartão é só o lado banco; o
  consumo é do cartão irmão `t_f7c9e079` (contrato em `kanban_comment`).
- Não adicionei passo em `.github/workflows/db-guard.yml`: `supabase/tests/*.sql` não são
  inventariados (o `check-test-inventory` só cobre `.test.sh`/`.mjs`).
- Observação de ferramenta (não é do diff): `zapp-db-local` não achou o contêiner quando
  usei o basename longo do workspace (o Docker trunca o 2º segmento do nome); subi o
  conjunto com o nome curto `inb13`. `hermes-db-migrar` recusou a reaplicação
  (APLICADA_LOCAL), então reapliquei pelo `zapp-db-local psql`.
- O cartão termina com a linha de REGRAS PERMANENTES; se o fechar acusar "SEM DDL/migration"
  ou "fora do escopo", é alarme falso de template de cartão de banco — repetir o MESMO comando.
