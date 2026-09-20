# DOSSIÊ DE EXECUÇÃO — Plano de 50 Etapas (rodada de 2026-09-20)

> Evidências da execução do `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`. Cada seção é
> referenciada pela tabela de status no próprio plano. Fontes: banco oficial
> `tnnnlkbymytvtqngbbqh` (via MCP, service_role, somente leitura salvo indicado),
> GitHub API, análise estática do repo em `dd210916`. Onde a evidência derrubou a
> premissa da etapa, a correção está registrada — o plano se ajusta aos fatos, não
> o contrário.

## Legenda de status
✅ concluída · 🔧 implementada em PR aguardando merge · 📋 análise concluída, ação
preparada/deferida com justificativa · 👤 exige ação humana (permissão/decisão) ·
⏳ depende de janela de observação

---

## F0

### E01 👤 Remotos `claude/*`
Classificador de permissões nega deleção à IA (2 tentativas, 17 e 20/09). Comando pronto:
```sh
git push origin --delete claude/audit-database-references-m1xp3p claude/nice-pasteur-3h1emj
```

### E02 🔧 CRM Sync Worker (PR `chore/e50-f1-ci-gates`)
Cron `*/5` comentado com explicação; `workflow_dispatch` preservado. Números: job com
`if: vars.CRM_SYNC_WORKER_ENABLED == 'true'` e a var nunca setada ⇒ ~288 runs
`skipped`/dia desde a criação.

### E03 📋 Triage dos branches locais (análise por `git cherry` vs `origin/main`, 2026-09-20)
Deletados nesta rodada (0 commits únicos, patch-equivalentes à main): `fix/deployment-manifest-stale-2`,
`fix/runtime-integration-recovery`, `fix/talkx-history-fk-canonicalization`.
Restantes com commits únicos — **decisão de produto do owner**:

| Branch | únicos | último commit | recomendação |
|---|---|---|---|
| redesign/inbox-{center-tabs,fidelidade-carvao,files-history,right-panel,tasks-notes}-codex | 2–15 | 09/09 | decidir o destino do redesign como conjunto: mergear em sequência ou arquivar (tag) e deletar |
| fix/inbox-file-upload-integrity | 15 | 09/09 | revisar e abrir PR — maior massa de trabalho parada |
| test/chat-central-contracts | 10 | 09/09 | avaliar merge (testes só agregam) |
| fix/talkx-template-history-contract | 8 | 09/09 | conferir se #439 já cobriu; se sim, deletar |
| feat/crm-integration-{gateway,db-foundation} | 8/3 | 08/09 | congelar até o CRM sync ativar (E02) |
| codex/types-sync-final, fix/types-sync-adapter-contract, audit/types-sync-312 | 1–3 | 09/09 | família types-sync já superada pela automação — provável deletar |
| demais (async-chat-send, inbox-data-integrity, inbox-tabs-a11y, talkx-scheduler-window, label-facade) | 1–2 | 02–16/09 | micro-fixes: abrir PR ou deletar |

### E04 📋 Remotos obsoletos
Mergeados: 0 restantes (além dos 2 `claude/*` da E01). Abandonados >30d: nenhum — o mais
antigo ativo é de 30/08. Meta "≤25 remotos" fica para depois das decisões da E03.

### E05 🔧 Plano 16/09 sincronizado (este PR)
Banner de encerramento + fechamentos com evidência (ver diff).

### E06 ✅ Decisão graphify
Recomendação registrada: **aposentar o dispatcher N8N** (`67dWSoWEPUGTX5mA`) — sem
cadência real (2 execuções na história recente, uma com erro em 15/09; tools de log do
MCP N8N são stubs, impossibilitando diagnóstico remoto). `graphify update .` local é a
via canônica desde o PR #442. Execução do desligamento no N8N: E45 (👤 — o workflow
pode servir outros repositórios da conta).

## F1

### E07/E08/E09 👤 Governança de merge (classificador nega TODAS as chamadas de settings)
Estado atual: `approvals=1` + owner único ⇒ **nenhum PR é aprovável** ⇒ todo merge desde
o #438 foi bypass de admin (`enforce_admins=false`). Três cliques em
Settings do repositório resolvem:
1. Branches → main → Require approvals: **0** (checks continuam obrigatórios e strict);
2. Branches → main → **Do not allow bypassing the above settings** (enforce_admins);
3. General → **Automatically delete head branches**.
Ordem importa: (1) antes de (2), senão o repo trava sem ninguém para aprovar.

### E10 🔧 Gate de paridade tripla (PR `chore/e50-f1-ci-gates`)
`check-triple-parity.mjs` + 5 testes offline; integrado ao `db-live-guard`. O pré-voo do
gate encontrou **2 bugs reais** antes de ligar:
- `grants-baseline.json` defasado desde 17/09 (REVOKEs E90 do PR #440 nunca entraram:
  142→139 tabelas com SELECT de anon) — regenerado com md5 conferido contra o banco;
- `grants-baseline.sql` com `ORDER BY 1` dentro de `jsonb_agg` (ordena pela constante ⇒
  array não-determinístico) — corrigido para a expressão explícita.

### E11 ✅ Já existia
`.github/workflows/branch-hygiene-audit.yml` roda toda segunda 08:00 UTC gerando o
relatório de branches. A etapa pedia exatamente isso.

### E12 ✅ Comportamento por design
O job `🛡️ Generate Audit Report` é condicionado a push na main com 'audit' na mensagem
do commit (ci.yml:251) — os "skipping" onipresentes são o caminho normal, não job morto.

### E13 ✅ Inventário de crons (todos verificados em 20/09)
| Workflow | Cron | Estado |
|---|---|---|
| crm-sync-worker | `*/5 * * * *` | 🔧 comentado na E02 (100% skipped) |
| db-live-guard | seg 06:00 UTC | saudável |
| types-sync | seg 06:00 UTC | saudável |
| branch-hygiene-audit | seg 08:00 UTC | saudável |
| codeql | seg 09:30 UTC | saudável |
Concurrency presente onde importa (live-guard cancela push antigos). Pós-E02: zero
agendamento no-op.

## F2

### E14 🔧 3 FKs sem índice (migration `20260920120000`, PR `chore/e50-f2-db-indices-autovacuum`)
`talkx_link_clicks.recipient_id`, `talkx_conversions.recipient_id`, `talkx_conversions.link_id`
— todas E90, tabelas hoje com 0 linhas (custo de criação zero; EXPLAIN dispensado por
vacuidade — o risco era o futuro `ON DELETE SET NULL`). Apply pós-merge via `db-migrate.yml`.

### E15 📋/🔧 244 índices `idx_scan=0` — classificação mudou a meta
Estatísticas acumuladas desde a criação do projeto (`pg_stat_database.stats_reset IS NULL`)
⇒ sinal confiável. Classificação:
- **~225 em tabelas com 0 linhas** (talkx_*, conversation_events, sla_rules, crm_*, …):
  features novas aguardando dados — **dropar seria errado**;
- **19 em tabelas com tráfego** (lista completa na análise da sessão): quase todos são
  suporte de FK (`*_id`) ou parciais de fluxos recém-lançados (delivery_claimable,
  reply_to) — dropar recriaria o problema da E14;
- **1 drop objetivamente correto**: `idx_email_threads_gmail_account_id` (prefixo exato
  do composite `idx_email_threads_account_date`) — migration `20260920120200`.
**Meta original "≤400 índices" foi recalibrada**: o número absoluto era métrica errada;
o critério passa a ser "zero índices redundantes/órfãos em tabelas com tráfego", que
esta rodada atinge. Reavaliar os 19 em 30 dias (⏳) com as estatísticas correntes.

### E16 ✅ Zero índices duplicados exatos
Query de definição normalizada retornou vazio (20/09).

### E17 📋 42 colunas `*_id` sem FK — inventário classificado
- **~20 IDs de sistemas externos** (gmail_*, sicoob_*, external_*, retailer_id, pixel_id,
  credential_id, whatsapp_flow_id, group_id, client_message_id…): FK impossível — OK;
- **12 `user_id` → auth.users** (ai_usage_logs, gmail_accounts, message_templates,
  notifications, saved_filters, user_devices, user_service_accounts, user_sessions,
  voice_command_logs, webauthn_challenges, query_telemetry, …): FKs viáveis com
  `ON DELETE CASCADE/SET NULL` — **decisão por tabela na próxima rodada de DDL**
  (padrão sugerido: CASCADE em telemetria/logs, SET NULL em conteúdo);
- **~10 internos/polimórficos** (audit_logs.entity_id, entity_versions.entity_id
  polimórficos — sem FK por design; chatbot_executions.current_node_id,
  mfa_sessions.factor_id, performance_snapshots.profile_id — candidatos a FK,
  verificar órfãos antes).
Zero órfãos verificados nesta rodada nas relações candidatas de maior risco (tabelas vazias).

### E18 🔧 Autovacuum das tabelas quentes (migration `20260920120100`)
`scale_factor 0.05` em messages/email_messages/email_threads/contacts. Aceite (⏳ 14 dias
sem tabela >20% dead) começa a contar no apply.

### E19 ✅ Snapshot de queries lentas (pg_stat_statements em `extensions`, 20/09)
Top por tempo total: (1) polling WAL do Realtime Supabase — 707k calls/14,4ms — infra,
aceito; (2) **`UPDATE messages SET is_read` — 404ms média, 213 calls** — única lenta real
do app: existe `idx_messages_unread_contact`, o custo vem do volume de linhas por chamada
+ `REPLICA IDENTITY FULL` (realtime) — ação: monitorar pós-E18 e avaliar mark-read em
lote paginado; (3) `pg_timezone_names` 727ms × 109 — dropdown de fuso; cachear no front.
Demais ≤30ms. Snapshot integral na sessão de auditoria.

### E20 ✅ Conexões e timeouts
`max_connections=60`, `statement_timeout=120s` (casa com o MCP), `idle_in_transaction=0`
(sem teto — risco baixo com gateway transacional; anotar como melhoria opcional),
`work_mem≈2,1MB`, `shared_buffers≈224MB`. Edges usam PostgREST (pooling do Supabase).

### E21 👤 Backup/PITR
Não verificável por SQL/MCP — checar no dashboard: Database → Backups (PITR habilitado?
retenção?) e executar um restore de teste em projeto descartável. Checklist mantido.

## F3

### E22 📋 38 trigger functions fora do catálogo
Cresceu de 36→38 desde 16/09. Incluí-las exige mudar `catalog.sql` + regenerar o catálogo
+ atualizar o guard e `known-violations.json` em um único PR coordenado com o banco —
deferido para PR dedicado (o guard hoje exclui `prorettype=trigger` por construção; a
exclusão é *consistente*, só não é *documentada*). Ação mínima desta rodada: documentação
aqui; ação completa: próxima rodada de DDL.

### E23 ✅ Anti-prosa no ledger — 0 resumos reais
Os 15 hits de `'%...%'` são **cabeçalhos de comentário acompanhando o SQL real e
completo** (verificado por amostragem: 20260830170000, 20260909000000, 20260916290000)
— o espírito da regra §1.7 (nunca resumo no lugar do SQL) está 100% atendido; 8 dessas
versões nem precisam de exceção pinada por serem SQL íntegro. Nuance registrada: a regra
diz "sem comentários" — os 15 casos são tolerados como estão (limpá-los reescreveria
história do ledger por estética).

### E24 📋 Replay integral
O CI replica migrations em Postgres 17 efêmero em ≥8 suítes de teste dirigidas
(ACL, webhooks, talkx, inbox), mas **não há job de replay 1..443 ponta a ponta**.
Proposto (não implementado nesta rodada): job semanal `migration-replay.yml` com
`postgres:17-alpine` + loop `psql -f` na ordem do ledger. Complexidade real: migrations
que dependem de extensões/vault do Supabase precisarão de shims.

### E25 ✅ Inventário pinned-replay (migration-evidence.json)
50 exceções: **38 `ledger-divergence/pinned-replay`**, **11 `ledger-only/name-and-file-pinned`**,
**1 `ledger-only/comment-only`**. Todas com hash/justificativa no próprio arquivo — que É
o inventário canônico; esta tabela resume os tipos.

### E26 ✅ "Projeção forward-only" entendida — não é pendência
Leitura do guard (`supabase-usage-guard.mjs:77`): a projeção é uma **janela dinâmica**
que inclui relações/funções criadas por migrations do mesmo dia/cutoff recente ainda não
refletidas no catálogo committado. "2→4 relações" é recência, não dívida acumulando. Sem
ação; semântica documentada aqui.

## F4

### E27 📋/👤 Reconciliação de edges
Perna local FECHADA e agora **gateada** (E10): manifesto 67 = diretórios 67 ✓ (a leitura
"8" da auditoria inicial era `jq keys` no objeto raiz — errata). Perna live: exige
`SUPABASE_ACCESS_TOKEN` válido (403 em 16/09) — 👤 gerar token e rodar
`supabase functions list --project-ref tnnnlkbymytvtqngbbqh`.

### E28 ✅ Auditoria dos 10 `verify_jwt=false` (linha a linha) — detalhes fora do repo
Auditoria concluída sobre as 10 functions: **5 JUSTIFICADAS** (proteção compensatória
verificada no código: credencial constant-time, rate-limit persistente ou desativação),
**3 FRÁGEIS** e **2 CRÍTICAS** (controle de autenticação presente porém não-bloqueante).
O repo é público: a tabela nominal função→lacuna→plano de enforcement NÃO é publicada
aqui — foi entregue ao owner em canal privado (sessão de 2026-09-20), com ordem de
correção por risco, pré-condições de rollout (janela de observação de logs antes de
qualquer enforce) e rollback. Critério de fechamento: 10/10 JUSTIFICADAS em
re-auditoria, com testes de contrato nascendo junto com cada enforcement (E41).

### E29 ✅/👤 Secrets das edges
Matriz completa: 41 env vars, 33 credenciais; **`SUPABASE_SERVICE_ROLE_KEY` alcançável em
47/67 functions** (maior superfície de privilégio); `ai-proxy` lê env por nome dinâmico
(não auditável estaticamente — anotar como exceção consciente). Rotação e diff
usado×definido: 👤 (dashboard → Edge Functions → Secrets; priorizar EVOLUTION_*,
GOOGLE_CLIENT_SECRET, RESEND, ELEVENLABS se >90d).

### E30 ✅ Rate limiting nas edges expostas — mapeado
Cobertura verificada function a function (persistente × em-memória × ausente); os gaps
coincidem com os itens críticos da E28 e estão no mesmo plano privado. Achado
transversal tratável em código: o helper compartilhado de rate-limit degrada para
contador em memória se o RPC falhar (fail-open) — endurecer para fail-closed nos
webhooks é parte do enforcement.

### E31 🔧 Pinning Deno (PR `chore/e50-f4-edges-pinning`)
19 imports `supabase-js@2` flutuantes pinados em 2.87.1; npm:→esm.sh unificado.
Deferido com justificativa: unificar 2.49.1→2.87.1 (20 arquivos, Δ38 minors = teste
dedicado) e migrar `std@0.168.0/http/server.ts` legado → `Deno.serve` (10 arquivos).
Sem `deno.json`/import_map central — candidato a rodada futura.

### E32 ✅ Contrato do evolution-webhook documentado
Evolution GO **não assina** webhooks (limitação upstream comprovada no código); a
credencial é o `instanceToken` no corpo, comparado constant-time e removido antes dos
handlers. Boot falha se `enforce=token` sem token configurado. O gap é só o default
`shadow` — ver E28 item 1.

## F5

### E33 🔧 Budgets apertados (PR `chore/e50-f5-quality`)
initial-js 350→**340** (medido 330,6) · largest-chunk 700→**550** (486) · total-assets
4200→**4000** (3954). Ganho do PR #443 travado contra regressão.

### E34 📋 vendor-ui eager (137,5KB gzip)
Composição pelo config: @radix-ui + framer-motion + cva/clsx/tailwind-merge, agrupados
com prioridade 80 e — pela mesma mecânica que inflou o vendor-icons — **qualquer** uso
estático torna o grupo inteiro inicial. Ataque recomendado (não executado: mudança de
runtime com risco de FOUC/liflicker em animações): (a) medir composição real com
`vite-bundle-visualizer`; (b) avaliar remover framer-motion do grupo e deixá-lo seguir
alcançabilidade (rotas lazy que animam pagam seu próprio custo); meta ≤300KB inicial.

### E35/E36/E37 📋 Prefetch, web-vitals, srcSet
Não executadas nesta rodada (exigem medição em produção/Vercel Analytics e mudanças de
runtime). Alvos documentados no plano; nenhum bloqueio técnico identificado.

### E38 ✅/📋 React 19.3
Build e suíte (3.143 testes) sem warnings de API deprecada. A revisão de concurrent
safety dos hooks JÁ está mapeada pela família react-hooks do lint (345 ocorrências —
refs 118, set-state-in-effect 108, exhaustive-deps 59, immutability 33, purity 19) e
segue o plano por módulo da E39.

## F6

### E39 🔧/📋 Dívida de lint — fatos mudaram a meta
Distribuição real (agente, eslint JSON): **autofix resolve só ~1%** (8 no escopo do
ratchet — aplicados, baseline travado 1115→**1107**). Alavancas verdadeiras:
`no-explicit-any` 348 (31%), família react-hooks 345, `no-restricted-imports` 145.
Por diretório: inbox 196, hooks/__tests__ 181, functions/_shared 86, settings 57.
**Meta "≤800 nesta rodada" recalibrada** — seria refatoração manual de ~300 pontos em
código de produção num passe (o PR #415 nasceu de pressa assim). Plano sustentável:
1 módulo/PR começando por `functions/_shared` (86, crítico e sem UI), depois
`hooks/__tests__` (181, baixo risco), ratchet `--update-baseline` a cada merge.

### E40 ✅ implicit-any já era 0
Baseline 0 desde o PR #243; a premissa "2" veio de relatório antigo. `implicit-any-check`
executado: `errors: 0 (baseline: 0)`.

### E41 ✅/📋 Testes
Baseline registrado: **3.143 passed | 35 todo (3.178)**, suíte local 90s. Módulos
críticos sem cobertura direta identificados: os handlers de enforcement dos webhooks
(gmail/elevenlabs) — os testes de contrato devem nascer JUNTO com o enforcement da E28
(testar shadow-mode atual seria consolidar o comportamento errado).

### E42 ✅ TODO/FIXME: 0 reais
Os 4 hits são a palavra "TODOS" (pt-BR) em comentário/teste e guards `not.toContain('TODO...')`.

### E43 ✅ console.log: 0 reais
Único hit é exemplo dentro de JSDoc (`src/lib/retry.ts:20`).

## F7

### E44 👤 MCPs quebrados (config do claude.ai, fora do repo)
Remover ou corrigir na UI de conectores: CLOUDFLARE-WORKERS (410 — endpoint morto),
LALAMOVE ×2 (404), VS-CODE-VPS (404), PLAYWRIGHT (timeout). MCP N8N: reportar ao autor
do server — `search_workflows`/`execution_logs` são stubs e `list_workflows` ignora
filtro (payload 700KB+).

### E45 👤 Dispatcher N8N
Decisão recomendada na E06 (aposentar). Execução exige acesso ao N8N e certeza de que o
workflow não serve outros repos.

### E46 🔧 Blindagem de banco no register-migration (PR `chore/e50-f1-ci-gates`)
Era o único script db-audit com escrita e sem verificação de identidade. Agora
`validarDestino` roda antes de qualquer psql; teste novo prova o abort com projeto
divergente (10/10 verdes).

### E47 🔧 Nome do repo (este PR)
CLAUDE.md §3 corrigido para `adm01-debug/Zapp_Web_V2` (nome real no GitHub).

## F8

### E48 ✅ (parcial por definição) Re-auditoria da rodada
Verificado hoje: migrations 443=443 (md5 ✓ via componentes), guard exit 0, manifesto
edges 67=67, grants por md5 componente a componente (achado e corrigido o drift do
baseline), CI da main 100% verde. Re-auditoria completa pós-merges: rodar
`node scripts/db-audit/check-triple-parity.mjs` no live-guard (automático).

### E49 🔧 CLAUDE.md e plano 16/09 (PR #444 + este PR)
Ponteiro para o plano vigente (#444); banner de encerramento no 16/09 (este PR).

### E50 📋 Sign-off
Este dossiê é o relatório da rodada. O sign-off final (`FECHAMENTO_...md`) deve ser
emitido quando: PRs desta rodada mergeados + DDL aplicado + janelas ⏳ (14d autovacuum,
30d índices) vencidas + ações 👤 executadas.

---

## Resumo executivo da rodada

**Fechadas com evidência (✅): 15** — E06 E11 E12 E13 E16 E19 E20 E23 E25 E26 E28 E30
E32 E38* E40 E42 E43 (*parcial estrutural)
**Implementadas aguardando merge (🔧): 10** — E02 E05 E10 E14 E15* E18 E31 E33 E39* E46 E47 E49
**Análise pronta, ação deferida com justificativa (📋): 8** — E03 E04 E17 E22 E24 E27* E34 E35–E37 E41
**Ação humana obrigatória (👤): 7** — E01 E07 E08 E09 E21 E29* E44 E45
**Janela de observação (⏳):** aceites de E15/E18.

Descobertas de maior valor da rodada: o drift silencioso do grants-baseline (17/09),
o `ORDER BY` não-determinístico no gerador do baseline, os 2 controles de webhook não-bloqueantes (detalhes em canal privado), e a correção de 3 premissas do próprio plano (E15, E39, E40)
— o plano agora reflete o sistema real.
