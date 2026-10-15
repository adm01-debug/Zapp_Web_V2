Especialista: semisenior (area-sql-banco)

## FAIXA DO PAI
Commits 584787e3e0 (código) e 6c4c8670a (relato) são a entrega anterior do cartão t_969a17db, recusada — não são deste refazer. Este refazer = 1 commit novo só com a correção abaixo. Workspace novo foi impossível (hermes-tarefa-iniciar retorna 75 CONGELADO — marcador MODO_V2 ausente no host, fato registrado em t_d4c432bd); trabalhei no workspace da entrega (branch v2/dashboard-kpi-periodo-26101311125c65), que já continha o trabalho anterior.

## O que mudou e por quê
- supabase/migrations/20261013235902_dashboard_kpi_periodo.sql (só o CREATE, linhas dos DEFAULTs + comentário): `now()` → `CURRENT_TIMESTAMP` (idênticos — ambos início da transação) e remoção dos parênteses externos dos DEFAULTs, deixando UM só nível de parênteses. Motivo: o guard scripts/db-audit/supabase-usage-guard.mjs projeta o catálogo varrendo as migrations com regex de CREATE FUNCTION de um nível — DEFAULTs com parênteses aninhados tornavam este CREATE invisível enquanto o DROP da mesma migration era visto, e o nome dashboard_kpi saía da projeção (front acusado de violação nova). Guarda, CI, manifesto, catálogo, baseline e testes intocados.

## Prova
- Vermelho antes: `node scripts/db-audit/supabase-usage-guard.mjs` → exit 1, `Violacoes totais: 3 | no baseline: 2 | novas: 1`, `NOVAS violacoes - alvo nao existe no banco principal: src/hooks/dashboard/useDashboardKpi.ts:79 .rpc('dashboard_kpi')` (projeção cai para 276 funções). No espelho dia/2026-10-14 + entrega original: 283 funções + 1 nova + FAIL.
- Verde depois: mesmo comando → exit 0, `Violacoes totais: 2 | no baseline: 2 | novas: 0`, `OK: nenhuma violacao nova.` (projeção volta a 277 funções). No espelho dia/2026-10-14 + correção: 284 funções, 0 novas, exit 0.
- `bash scripts/db-audit/dashboard-rls-authorization.test.sh` (Postgres 17 descartável, aplica a migration editada de verdade) → exit 0, 61 [PASS], zero [FAIL]; E1–E5 todos [PASS], incluindo E5 (default sem argumentos = dia atual SP, 3|1).
- Equivalência dos DEFAULTs no Postgres 17 real, forma antiga × forma nova em 1252 instantes de 2018 (ano com horário de verão em SP) e 1252 de 2026: 1252/1252 iguais em p_from e 1252/1252 em p_until nos dois anos.
- `zapp-verify . --rapido` → exit 0, `VERIFY: VERDE SEM BANCO` (db_guard OK, tipos OK, lint OK, migrations OK).

## Pontos do revisor
- Ponto 1: REPRODUZIDO — espelho dia/2026-10-14 + entrega: o item `guarda: scripts/db-audit/supabase-usage-guard.mjs` acusa `.rpc('dashboard_kpi')` como violação nova. Causa-raiz provada: o CREATE tem DEFAULTs com parênteses em 2 níveis (regex do guard só casa 1) → CREATE invisível + DROP visível → nome some da projeção.
- Ponto 2: CAUSA CORRIGIDA no DDL da própria entrega, sem afrouxar nenhuma asserção — nenhum arquivo de guarda, manifesto, CI, catálogo ou baseline foi alterado; diff do refazer = 1 arquivo.
- Ponto 3: MESMO comando do guard VERDE (acima) + `zapp-verify . --rapido` VERDE (acima).

## O que NÃO fiz e por quê
- Não regenerei schema-manifest.json/schema-catalog.json nem apliquei migration em banco oficial: exige banco oficial + autorização do Joaquim (mesma pendência da entrega; sync de tipos/front em t_9f99b718).
- Não migrei o front (useDashboardKpi.ts ainda chama p_since/p_queue/p_agent): escopo de t_9f99b718, citado na própria recusa.
- Não alterei o parser do guard (limitação real do regex de 1 nível): arquivo de guarda não se altera para fazer passar; deixo como achado em comentário para o dono da guarda.
- ci_espelho.sh não executável diretamente (a guarda do host bloqueia o caminho ~/arquitetura-v2/... para este perfil); executei o item que reprovava com o comando idêntico ao do espelho + as demais guardas baratas do espelho (4 OK; check-test-inventory falha por 6 .test.sh órfãos pré-existentes alheios ao cartão — vai como achado, e no espelho inventário vira pendência, não reprovação).
- Fechamento via hermes-tarefa-fechar impossível (CONGELADO, exit 75, sem MODO_V2); entrega registrada via kanban com branch+commit citados.
