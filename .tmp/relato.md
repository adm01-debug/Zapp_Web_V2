Especialista: workersql
Refazer 1 do IP2 (recusa: diff de 97k, grande demais para revisao).

Ponto unico da recusa (diff grande) — resolvido dividindo em 2 cartoes independentes:
- Este cartao (IP2-A): colunas investigated_* + RPC mark_pause_investigated + auditoria,
  com sua suite (T1..T7). Diff final: 31173 caracteres em 3 arquivos (migration 133
  linhas, teste 408 linhas, relato). Serie 24h/7d foi para o filho t_e75e24e9
  (complexo, gated por este cartao), com especificacao completa e seu teste.
- Removido do diff o que nao e deste titulo: faixa do IP1 (commit ce416c639a),
  RPCs do IP1 e o bloco instance_pauses em types.ts (revertido; o IP1 e dono da
  tabela e nenhum codigo src usa os simbolos novos — zapp-verify/tipos confirma).

Suite supabase/tests/instance_pause_investigation.sql (transacao unica, ROLLBACK final,
papel real via request.jwt.claims): T1 investiga+audita sem copiar notas; T2 negado
(agent/anon/sem-ator, 42501, sem efeito e sem auditoria); T3 validacao (1001/HTML/
branco); T4 P0002; T5 3 auditorias 1/chamada + 1o ator congela; T5b supervisor;
T6 RLS/ACL (EXECUTE: anon nao, authenticated sim; sem UPDATE/INSERT/DELETE direto);
T7 executa o -- Rollback: da migration no schema real e confirma remocao + restore.

Verificacao: `zapp-verify . --rapido` VERDE SEM BANCO (76s): db_guard OK, tipos OK,
lint OK, migrations OK; banco_local nao verificado (sem conjunto de pe).
Prova com papel real no banco local NAO obtida — tentativa unica conforme orientacao:
`zapp-db-local up . v2-26101315358410` => UP_RC=1:
`migrations: 125 ok, falha(s) de 833 (reaplicadas como supabase_admin) | seed: FALHOU`
+ 5 travas (DNS producao, pg_cron ligado, tarefa agendada ativa, pg_net ligado/
http_get) e o proprio script quebra (estado/falhas.tsv, seed.log, check.txt nunca
criados — linhas 145/147/153/158/163/170/172/75). Log completo em /tmp/up-t3ca58.log.
Para a prova, o scaffold do IP1 (migration 20261011183812, NAO commitada, removida
apos a tentativa) foi necessario porque a tabela instance_pauses ainda nao integrou.
