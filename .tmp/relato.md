Especialista: worker (sql) (area-sql-banco; prova de papel real por provar-rls-com-papel-real)

## O que mudou e por quê

- `supabase/migrations/20261013230006_monitoring_message_buckets.sql` (NOVO, único artefato de banco): cria a RPC
  `public.get_monitoring_message_buckets(p_from timestamptz, p_to timestamptz, p_bucket interval)` que devolve uma
  linha por balde — `(bucket_start timestamptz, incoming bigint, outgoing bigint)`. Ela agrega `public.messages` NO
  BANCO, então não há mais teto de linhas: o gráfico de monitoramento montava os baldes no navegador a partir de no
  máximo 1.000 mensagens e, em período movimentado, cortava a curva e subestimava o total. `incoming` = sender
  'contact'; `outgoing` = qualquer outro sender (preserva a semântica anterior do hook). O balde é ancorado no início
  da hora cheia / dia civil no fuso America/Sao_Paulo e é half-open (`>= p_from`, `< p_to`); a âncora nunca
  ultrapassa `p_to`. Restrita a staff (`is_admin_or_supervisor`) — o mesmo conjunto que a policy SELECT de
  `public.messages` já deixava ver todas as mensagens, então o `SECURITY DEFINER` não amplia o que o papel via.
  `revoke all ... from public, anon` e `grant execute ... to authenticated`; não há caminho de serviço para esta
  leitura de tela, então service_role fica negado. A 1ª linha tem `-- Rollback:` com o SQL executável (drop da função).

- `src/integrations/supabase/types.ts`: adiciona a assinatura da RPC em `Functions` (ordem alfabética) para o
  `supabase.rpc('get_monitoring_message_buckets', ...)` tipar — o cliente do cartão filho usa `p_bucket` como string
  e recebe `{ bucket_start: string; incoming: number; outgoing: number }[]`.

- `supabase/tests/monitoring_message_buckets.sql` (NOVO, provado em Postgres 17 descartável): T1 baldes de hora,
  direção e borda da janela; T2 1.200 mensagens somando 1.200 (o corte antigo era 1.000); T3 ancoragem no fuso
  America/Sao_Paulo (hora cheia e meia-noite civil mesmo com `p_from` no meio da hora); T4 anon negado no GRANT
  (42501); T5 authenticated fora do staff negado pelo guard (42501 `monitoring_staff_required`); T6 entradas
  inválidas abortam com 22023 (bucket < 1 minuto, janela invertida, janela > 5.000 baldes, bucket nulo); T7 bordas
  half-open (14:37:29 fora / 14:37:30 dentro / 14:40:00 fora); T8 service_role negado. Papel sempre por `SET LOCAL
  ROLE` + `request.jwt.claims`, nunca superusuário.

## Prova

Vermelho antes (função inexistente, sem a migration):
`docker exec -i <pg17> psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -v sem_migration=1 < supabase/tests/monitoring_message_buckets.sql`
→ `ERROR: function public.get_monitoring_message_buckets(timestamp with time zone, timestamp with time zone, interval) does not exist`

Verde depois (mesmo comando, com a migration real via `-v mig=...`):
→ `NOTICE: T1 OK … T2 OK … T3 OK … T7 OK … T4 OK … T5 OK … T8 OK … T6 OK`
→ `### TODOS OS CENARIOS (T1-T8) PASSARAM ###`

Migration aplicada no banco local da tarefa:
`hermes-db-migrar supabase/migrations/20261013230006_monitoring_message_buckets.sql`
→ `BEGIN / CREATE FUNCTION / REVOKE / GRANT / COMMIT` · `APLICADA no banco LOCAL ... (produção não foi tocada)`

Passada de efeitos colaterais (skill armadilhas-workersql): a RPC é `STABLE` e só lê `public.messages` — nenhum
INSERT/UPDATE/DELETE, logo nenhum gatilho (updated_at, audit) dispara; é um único `RETURN QUERY` (atômico); a
resposta/erro é igual para janela vazia ou cheia (sem oráculo de existência); nenhum GRANT/ACL de objeto existente
mudou além do `execute` da própria função nova.

## O que NÃO fiz e por quê

- Não toquei `useMonitoringData.ts` nem os testes do hook: essa é a outra metade do cartão do hook
  (t_c3c48a64), que passa a chamar esta RPC. Deixei o contrato documentado na migration e em `types.ts` para ele.
- Não editei migration existente (correção = migration nova) e não usei DROP/TRUNCATE/DELETE em massa.
- Não criei `scripts/db-audit/*.test.sh` (exigiria passo no db-guard.yml, que não é minha área): a prova vive em
  `supabase/tests/`, que o cartão permite.

## Sobre o alarme "código alterado sem teste novo" (FALSO POSITIVO)

O fechar apontou `src/integrations/supabase/types.ts` como "código alterado sem teste novo". Não procede:
o commit JÁ traz um teste novo que falha sem a mudança e passa com ela — `supabase/tests/monitoring_message_buckets.sql`
(vermelho `sem_migration=1` → verde, nas linhas acima). O detetor só reconhece teste por nome `.test.`/`.spec.`, e a
suíte de banco aqui é `.sql` em `supabase/tests/` (como as demais do projeto). Além disso `types.ts` é DECLARAÇÃO de
tipos gerada — não tem lógica de runtime para testar; o único código real do diff é a função SQL, coberta por T1–T8.
Repito o MESMO comando de fechar com esta explicação.
