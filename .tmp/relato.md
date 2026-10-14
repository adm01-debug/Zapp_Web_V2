Especialista: workersql

Refazer 1 do dedupe do aviso de meta: a recusa apontou oráculo de RLS na trigger DEFINER (duplicado do cliente voltava INSERT 0 0 em vez de 42501). Conferi que procede, troquei a função para INVOKER com pulo silencioso só para papel servidor e adicionei o teste do duplicado negado (T6b).

Ponto 1 — oráculo: conferi no Postgres descartável com a migration antiga que o diagnóstico procede (duplicado de authenticated do próprio aviso voltou INSERT 0 0, sem erro, segue 1 linha). Mudança em `supabase/migrations/20261012231400_notifications_goal_dedupe.sql`: função agora SECURITY INVOKER (o EXISTS respeita a RLS do chamador; mantido `set search_path = public, pg_temp` e o REVOKE) e o RETURN NULL só acontece com `current_user IN ('service_role','postgres')`; anon/authenticated seguem para a RLS, que nega com 42501 — o mesmo erro de um aviso novo. Teste: T6b falha na migration antiga e passa na nova (linhas abaixo).
Ponto 2 — T6b: adicionado em `supabase/tests/notifications_goal_dedupe.sql` após o T6; authenticated e anon repetem o aviso que JÁ EXISTE (g-abc/daily de hoje, do T1), ambos têm de receber insufficient_privilege e a contagem de linhas não pode mudar. Vermelha: migration antiga + teste novo → `ERROR: T6b FALHOU: duplicado de authenticated passou (INSERT 0 0 = oraculo)`; verde: migration nova → `NOTICE: T6b OK: duplicado de authenticated e anon negado (42501), nada gravado`.
Ponto 3 — assinatura: a primeira linha deste relato é exatamente `Especialista: workersql`.
Ponto 4 — afirmação corrigida: INSERT do navegador (novo ou duplicado) é negado pela RLS com 42501 (T6 para o novo, T6b para o duplicado); só service_role deduplica em silêncio (T1, 2 INSERTs iguais = 1 linha). A seção "O que NÃO fiz" abaixo já reflete esse contrato.
Ponto 5 — vermelho→verde refeito no banco descartável com papéis reais: sem migration (`-v sem_migration=1`) falha em T1; com a migration corrigida passam T1–T7+T6b (saída abaixo). Rollback do cabeçalho executado no banco descartável: trigger 1→0, função 1→0, índice IA-047 intacto.

Arquivos (`git diff --name-only`, só estes 3):
supabase/migrations/20261012231400_notifications_goal_dedupe.sql
supabase/tests/notifications_goal_dedupe.sql
.tmp/relato.md

Verificação (Postgres 17 descartável; o teste cria roles anon/authenticated/service_role, auth.uid()/auth.role(), RLS + policies reais e aplica o ARQUIVO REAL da migration):
- verde: `T1 OK: 2 insercoes iguais = 1 linha` / `T2 OK: 3 no total` / `T3 OK: dia diferente` / `T4 OK: type<>goal nao e deduplicado` / `T5 OK: 23505` / `T6 OK: 42501` / `T6b OK: duplicado de authenticated e anon negado (42501), nada gravado` / `T7 OK: funcao fechada` / `TODAS as assercoes passaram (T1-T7+T6b)`
- vermelho sem migration: `ERROR: T1 FALHOU: 2 insercoes iguais gravaram 2 linha(s), esperado 1`
- migration antiga + teste novo: T1–T6 OK, `ERROR: T6b FALHOU: duplicado de authenticated passou (INSERT 0 0 = oraculo)`
- rollback: `ANTES_trigger=1 ANTES_funcao=1 DEPOIS_trigger=0 DEPOIS_funcao=0 DEPOIS_indice_intacto=1`

Passada de efeito colateral: 1. gatilhos: único trigger em notifications é este (IA-047 só criou coluna+índice); só atua em INSERT, sem UPDATE/backfill/evento. 2. tudo ou nada: sem escrita parcial; fail-closed do índice mantido. 3. sem oráculo: T6b prova 42501 igual para duplicado de authenticated e anon. 4. permissão: sem GRANT/policy novos; único ACL é o REVOKE preexistente da função. 5. entrada inválida: sem contrato (goal_id/period ausentes) segue fail-open como antes, sem inventar chave. 6. teste por comportamento com papel real, sem deparse.

O que NÃO fiz e por quê: não mexi no hook `src/hooks/analytics/useGoalNotifications.ts` (fora do escopo: a escrita segue server-only pela policy WITH CHECK false; quem ligar o aviso via service_role já tem dedupe e 23505 como sucesso). Não apliquei no banco da tarefa nem rodei `zapp-verify`: `hermes-tarefa-iniciar`, `hermes-db-migrar` e `hermes-tarefa-fechar` estão CONGELADOS neste ambiente (modo V1 suspenso); a prova foi no Postgres descartável com a migration real, no molde da suíte. Não criei `.test.sh` novo (inventário do CI reprova arquivo novo; a suíte fica em `supabase/tests/`, arquivo permitido pelo cartão).
