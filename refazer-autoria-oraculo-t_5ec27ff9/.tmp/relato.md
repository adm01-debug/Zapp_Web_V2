Especialista: workersql

Refazer 1 do cartão de autoria não falsificável + oráculo de papel. Aproveitei o
trabalho anterior (branch v2/autoria-oraculo-papel-2610130332ad03, tip bf1a2552f):
diff contra dia/2026-10-13 tem só os 3 arquivos do cartão; meu patch altera só os
2 .sql (comentários + 2 blocos de teste). Verificação rodada agora em cópia própria
da base dia/2026-10-13 com stack local v2-refaz5ec27ff9 (hermes-tarefa-* congelado,
sem fechar; sem push; sem produção).

Ponto 1 — relato × diff (policies INSERT + GRANT/REVOKE) → corrigido na migration.
O que mudei: supabase/migrations/20261013210006_autoria_e_oraculo_de_papel.sql,
só comentários: troquei "nenhum GRANT novo" por "Há REVOKE de PUBLIC/anon + GRANT
a authenticated/service_role nas 4 funções de papel ... e nas 2 funções de gatilho
novas"; documentei que a policy de eventos troca 'performed_by is null or ...' por
'performed_by = ...' porque o gatilho carimba sempre o chamador; acrescentei ao
-- Rollback: as 4 linhas `grant execute ... to public, anon` que faltavam.
Teste que prova: o próprio -- Rollback: executado no banco local, ROLLBACK_EXIT=0,
`select count(*) from pg_trigger where tgname like 'trg_bind%'` = 0 depois dele, e
o teste cheio volta a 15 OK após reaplicar a migration (REAPPLY_EXIT=0).

Ponto 2 — RPCs DEFINER e o carimbo (retrato de autoria) → provado com teste.
Afirmação corrigida: auth.uid() presente dentro da RPC chamada por autenticado faz
o gatilho sobrescrever o autor explícito daquela linha (set_conversation_status
escrevia closed_by NULL; transfer_conversation já escrevia o próprio chamador, e o
gatilho preserva esse valor). Nenhuma RPC precisa de exceção no gatilho: com JWT o
autor carimbado é o chamador; sem JWT (service_role) o valor explícito é preservado.
O que mudei: supabase/tests/autoria_e_oraculo_de_papel.sql, +contato c0003 e bloco
F1e/F1f (set_conversation_status como agente a0002; transfer_conversation como admin
a0001; agente não-admin transferindo segue negado pelo gatilho anterior, preservado).
Teste que prova: sonda F1e isolada — VERMELHO sem a migration
(`SONDA-F1e VERMELHO: closure da RPC ficou closed_by=<NULL>`) e VERDE com ela
(`SONDA-F1e VERDE: set_conversation_status grava o chamador`); arquivo cheio após
reaplicar: EXIT=0, 15 linhas OK, incluindo `F1e OK` e `F1f OK`.

Ponto 3 — usuário comum ainda consulta o próprio papel → teste adicionado.
O que mudei: supabase/tests/autoria_e_oraculo_de_papel.sql, bloco (a2) F3m/F3n no
mesmo contexto autenticado do F3a-e: `has_role(uid próprio,'agent') = true` e
`get_profile_role_for_check(uid próprio)` = 1 linha.
Teste que prova: arquivo cheio com a migration aplicada: EXIT=0 e
`F3m-n OK: usuario comum segue consultando o proprio papel` (F3e sozinho passaria
mesmo com acesso bloqueado; F3m/F3n são os que discriminam o acesso preservado).

Ponto 4 — políticas existentes continuam funcionando (suíte no banco local).
Rodei com a migration aplicada, no stack v2-refaz5ec27ff9:
`bash scripts/db-audit/secd-caller-check.test.sh` → EXIT=0,
`M-DB-05 (13 funcoes SEM checagem do chamador): 45 cenarios aprovados.`
`bash scripts/db-audit/wa-tag-and-status-authorization.test.sh` → EXIT=0,
`[OK] contrato de autorizacao L1/L2 verificado`
`bash scripts/db-audit/conversation-closures-reopen-same-day.test.sh` → EXIT=0,
`PASS: R2-DB-008 — encerrar→reabrir→encerrar no mesmo dia ...`
Mais o arquivo novo: EXIT=0, 15 OK (F1a-f, F2b/d/e-f, F3a-n/f-h/i-j/k/l).
Mapa vermelho→verde honesto: sem a migration o arquivo reprova (ERROR na inserção
de evento com autor forjado + cascata; sonda F1e mostra closed_by NULL; sonda F3
mostra `oraculo ... (t)`); com ela, 15 OK. F2 passa nos dois estados (é teste de
preservação: o WITH CHECK explícito nega o mesmo que o USING negava); F1f/F3m-n
também passam nos dois (guardas de regressão, não discriminantes).
Segunda passada (defeito novo do meu diff): conferi todos os chamadores das 4
funções de papel — 5 em Edge (multiplix-dispatch audience/is_admin, ai-kb-ingest,
send-email, approve-password-reset, multiplix-audience) e 1 no front
(useCRMAdminAccess): todos passam o próprio uid (JWT do chamador) ou rodam como
service_role (sem JWT, caminho interno preservado). Nenhum passa uid alheio
esperando true; nenhuma quebra adjacente. Nenhum arquivo fora dos 2 .sql foi tocado.

O que NÃO fiz e por quê:
- scripts/db-audit/dashboard-rls-authorization.test.sh aborta na guarda de vigência:
  `[FAIL] guarda de vigencia: helper is_admin_or_supervisor redefinido depois de
  20251215025014_...sql em: 20261013210006_autoria_e_oraculo_de_papel.sql` (EXIT=1).
  É a guarda funcionando como projetada (toda redefinição do helper exige atualizar
  o pin da suíte); o pin é arquivo de outra área e o cartão proíbe outros arquivos.
  Deixei o achado em kanban_comment para um cartão da área de dashboard.
- `zapp-verify . v2-refaz5ec27ff9 --rapido`: db_guard OK, tipos OK (49s), lint OK
  (70s), migrations OK, travas OK; banco_local FALHOU com 201 diferenças contra o
  retrato. Dessas, 16 são deste cartão (4 policies recriadas + 2 gatilhos novos +
  6 funções + 4 routine_grants, listadas em check-diferencas.txt) e 185 são drift
  pré-existente de outras áreas (ai_usage_outbox, whatsapp_connections etc.);
  `zapp-db-local check --aceitar` com só as 16 chaves: `201 diferença(s) ... (185
  fora da lista de aceitas)`. O retrato só é atualizado com leitura de produção
  (recusada a agente); fica para o integrador.
- Suite Deno de Edge e test:contracts não rodam: o diff é só SQL, nenhuma função
  foi tocada (mesmo motivo da tentativa anterior não rodar o verify cheio; aqui
  rodei o --rapido com banco e reporto o resultado real acima).

Arquivos (diff contra o tip bf1a2552f da branch do cartão — patch anexo):
supabase/migrations/20261013210006_autoria_e_oraculo_de_papel.sql
supabase/tests/autoria_e_oraculo_de_papel.sql

Comandos (todos agora, na cópia, stack v2-refaz5ec27ff9):
zapp-db-local up . v2-refaz5ec27ff9 → stack de pé, migration aplicada (2 triggers presentes)
zapp-db-local psql . v2-refaz5ec27ff9 -v ON_ERROR_STOP=1 -f - < supabase/tests/autoria_e_oraculo_de_papel.sql → EXIT=0, 15 OK
rollback do cabeçalho (20 linhas) → ROLLBACK_EXIT=0, triggers 0; sem a migration: arquivo reprova + SONDA-F1e VERMELHO (NULL) + SONDA-F3 VERMELHO (t)
reaplicação da migration → REAPPLY_EXIT=0; arquivo → EXIT=0, 15 OK; sondas VERDE
3 suítes existentes → EXIT=0 (45 cenários; [OK] L1/L2; PASS R2-DB-008)
dashboard-rls → EXIT=1 só na guarda de vigência (linha citada acima)
zapp-verify --rapido → etapas OK menos banco_local (201 diffs: 16 do cartão + 185 drift)
Observação: 3 WARNINGs de gamificação (grant_agent_achievement inexistente nesta
base) aparecem iguais com e sem a migration; são ruído pré-existente, sem falha.
