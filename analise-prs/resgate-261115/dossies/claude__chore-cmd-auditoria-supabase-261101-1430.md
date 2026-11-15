# Dossiê — claude__chore-cmd-auditoria-supabase-261101-1430 (PR #2495)

**Veredito: OBSOLETA** · confiança média · apagar branch: sim

## Propósito
Branch de 1 commit útil (`a47ecbb75`, 2026-11-01) + 4 merges de `main`. Adiciona só
`.claude/commands/auditoria-supabase.md` (261 linhas): um roteiro/prompt para o Claude Code
consolidar 3 auditorias Supabase em `auditoria-supabase/achados.json` (Fase 0), cobrir lacunas
(Fase A) e executar correções em classes AUTÔNOMA/APROVAÇÃO (Fase B), com 2 goals prontos.
PR #2495 fechada em 2026-11-01T23:49Z pelo congelamento de features (#2545), sem merge.
Triagem anterior (2026-11-08): OBSOLETA.

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `.claude/commands/auditoria-supabase.md` | NEW_FILE_ABSENT_IN_MAIN (176 linhas ausentes) | O arquivo não está na main (`git ls-tree origin/main .claude/commands/` = só `merge-prs.md`, `resgate-validacao.md`; `git grep 'commands/auditoria-supabase' origin/main` = 0 hits). **Mas o que o roteiro mandava produzir já está na main**: Fases 0 e A foram executadas e os entregáveis mergeados por PR #2844 (MERGED 2026-11-10T17:24Z, commit `f120344f9`): `auditoria-supabase/achados.json` (`_meta.sessao = "consolidacao-3-auditorias-rev2"`, fontes = sessão 31/10 + PR #2414 + PR #2186 + PR #2462, 48 entradas ZW-nnnn com `estado`), `auditoria-supabase/progresso.json` (chaves `fase_0_fechamento_20261108` e `fase_A_estado_secoes_20261108`, A.2–A.14 marcadas concluída/PARCIAL com motivo, `baseline_antes_20261101T2120Z` × `baseline_depois_20261108T2253Z`), `RELATORIO_AUDITORIA_SUPABASE.md:9-20` ("Consolidação 3 auditorias (ZW-nnnn)"). | ver acima |

### Por que OBSOLETA e não PERDIDA
1. **Fase 0 + Fase A**: o roteiro é um plano de uma sessão; o resultado do plano (mesa única ZW-nnnn, reverificação, baseline antes/depois, estado por seção A.x) está na main via #2844. A necessidade "uma auditoria viva em `auditoria-supabase/`" está atendida.
2. **Fase B (classes AUTÔNOMA/APROVAÇÃO, DDL só por workflow com aprovação humana, uma PR por correção, 6 checks, squash)**: regras já vigentes em `AGENTS.md` da main (linha 58 "Deixe aberta e chame o dono: DDL/migration em produção; CI/workflows, segredos…"; linha 71 "DDL só pelo fluxo de `banco.md`") e `docs/agentes/banco.md`, `docs/agentes/github-ci.md`. Não há bloco `fase_B` em `progresso.json` nem `correcoes.md` — mas o roteiro não "contém" essas correções, só as ordena; recuperar o arquivo não adiantaria nada da Fase B.
3. **Conteúdo datado/incorreto hoje**: as 8 PRs que o roteiro manda triar e usar como ponto de partida (#2462, #2414, #2186, #2265, #2481, #2277, #2245, #2491) estão todas CLOSED sem merge (GraphQL 2026-11-15); o "retrato de produção 2026-11-01" (211 tabelas, 520 policies, ledger 1.072) foi superado pelo baseline de 08/11 em `progresso.json` (210 tabelas, 553 policies, 1.092 migrations); a seção 3 regra 12 afirma que `CLAUDE.md §0` proíbe push/PR/merge por agente — a main hoje manda o oposto em `AGENTS.md` (fluxo Git com merge autônomo). Revisão Qodo na PR também apontou 2 pontos altos no roteiro (`db_describe_table` expõe linhas; R0/R1 em `_shared` redeploya edges R2).
4. Valor residual: doc de processo (baixo). O texto segue acessível no GitHub pelo diff da PR #2495 mesmo após apagar a branch.

## Lacunas a recuperar
Nenhuma. Se um dia quiserem um comando `/auditoria-supabase` reutilizável, deve ser reescrito a partir do estado atual (`auditoria-supabase/achados.json` + `AGENTS.md`), não portado deste arquivo.

## Banco
Sem migration/função SQL na branch — nenhuma consulta de produção necessária.

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** Apagar a branch é seguro. Tentei refutar por quatro vias e todas fecharam contra a refutação.

### 1. O diff é só o roteiro — nada de executável
`git diff 1252bb5a4 origin/claude/chore-cmd-auditoria-supabase-261101-1430 --stat` = `.claude/commands/auditoria-supabase.md | 261 +++`, 1 arquivo, 0 remoções. `git log 1252bb5a4..origin/<ref>` = 1 commit útil (`a47ecbb75`) + 4 merges de `main`. Sem migration, SQL, edge, src, workflow ou teste. Ausência na main confirmada: `git ls-tree origin/main .claude/commands/` = só `merge-prs.md`, `resgate-validacao.md`.

### 2. A substituição alegada existe e cobre a necessidade (abri os arquivos da main)
- `origin/main:auditoria-supabase/achados.json`: `_meta.sessao = "consolidacao-3-auditorias-rev2"`, `_meta.fontes` = sessão 31/10 (39 achados) + PR #2414 (47) + PR #2186 (68) + PR #2462 + 5 reverificações datadas (01/11 18:30Z, 19:05Z, 20:15Z, 21:20Z, 08/11 21:30Z); **48 entradas ZW-0001…ZW-0048**, cada uma com os campos exatos que a seção 6 do roteiro manda (`id`, `origem`, `secao`, `severidade`, `tipo`, `objeto`, `guarda`, `estado`, `evidencia`, `pr`, `impacto`, `classe`, `esforco`). Distribuição por seção: A.3=11, A.7=6, A.5=5, A.8=5, A.2=5, A.4=4, A.9=4, A.12=4, A.6=2, A.10=1, A.11=1. Mais as chaves `nao_verificado` e `triage_prs_abertas` — os entregáveis 0.2, 0.3 e 0.4.
- `origin/main:auditoria-supabase/progresso.json`: chave `fase_0_fechamento_20261108` com `baseline_antes_20261101T2120Z` (mig 1072, tab 211, pol 520, crons 24, secdef 402) × `baseline_depois_20261108T2253Z` (1092 / 210 / 553 / 27 / 407) + atribuição dos 24 arquivos de migration que explicam o diff (entregável 0.1 + item 6 da seção 10); e `fase_A_estado_secoes_20261108` com **A.2 a A.14 na numeração do próprio roteiro**, incluindo as duas que ele declara inéditas: `A.13_pendentes_parciais` ("PARCIAL — ZW-0032 VERIFICADO; ZW-0040 PARCIALMENTE VERIFICADO; ZW-0039 NÃO VERIFICADO") e `A.14_guardas` (matriz G1–G11 com PASS/NÃO VERIFICADO e motivo único: `DESTINO_URL` ausente em sessão cloud). Essa correspondência de numeração é prova de que o roteiro foi efetivamente executado e o resultado está mergeado.
- PR #2844: `state=MERGED`, `mergedAt=2026-11-10T17:24:00Z`, `mergeCommit=f120344f9b665d70129d07282f0d655ca4c14189` (GraphQL 2026-11-15).

### 3. Caça a hunk de valor ≥ médio não coberto — nada encontrado
Extraí os identificadores técnicos concretos do roteiro (os que seriam conhecimento perdido se o arquivo sumisse) e procurei nos três arquivos da main (`achados.json` + `RELATORIO_AUDITORIA_SUPABASE.md` + `progresso.json`). Ocorrências: `get_search_insights` 11, `log_search_event` 14, `security_invoker` 8, `get_channel_credentials` 4, `get_gmail_tokens` 3, `get_instance_token` 2, `get_voip_profile_credentials` 2, `trigger_talkx_engine_tick` 7, `searchbox_budget_alert_cron` 4, `_zapp_fn_before` 3, `mcp_exec` 25, `talkx_campaign_segments` 13, `null_statements` 9, `verify_jwt` 9, `message-delivery` 4, `audio-memes`/`custom-emojis` 4 cada, `email_threads` 5, `PITR` 7. Os únicos termos com 0 hits — `known-violations`, `replay-known-failures`, `pgmq`, `sicoob_service_role_key` — são referências de inventário, não achados: os dois primeiros são arquivos que existem na main (`git ls-tree origin/main scripts/db-audit/known-violations.json scripts/db-audit/replay-known-failures.json` = presentes), `pgmq` é registro de ausência e o nome do segredo não deveria estar em doc nenhum.
A única "técnica" exclusiva do roteiro (A.11: `BEGIN; SET LOCAL ROLE authenticated; set_config('request.jwt.claims',…)` com a hipótese "reteste, o MCP aceita multi-statement em 1 transação") foi testada e **refutada**, e a refutação está na main: `progresso.json → fase_A_estado_secoes_20261108.A.11_rls_matrix` = "não suportado pelo MCP customizado desta auditoria — `db_query` roda 1 transação por chamada sem persistir `SET LOCAL` entre chamadas". Recuperar o arquivo reintroduziria uma hipótese já descartada.

### 4. O texto é inoperante hoje (não só datado)
- Os 8 PRs que a seção 0 define como "ponto de partida obrigatório" e a 0.4 manda triar estão **todos CLOSED sem merge** (GraphQL 2026-11-15): #2462, #2414, #2186, #2265, #2481, #2277, #2245, #2491 — `mergedAt=null` em todos. A Fase 0 do roteiro não tem mais insumo.
- Regra 12 da seção 3 ancora a autoridade do fluxo Git em "`CLAUDE.md` §0 diz 'nenhum agente faz push/PR/merge'". Na main, `CLAUDE.md` tem **uma linha**: `@AGENTS.md`. Não existe §0 — a regra referencia um documento que não existe mais.
- O "retrato de produção em 2026-11-01" (211 tabelas, 520 policies, ledger 1.072, 24 crons) está superado pelo baseline de 08/11 na própria main (210 / 553 / 1.092 / 27).
- A Fase B (classes AUTÔNOMA/APROVAÇÃO) duplica regra vigente: `origin/main:AGENTS.md:57-59` ("Mergeie sem aprovação… **Deixe aberta e chame o dono**: DDL/migration em produção; CI/workflows, segredos…") e `:70-71` ("DDL só pelo fluxo de `banco.md` — arquivo → PR → merge → deploy do código → apply; nunca de branch aberta; ledger ao vivo é a verdade").

### 5. Custo de apagar
Zero perda recuperável. O texto segue acessível pelo diff da PR #2495 no GitHub (PR fechada, não apagada) mesmo depois de a branch ir embora. O que ficou PARCIAL/NÃO VERIFICADO na auditoria (A.11 matriz RLS em produção, G1/G6–G11 por falta de `DESTINO_URL`) é **trabalho de auditoria pendente**, não conteúdo desta branch — ela não traz evidência, SQL nem correção para nenhum desses itens. Não achei sinal de remoção proposital a investigar: o arquivo nunca entrou na main (`git grep 'commands/auditoria-supabase' origin/main` = 0 hits), logo não há `git log -S` para rastrear.

**Lacunas adicionais: nenhuma.** Mantenho `apagar_branch_seguro = true`.
