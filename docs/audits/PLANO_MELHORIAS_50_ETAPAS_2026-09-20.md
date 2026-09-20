# PLANO DE MELHORIAS E CORREÇÕES — 50 ETAPAS (2026-09-20)

> Sucessor do `PLANO_CORRECOES_50_ETAPAS_2026-09-16.md`. Aquele plano fechou a crise de
> paridade local↔GitHub↔banco; este consolida o que lá ficou aberto (80 checkboxes em 41
> seções) e adiciona o que as execuções de 17/09 revelaram. Herança é marcada como
> "(herda E{n}/16-09)". Toda afirmação de estado abaixo foi **verificada em 2026-09-20**,
> salvo indicação contrária.

## Estado-base verificado (2026-09-20)

| Eixo | Estado |
|---|---|
| `main` | `dd210916` = origin, tree limpa, **CI 100% verde** (CI/CD, DB Live Guard, DB Guard offline, CodeQL) desde 17/09 |
| Migrations | 443 arquivos = 443 no ledger, md5 idêntico (validado 17/09; gate contínuo no live-guard) |
| Bundle (pós PR #443) | initial-js **330,6 KB**/350 · largest 486/700 · total 3.954/4.200 KB gzip |
| Banco | `messages` 0,1% dead (autovacuum 19/09) · **3 FKs sem índice** · **244/503 índices com idx_scan=0** · 400 policies · 0 tabelas sem RLS · 38 trigger functions fora do catálogo |
| Edges | 67 diretórios em `supabase/functions/` · **10 com `verify_jwt=false`** (16/09 eram 9) · listagem live nunca reconciliada (CLI 403 em 16/09) |
| CI desperdício | `CRM Sync Worker` agendado dispara a cada ~8min e **sempre skipped** (`vars.CRM_SYNC_WORKER_ENABLED` ausente/false) |
| Qualidade | lint ratchet baseline **1115** · implicit-any 2 · TODO/FIXME 4 · console.log 1 |
| Governança | approvals=1 + owner único ⇒ **todo merge é bypass de admin** (`enforce_admins=false`); branches não são auto-deletados no merge |
| Higiene git | 22 branches locais · 2 remotos `claude/*` mergeados aguardando deleção (classificador negou à IA em 17/09) |
| Automação | Graph Sync Dispatcher N8N (`67dWSoWEPUGTX5mA`) sem cadência (erro 15/09); MCPs quebrados toda sessão: CLOUDFLARE-WORKERS (410), LALAMOVE ×2 (404), VS-CODE-VPS (404), PLAYWRIGHT (timeout); MCP N8N com tools stub (`search_workflows`, `execution_logs`) |

## Status da execução — rodada 2026-09-20 (mesma data do plano)

Evidências completas em `DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md`. Legenda:
✅ fechada com evidência · 🔧 implementada em PR aguardando merge · 📋 análise pronta,
ação deferida com justificativa · 👤 exige ação humana · ⏳ janela de observação.

| Fase | Status por etapa |
|---|---|
| F0 | E01 👤 · E02 🔧 · E03 📋(3 deletados) · E04 📋 · E05 🔧 · E06 ✅ |
| F1 | E07–E09 👤(3 cliques) · E10 🔧 · E11 ✅(já existia) · E12 ✅(by design) · E13 ✅ |
| F2 | E14 🔧 · E15 📋🔧⏳(meta recalibrada) · E16 ✅(0) · E17 📋 · E18 🔧⏳ · E19 ✅ · E20 ✅ · E21 👤 |
| F3 | E22 📋 · E23 ✅(0 resumos) · E24 📋 · E25 ✅ · E26 ✅(semântica esclarecida) |
| F4 | E27 ✅local/👤live · E28 ✅auditoria+plano · E29 ✅matriz/👤rotação · E30 ✅ · E31 🔧 · E32 ✅ |
| F5 | E33 🔧 · E34 📋 · E35–E37 📋 · E38 ✅/📋 |
| F6 | E39 🔧📋(meta recalibrada) · E40 ✅(já era 0) · E41 ✅baseline/📋 · E42 ✅(falso positivo) · E43 ✅(falso positivo) |
| F7 | E44 👤 · E45 👤 · E46 🔧 · E47 🔧 |
| F8 | E48 ✅rodada · E49 🔧 · E50 📋(critérios no dossiê) |

Correções de premissa aplicadas pela execução (o plano segue os fatos): E15 (maioria dos
"244 sem uso" é FK-support/feature vazia — dropar seria erro), E39 (dívida 99%
não-autofixável — redução por módulo, não em massa), E40/E42/E43 (já estavam zerados).

## Regras de execução (herdadas e obrigatórias)

1. **1 etapa = 1 PR** quando tocar o repo; branch `chore|fix|feat/e{NN}-slug`; merge ⇒ deletar branch no mesmo turno.
2. DDL segue a **ordem do CLAUDE.md §1.6** (arquivo → PR → merge → deploy → apply) e o ritual do `register-migration.mjs`; fechamento = guard exit 0 + paridade count+md5.
3. Índice: `CREATE INDEX` simples (CONCURRENTLY falha no gateway). Remoção de índice/constraint só com migration + evidência de `idx_scan=0` e idade das estatísticas.
4. Nada de novo guard sem conferir `db-guard.yml`/`db-live-guard.yml` (§1.9).
5. Cada etapa fecha com o comando de verificação listado saindo **verde** e o checkbox marcado **no mesmo PR** que a implementa.
6. 🔴 bloqueia release/segurança · 🟡 dívida com juros · 🟢 manutenção/documentação.

---

## F0 — Fechamento imediato de pendências (E01–E06)

### E01 🟢 Deletar os 2 remotos `claude/*` mergeados
Ação humana (o classificador de permissões nega à IA):
```sh
git push origin --delete claude/audit-database-references-m1xp3p claude/nice-pasteur-3h1emj
git fetch --prune && git branch -r | grep -c claude/   # esperado: 0
```
- [ ] 0 remotos `claude/*`

### E02 🟡 CRM Sync Worker: ligar de verdade ou desligar o cron (herda E42/16-09)
Hoje: run agendado a cada ~8min, 100% `skipped` — poluição de histórico e minutos de Actions.
Decidir: (a) setar `vars.CRM_SYNC_WORKER_ENABLED=true` se o CRM sync está pronto; ou
(b) comentar o `schedule:` do `crm-sync-worker.yml` até estar (mantendo `workflow_dispatch`).
```sh
gh run list --workflow=crm-sync-worker.yml -L 5   # esperado: nenhum "skipped" agendado
```
- [ ] Zero runs agendados em `skipped`
- [ ] Decisão registrada no corpo do PR

### E03 🟢 Triage dos 22 branches locais (herda E08–E10/16-09)
Classificar cada um: **mergear** (abrir PR), **publicar e congelar**, ou **deletar**. Os
`redesign/inbox-*` (5) e `fix/inbox-*` (3) são a maior massa — decidir o destino do redesign.
```sh
git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | sort
```
- [ ] ≤ 10 branches locais, todos com upstream vivo e propósito anotado na triage (corpo do PR/issue)

### E04 🟢 Podar remotos obsoletos (herda E11/16-09)
```sh
git branch -r --merged origin/main | grep -vE 'origin/(main|HEAD)'          # candidatos diretos
git for-each-ref --format='%(committerdate:short) %(refname:short)' refs/remotes | sort | head -30  # abandonados
```
- [ ] Remotos mergeados: 0 · abandonados >30d sem dono: deletados ou adotados
- [ ] Total de remotos ≤ 25

### E05 🟡 Sincronizar o plano de 16/09 com a realidade
80 checkboxes abertos lá, mas vários **já fecharam de fato** (E43 verificado em 17/09;
`messages`/vacuum ok; E46 parcial via PR #442). Marcar com evidência+data o que fechou;
o que este plano herda ganha nota "→ E{n}/20-09".
- [ ] Plano 16/09 sem checkbox aberto que já esteja resolvido
- [ ] Seções herdadas apontam para a etapa correspondente daqui

### E06 🟢 Graphify: estado oficial da automação
`graphify update .` local é a via canônica (CLAUDE.md via PR #442). Falta o destino do
dispatcher N8N — decidir aqui, executar na E45.
- [ ] Decisão escrita: consertar × aposentar o "Graph Sync — Dispatcher"

## F1 — Governança de CI/CD e merge (E07–E13)

### E07 🟡 Política de merge exequível (sem bypass perpétuo)
`approvals=1` com um único owner ⇒ ninguém pode aprovar ⇒ **todo merge desde #438 foi
bypass**. A proteção virou teatro. Opções: (a) `required_approving_review_count=0` mantendo
checks estritos + strict mode; (b) revisor-bot (CodeRabbit já roda) contando como review.
- [ ] Decisão aplicada na branch protection e registrada no CLAUDE.md §3
- [ ] Merge de um PR de teste SEM usar bypass

### E08 🟡 Ligar `enforce_admins` após E07
Com a política exequível, eliminar o caminho silencioso que deixou o Build vermelho
mergear por 2 dias (16–17/09).
```sh
gh api repos/adm01-debug/zapp-web-v2/branches/main/protection --jq '.enforce_admins.enabled'  # true
```
- [ ] `enforce_admins=true` e um merge de rotina passando pelo fluxo normal

### E09 🔴 Auto-delete de branch no merge
```sh
gh api repos/adm01-debug/zapp-web-v2 --jq '.delete_branch_on_merge'   # true
```
- [ ] Setting ligado (elimina a poda manual recorrente — causa raiz da sujeira de 16/09)

### E10 🟡 Gate automático de paridade tripla (herda E44/16-09)
`scripts/db-audit/check-triple-parity.mjs`: count+md5 arquivos↔ledger, guard exit 0,
diff `grants-baseline.json`, manifesto edge × diretórios. Rodar no live-guard agendado.
- [ ] Script + teste (`*.test.mjs`) verdes no CI
- [ ] Integrado ao `db-live-guard.yml` sem duplicar checagens existentes (§1.9)

### E11 🟡 Auditoria periódica de branches (herda E45/16-09)
Workflow semanal (cron) que abre/atualiza uma issue com: locais↔remotos divergentes,
mergeados não deletados, abandonados >30d.
- [ ] Primeira issue gerada automaticamente

### E12 🟢 Job "🛡️ Generate Audit Report" skipped em todo run
Está `skipping` em 100% dos runs observados (16–17/09). Reativar com a condição correta
ou remover o job morto do `ci.yml`.
- [ ] Job roda quando deveria ou não existe mais

### E13 🟢 Custo de Actions: crons e concurrency
Inventariar todos os `schedule:` (CRM worker, CodeQL, live-guard, etc.), consolidar
horários, garantir `concurrency` com cancelamento onde falta.
- [ ] Tabela de crons no PR · zero agendamento que sempre no-opa (pós E02)

## F2 — Banco: índices e integridade (E14–E21)

### E14 🔴 3 FKs sem índice no lado filho (herda E22/16-09)
```sql
SELECT c.conrelid::regclass, c.conname FROM pg_constraint c
WHERE c.contype='f' AND c.connamespace='public'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid
    AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey);
```
- [ ] 3 FKs nomeadas, custo medido (EXPLAIN nas queries reais que fazem o join/delete)
- [ ] Índices criados via migration (ritual §1.6) → query acima retorna 0

### E15 🔴 244/503 índices nunca usados (herda E23/16-09)
Antes de qualquer DROP: idade das estatísticas (`SELECT stats_reset FROM
pg_stat_database WHERE datname=current_database()`) precisa cobrir ≥ 30 dias de tráfego
real. Classificar os 244: recém-criados / cobertos por outro índice / suportam
constraint / realmente mortos.
- [ ] Planilha de classificação commitada em `docs/audits/`
- [ ] Remoção em lotes de ≤ 10 por migration, com 7 dias de observação entre lotes
- [ ] Meta desta rodada: ≤ 400 índices totais sem regressão em `db_slow_queries`

### E16 🔴 Índices duplicados exatos
```sh
# via MCP oficial: db_duplicate_indexes
```
- [ ] 0 duplicados exatos (drop do redundante com migration)

### E17 🔴 Integridade referencial não declarada (herda E34/16-09)
Colunas `*_id` em `public.*` sem FK correspondente: inventário, verificação de órfãos
por consulta, e criação de FKs `NOT VALID` → `VALIDATE CONSTRAINT` (não bloqueia).
- [ ] Inventário completo com decisão por coluna (FK criada × justificativa por escrito)
- [ ] 0 órfãos nas relações declaradas nesta rodada

### E18 🟡 Autovacuum por tabela quente (herda E30/16-09)
O incidente de `messages` (>75% dead em 16/09) se resolveu sozinho, mas tarde. Fixar
`autovacuum_vacuum_scale_factor=0.05` e `autovacuum_analyze_scale_factor=0.05` em
`messages`, `email_messages` e `talkx_*` de escrita intensa.
- [ ] `ALTER TABLE ... SET (...)` via migration · `pg_stat_user_tables` sem tabela >20% dead por 14 dias

### E19 🟡 Baseline de queries lentas (herda E29/16-09)
```sql
SELECT query, calls, round(total_exec_time) ms, round(mean_exec_time,1) media
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```
- [ ] Snapshot commitado em `docs/audits/slow-queries-2026-09.md`
- [ ] Top-3 com plano de ação (índice da E14/E15, reescrita, ou aceite)

### E20 🟢 Conexões e pooling (herda E32/16-09)
- [ ] Modo do pooler (transaction/session), limites e timeouts das edges documentados
- [ ] Nenhuma edge com conexão direta onde deveria usar pooler

### E21 🟢 Backup e PITR verificados (herda E33/16-09)
- [ ] Evidência de PITR habilitado + janela de retenção
- [ ] **Teste de restore real** (projeto temporário ou branch DB) documentado com data

## F3 — Banco: guard e catálogo (E22–E26)

### E22 🟡 38 trigger functions fora do catálogo (herda E27/16-09)
Eram 36 em 16/09 — cresceu sem decisão. Incluir `prokind='f'` retorno `trigger` no
`schema-catalog.json` (ou registrar exclusão explícita no guard, com teste).
- [ ] Catálogo/guard cobre ou exclui por escrito 100% das trigger functions
- [ ] `supabase-usage-guard.mjs` exit 0 após a mudança

### E23 🟢 Varredura anti-prosa no ledger (herda E18/16-09)
```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE EXISTS (SELECT 1 FROM unnest(statements) s WHERE s ~ '\.\.\.' OR s ~* '\(add |resumo');
```
- [ ] 0 statements-prosa fora das exceções `pinned-replay` do `migration-evidence.json`

### E24 🟢 Replay integral das 443 migrations em PG 17.6 efêmero (herda E20/16-09)
- [ ] Job (ou doc de execução local) com replay verde ponta a ponta
- [ ] Divergências (se houver) viram exceção documentada ou fix

### E25 🟢 Inventário das exceções pinned-replay (herda E15/16-09)
- [ ] Tabela em `docs/audits/`: versão, motivo, hash, data — 100% das exceções

### E26 🟢 Projeção forward-only: 2 relações pendentes (herda E17/16-09)
Guard reporta "projecao forward-only: 4 relacoes, 9 funcoes" — conferir se as 2 originais
fecharam ou viraram 4.
- [ ] Cada relação/função da projeção com dono e prazo, ou promovida ao catálogo

## F4 — Edges e secrets (E27–E32)

### E27 🔴 Reconciliação implantado × manifesto × diretórios (herda E37/16-09)
Nunca fechou: listagem live falhou com 403 em 16/09 e o formato do
`deployment-manifest.json` precisa de auditoria (contagem por jq divergiu dos 67 dirs).
```sh
supabase functions list --project-ref tnnnlkbymytvtqngbbqh   # exige access token válido
```
- [ ] Token de acesso corrigido; listagem live obtida
- [ ] Diff 3-vias (live × manifesto × diretórios) = vazio ou justificado por item
- [ ] Checagem entra no gate E10

### E28 🔴 10 edges com `verify_jwt=false` (herda E38/16-09 — eram 9)
Uma function entrou sem auditoria desde 16/09. Para cada uma: por que não exige JWT,
qual a proteção compensatória (assinatura, token de instância, rate limit), teste.
- [ ] Tabela de justificativa por function commitada
- [ ] As sem justificativa migram para `verify_jwt=true` ou ganham proteção equivalente

### E29 🔴 Auditoria de secrets das edges (herda E39/16-09)
- [ ] Inventário: secret → functions que usam → última rotação
- [ ] `EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE_TOKEN` e chaves de IA rotacionados se >90d
- [ ] 0 secrets órfãos definidos e não usados

### E30 🟡 Rate limiting nas edges expostas
`csp-report`, `talkx-link` (clique público), `evolution-webhook`, `elevenlabs-webhook`:
- [ ] Cobertura de rate-limit confirmada por teste (o `cleanup-rate-limit-logs` sugere base pronta)

### E31 🟢 Pinning de dependências Deno nas 67 functions
- [ ] `deno.land/std`/`esm.sh` com versões pinadas e uniformes (`_shared/` como fonte)

### E32 🟢 Contrato de segurança do `evolution-webhook`
- [ ] Verificação de origem (token/assinatura) testada e documentada em `docs/`

## F5 — Front: performance e bundle (E33–E38)

### E33 🟡 Ratchet dos budgets (travar o ganho do PR #443)
Folga atual: initial 330,6/350 · largest 486/700 · total 3.954/4.200.
```json
{ "initial-js": 340, "largest-chunk": 550, "total-assets": 4000 }
```
- [ ] `performance-budget.json` apertado + CI verde no mesmo PR

### E34 🟡 vendor-ui eager: 137,5 KB gzip (radix + framer-motion + cva)
Maior chunk inicial restante. Medir quanto o entry realmente usa; candidatos: adiar
`framer-motion` para rotas que animam; revisar barrels de `components/ui`.
- [ ] Análise de composição commitada (rolldown stats)
- [ ] Meta: initial-js ≤ 300 KB **ou** justificativa técnica por escrito do porquê não

### E35 🟢 Prefetch das rotas quentes
- [ ] `modulepreload`/prefetch para Inbox e Chat medido (sem regredir initial)

### E36 🟢 Web-vitals reais × alvos do budget
`performance-budget.json` tem seção `web-vitals` sem medição ligada.
- [ ] Vercel Analytics (já ativo) comparado aos alvos; alvos ajustados à realidade

### E37 🟢 srcSet CF Images fora do catálogo
- [ ] Avatares/anexos do Inbox usando variantes CF quando a URL for `imagedelivery.net`

### E38 🟢 React 19.3: varredura de deprecações
- [ ] Build/test sem warnings de API deprecada; hooks custom revisados para concurrent safety

## F6 — Qualidade de código e testes (E39–E43)

### E39 🔴 Dívida de lint: 1115 → plano de redução com ratchet decrescente
Hoje o ratchet só impede dívida **nova**. Reduzir o baseline por módulo (começar pelos
mais tocados: `talkx/`, `inbox/`, `catalog/`).
- [ ] Ratchet reduzido em ≥ 100 por PR temático, sem `eslint-disable` novo
- [ ] Meta da rodada: baseline ≤ 800

### E40 🟡 implicit-any: 2 → 0
- [ ] Baseline zerado e trava mantida

### E41 🟡 Mapa de cobertura de testes
- [ ] Contagem atual do vitest registrada como baseline
- [ ] 3 módulos críticos sem teste identificados (candidatos: `_shared/evolution-go-routes.ts`, hooks de envio, `external-db-proxy`) e cobertos com testes de contrato

### E42 🟢 TODO/FIXME (4) → 0
- [ ] Cada um resolvido ou promovido a issue com link no código

### E43 🟢 console.log em src (1) → 0
- [ ] Substituído pelo logger do projeto

## F7 — Infra, MCPs e automação (E44–E47)

### E44 🟡 Sanear MCPs quebrados (herda E40/16-09)
Falham toda sessão: CLOUDFLARE-WORKERS (410), LALAMOVE ×2 (404), VS-CODE-VPS (404),
PLAYWRIGHT (timeout). MCP N8N: `search_workflows` e `execution_logs` são stubs e
`list_workflows` ignora filtro (payload de 700KB+).
- [ ] Cada MCP: corrigido, ou removido da config, ou documentado como aposentado
- [ ] Sessão nova abre com 0 falhas de conexão de MCP

### E45 🟡 Destino do Graph Sync Dispatcher N8N (executa a decisão da E06)
- [ ] Consertado (execução verde + cadência real) **ou** desligado e removido do N8N
- [ ] CLAUDE.md reflete o estado final (hoje já não promete os 15min)

### E46 🟢 Blindagem contra banco errado (herda E41/16-09)
`database-identity.mjs` existe — garantir que **todo** script de `scripts/db-audit/` o
invoca antes de escrever.
- [ ] Grep prova a chamada em 100% dos scripts com escrita; teste cobre o abort

### E47 🟢 Padronizar nome do repo nas referências
GitHub é `Zapp_Web_V2`, CLAUDE.md diz `zapp-web-v2` (case-insensitive funciona, mas
confunde tooling e humanos).
- [ ] Referências uniformizadas no CLAUDE.md/docs (sem renomear o repo)

## F8 — Fechamento (E48–E50)

### E48 🟡 Re-auditoria tripla completa (herda E47+E48/16-09)
Com o gate E10 no ar: rodar auditoria completa (a mesma de 17/09) e comparar com o
Estado-base deste plano; paridade do ledger por dois caminhos (CI × `db_query`).
- [ ] Diff Estado-base → final commitado; nenhuma regressão

### E49 🟢 Atualizar CLAUDE.md e arquivar o plano de 16/09
- [ ] CLAUDE.md aponta para este plano como vigente; 16/09 marcado como encerrado
- [ ] Regra permanece: divergiu da infra real → corrige no mesmo commit

### E50 🟢 Relatório final e sign-off
- [ ] `docs/audits/FECHAMENTO_PLANO_50_ETAPAS_2026-09-20.md` com diff baseline→final,
      dívidas aceitas com dono e data, e os 50 checkboxes fechados ou com exceção escrita

---

## Ordem de ataque sugerida

1. **Semana 1:** F0 inteira (destrava higiene) + E07–E09 (governança para de sangrar) + E14/E16 (ganhos de banco baratos) + E33 (trava o bundle).
2. **Semana 2:** E27–E29 (🔴 de edges/secrets — maior risco real) + E15/E17 (índices/FKs, com janela de observação) + E10/E11 (gates).
3. **Semana 3:** F5 restante + F6 (qualidade) + E18–E21.
4. **Semana 4:** F3, F7, e F8 (fechamento e sign-off).

*Criado em 2026-09-20 a partir de auditoria ao vivo (git, GitHub API, banco oficial
`tnnnlkbymytvtqngbbqh` via MCP, workflows de CI). Execução segue as regras do CLAUDE.md.*
