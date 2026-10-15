Especialista: workersql
Refazer 1 do IP2 (recusa: diff de 97k, grande demais para revisao).

Ponto unico da recusa (diff grande) — resolvido dividindo em 2 cartoes independentes:
- Este cartao (IP2-A): colunas investigated_* + RPC mark_pause_investigated + auditoria,
  com sua suite (T1..T7). Serie 24h/7d foi para o filho t_e75e24e9 (complexo), com seu teste.
- Removido do diff o que nao e deste titulo: faixa do IP1 (commit ce416c639a),
  RPCs do IP1 em types.ts (pause/resume/auto/is_paused) e a tabela inteira de types
  (o IP1 e dono da tabela; nenhum codigo src usa os simbolos novos neste cartao).

Arquivos: supabase/migrations/20261013160000_instance_pause_investigation.sql (aditiva,
Rollback executavel no topo, SET search_path, grants explicitos); supabase/tests/
instance_pause_investigation.sql (T1 investiga+audita, T2 negado sem efeito p/ agent/anon/
sem-ator, T3 validacao 1001/HTML/branco, T4 P0002, T5 3 auditorias + ator congela,
T5b supervisor, T6 RLS/ACL, T7 rollback executado de verdade + restore; tudo em
transacao unica com ROLLBACK final, papel real via request.jwt.claims).

Prova no banco local: <resultado do up + suite, ver comandos abaixo>.
Comandos: zapp-db-local up . v2-26101315358410 (log em .tmp/up.log);
zapp-db-local psql . v2-26101315358410 -v ON_ERROR_STOP=1 < supabase/tests/instance_pause_investigation.sql;
zapp-verify . --rapido.
