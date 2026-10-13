Especialista: worker (sql)

## O que mudou e por quê
- supabase/migrations/20261013213816_ai_sentiment_summary.sql (nova): cria a RPC
  `public.ai_sentiment_summary(p_days integer default 30)` — SECURITY DEFINER,
  `search_path = public, pg_temp`, staff-only (admin/supervisor). Ela devolve
  `jsonb` com total, baldes (positivos/neutros/negativos), média, transcrições,
  a série diária e o mesmo agregado do bloco de dias imediatamente anterior.
  Motivo (PROBLEMA do cartão): o resumo era montado no navegador por cima das
  linhas cruas, então (a) o total parava no limite de linhas do PostgREST e
  (b) "período anterior vazio" virava divisão por zero. Com o agregado no
  servidor o total é o real e o período anterior vazio volta NULO, não zero.
- supabase/tests/ai_sentiment_summary.sql (novo): a prova. A superfície mínima
  (roles, `auth.uid`, tabelas de ambiente, PUBLICATION) é criada à mão — é
  ambiente, não contrato — e a proteção vem VERBATIM das migrations reais
  (`20251215025014` para user_roles/has_role/is_admin_or_supervisor e
  `20251222170958` para conversation_analyses), no mesmo padrão de
  supabase/tests/audit_log_summary_por_periodo.sql. As asserções rodam como
  PAPEL REAL (`SET LOCAL ROLE authenticated` + JWT sintético), nunca como
  postgres; o helper confere `current_user` e falha se o papel não pegar.
- src/integrations/supabase/types.ts: adiciona a assinatura
  `ai_sentiment_summary: { Args: { p_days?: number }; Returns: Json }`.
  Regra do repositório: RPC com `RETURNS` novo entra junto com types.ts.

## Decisões de contrato (para o worker que ajustar o hook)
- Janela = `p_days` DIAS DE CALENDÁRIO em America/Sao_Paulo, INCLUINDO hoje;
  segue o mesmo fuso que o resto do Dashboard (ex.: crisis_room_snapshot).
  `p_days` é normalizado para 1..366 (NULL/0/negativo não estoura).
- `critico` conta como NEGATIVO (regra IA-SENTIMENT-001); `total` conta todas
  as análises, inclusive as sem nota; `media` só existe com nota presente
  (`avg` ignora ausentes) e volta NULL sem amostra — nunca 0/50 inventado.
- `anterior` volta NULO (chave presente, valor null) quando o bloco anterior
  não tem análise. O front lê "sem base de comparação", não queda de 100%.
- Série diária: exatamente `p_days` baldes (um por dia, inclusive os vazios).

## Prova (banco descartável, PostgreSQL 17, aplica as migrations reais + as minhas)
- verde depois: `docker exec -i <pg> psql -X -v ON_ERROR_STOP=1 ... -v mig_dir=/repo/supabase/migrations < supabase/tests/ai_sentiment_summary.sql`
  → exit 0; todos os blocos PASS; última linha
  `IA-DB-002 OK: staff le o agregado real (sem truncar), serie diaria de p_days baldes, anterior NULO quando vazio; agente/anon/service_role negados (42501); EXECUTE so para authenticated.`
  Notas provadas: A) total/baldes/média/transcrições conferem com a contagem
  direta (baseline do superusuário); B) série com o número exato de baldes e
  soma igual ao total; C) anterior NULO quando vazio e, populado, com os
  mesmos agregados; D) 1200+ análises no período → total NÃO trunca; E) agente,
  anon e service_role negados com 42501 (mesma resposta para janela com e sem
  dado — sem oráculo); F) EXECUTE só para authenticated.
- vermelho antes: mesma execução com `-v sem_funcao=1` (não aplica a minha
  migration) → `ERROR: IA-DB-002 FALHOU [A1 total == 5]: esperado 5, obtido ERRO 42883` (undefined_function), exit 3. Sem a correção o teste quebra.
- aplicação no banco local da tarefa: `hermes-db-migrar supabase/migrations/20261013213816_ai_sentiment_summary.sql`
  → `APLICADA no banco LOCAL 'v2-2610131830b360' (produção não foi tocada).`
- rollback executável no topo da migration: `drop function if exists public.ai_sentiment_summary(integer);`

## O que NÃO fiz e por quê
- Não toquei o hook `src/hooks/analytics/useAIStats.ts` (consumo do resumo):
  está fora de ARQUIVOS QUE PODE TOCAR deste cartão. A RPC e o contrato acima
  ficam prontos para o worker de hooks/telas trocar a agregação no cliente pela
  chamada `supabase.rpc('ai_sentiment_summary', { p_days })`.
- Não liguei o teste a workflow/CI: a suíte é supabase/tests/*.sql (mesmo lugar
  das outras), fora do check-test-inventory, então não criei passo novo (o
  workflow é do worker de CI).
- Não incluí a contagem de `audit_logs` action `sentiment_alert`: o cartão pede
  os totais/sentimento, não os alertas.
