Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013230002_contact_response_stats.sql` (NOVO, aditivo): cria a RPC
  `public.contact_response_stats(p_contact_id uuid, p_days integer DEFAULT 30)`, que devolve numa
  única chamada as contagens e o tempo de resposta do painel do contato — e tira o viés do defeito.
  * Tempo de resposta: par "mensagem do contato → a resposta do agente seguinte", casado com `lead()`
    sobre o histórico INTEIRO ordenado por `(created_at, id)`; devolve `response_samples`,
    `avg_response_minutes` e `median_response_minutes` (`percentile_cont(0.5)`). A leitura antiga
    (`order created_at asc` + `limit 200`) só enxergava as 200 mensagens mais antigas.
  * Contagens: `total_messages`/`total_conversations` e os pares recente/anterior de cada um, com
    `*_change_percent` (janela = últimos `p_days`; anterior = os `p_days` anteriores). Janela anterior
    zerada devolve NULL (não inventa número).
  * CSAT: `csat_average` e `csat_count`.
  * Visibilidade: a função é `SECURITY DEFINER` e age em nome do usuário, então a barreira é
    `public.is_contact_visible_to_user(p_contact_id, auth.uid())`. Contato invisível OU inexistente
    devolve o MESMO resultado (0 linhas) — sem oráculo.
- ACL: `REVOKE ALL ... FROM PUBLIC, anon` pela assinatura exata e `GRANT EXECUTE` só a
  `authenticated, service_role`; `SET search_path = public, pg_temp`.
- `src/integrations/supabase/types.ts`: assinatura da função nova (regra da área: RETURNS novo vai
  junto).
- Sem DML, sem gatilho e nenhuma ACL/policy de objeto EXISTENTE foi tocada; é um único
  `CREATE OR REPLACE FUNCTION` (atômico). O cartão é de banco e a única linha de migration é esta.

## Prova
- verde (papel real): `zapp-db-local psql . v2-2610130414ff44 -v ON_ERROR_STOP=1 < supabase/tests/contact_response_stats.sql`
  → `BEGIN / DO / ROLLBACK` + `NOTICE: contact_response_stats: suite OK — 7 grupo(s) verificado(s)`.
  A suíte roda as chamadas como `authenticated` (e o caso negativo como `anon`), e usa as migrations
  reais do banco da tarefa.
- vermelho do defeito (dentro da própria suíte): com 300 pares (100 de 1 min + 200 de 5 min), a
  leitura ANTIGA das 200 primeiras linhas dá média 1.00; a RPC devolve 3.67 do histórico completo
  (`response_samples`=300, mediana 5.00). O assert exige `avg <> media_antiga`.
- rollback executável: `BEGIN; drop function if exists public.contact_response_stats(uuid, integer); ROLLBACK;`
  → `DROP FUNCTION`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (112s)` (`OK tipos 108s`, `OK migrations`,
  `OK db_guard`).

## Passada de efeito colateral
1. Gatilhos: não há INSERT/UPDATE/DELETE — nenhum gatilho dispara.
2. Tudo ou nada: uma instrução, uma transação.
3. Sem oráculo: invisível e inexistente devolvem 0 linhas (testado nos dois).
4. Permissão só a pedida: REVOKE/GRANT apenas no objeto NOVO.
5. Entrada inválida: `p_contact_id` inexistente e `p_days` fora da faixa (cai no default 30) testados.
6. Teste por comportamento com papel real; sem `pg_policies`/deparse.

## O que NÃO fiz
- Não toquei `src/services/contact.service.ts#fetchStats`: quem troca a chamada é o cartão vizinho
  t_17d80b67 (hugo). A RPC já devolve tudo que o `fetchStats` monta hoje, mais a mediana.
- Não criei `scripts/db-audit/*.test.sh` novo (proibido pela área): a prova vive em `supabase/tests/`
  e roda com papel real.

## Arquivos do diff (3)
- `supabase/migrations/20261013230002_contact_response_stats.sql`
- `supabase/tests/contact_response_stats.sql`
- `src/integrations/supabase/types.ts`

Obs.: os FATOS dirão "nenhum arquivo de teste alterado" — a suíte nova é `supabase/tests/*.sql`, que o
classificador do fechar não conta como "teste" (é suíte SQL, não vitest). É a mesma suíte citada na prova.

SAÍDA DA PROVA:
BEGIN
DO
ROLLBACK
NOTICE:  contact_response_stats: suite OK — 7 grupo(s) verificado(s)
