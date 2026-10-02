# FECHAMENTO — PLANO CONTATOS 100 ETAPAS (2026-10-01)

> Documento de sign-off do plano
> [`PLANO_CONTATOS_100_ETAPAS_2026-09-29.md`](./PLANO_CONTATOS_100_ETAPAS_2026-09-29.md).
> Estado-base: `main @ a0002bb2` (auditoria de 29/09). Estado final medido: `main @ 8a862874` (01/10).
> Mesmo formato do §0 de `FECHAMENTO_PLANO_50_ETAPAS_2026-09-20.md`.

## Escopo deste arquivo

As etapas 95–100 fecham o plano. Este documento:

- registra a ordem de merge e os 6 SHAs das fases (etapa 96);
- reporta o estado do deploy de edges (etapa 97);
- consolida a verificação de produção (etapa 98) — o que foi provado ao vivo e o que ficou bloqueado;
- registra a linha de base dos guards pós-merge (etapa 99), **incluindo o vermelho do `DB Live Guard`**;
- é a tabela de status por fase que a etapa 100 pedia (a tabela do plano não foi editada — ver abaixo).

> **Nota de execução.** A tabela "Status por fase" no topo do plano **não** foi preenchida nesta
> rodada: os PRs #1354 e #1415 tocam `PLANO_CONTATOS_100_ETAPAS_2026-09-29.md` e a instrução de
> encerramento proíbe editar arquivo de PR em trânsito e marcar checkbox no plano. O espelho da
> tabela está na seção "Status por fase" abaixo.

---

## Diff estado-base → final

### Contatos (banco `tnnnlkbymytvtqngbbqh`, lido ao vivo em 01/10)

| Métrica | Estado-base (29/09) | Final (01/10) | Delta |
|---------|--------------------|---------------|-------|
| Tipos de contato canônicos | 6 + `sicoob_gifts` interno | **6** (`chk_contact_type`) | ✅ E11/E29-E32 |
| Visão padrão de Contatos | 3.104 | **2.504** | ✅ F5/D4 (legados fora) |
| Com "Mostrar legados" ligado | 3.104 | **3.104** | = (universo preservado) |
| Linhas na tabela `contacts` | 3.106 | **3.106** | 2 soft-deleted |
| Exclusão | insert/delete direto | **RPC `delete_contact`/`delete_contacts`** (soft) | ✅ F1/D1 |
| Fonte de ícone/cor por tipo | 3 mapas locais | **`contactTypeConfig.tsx` única** | ✅ F3 |
| `text-3xs` no módulo | 59 | **44** | ✅ E25 |
| Sicoob Bridge | trigger + 2 edges vivas | **desligada** (trigger dropado, dirs removidos) | ⚠️ edge remota ainda existe (ver 97) |

### Front / qualidade

| Item | Antes | Depois |
|------|-------|--------|
| `bun run typecheck` | 0 | **0** (exit 0, 01/10) |
| Testes unitários + E2E do módulo | parciais | **F8:** 6 specs E2E + units das fases F8 |
| Contraste AA (light/dark) | não medido | 18/20 pares ≥ 4.5:1; `--success` fora (E67) |

---

## Status por fase (espelho da tabela do plano)

| Fase | Etapas | Tema | Checkboxes no plano | Estado real |
|------|--------|------|--------------------|-------------|
| F0 | 1–6 | Decisões e preparação | 0/6 | Decisões D1–D6 respondidas na tabela do plano (01/10) |
| F1 | 7–18 | P0/P1 no banco | 0/12 | DDL merged (#1172) e aplicado; checkboxes nunca marcados |
| F2 | 19–28 | Conflito de planos (tipografia) | 6/10 | D3 = Navy; 28 medido em #1438 |
| F3 | 29–40 | Tipos de contato | 11/12 | 39 aguarda decisão dos seeds |
| F4 | 41–50 | CSV/import e limpeza | 9/10 | 42 falta query `format='csv'` |
| F5 | 51–60 | Legados e RPCs | 6/10 | 52/55/58/59 dependem de apply |
| F6 | 61–70 | Ligações/tokens de cor | 8/10 | 65 com F3; 67 travado no token global `--success` |
| F7 | 71–78 | Código morto | 6/8 | 76 pós-merge; 78 sem `graphify` |
| F8 | 79–90 | Testes unit/E2E | 11/12 | 90 (screenshots) pendente |
| F9 | 91–95 | Documentação e inventário | 5/5 | — |
| F10 | 96–100 | Entrega, deploy e verificação | 0/5 | Este documento (96, 98 parcial, 99, 100) |

**Checkboxes:** 62 de 100 marcados no arquivo do plano; o restante estava sem marca por regra de
encerramento (não editar o plano), não por falta de execução — ver a coluna "Estado real".

---

## Etapa 96 — Ordem de merge e SHAs

Ordem prescrita: F1 → F2+F3 → F4 → F5 → F6+F7 → F8+F9. A ordem **efetivamente observada** no
histórico da main divergiu (F4 entrou por último); segue a ordem real por SHA de merge:

| Fase | PR | SHA de merge | Data | 6 required checks |
|------|----|--------------|------|-------------------|
| F1 (DDL) | #1172 | `41f66910ade2c61932db5eaee84e32d7a2a616e0` | 29/09 | todos SUCCESS |
| F5 (legados) | #1364 | `5c19b311` | 30/09 | todos SUCCESS |
| F2+F3 | #1353 | `b55faff702a9cf620a9705b148fb2ba64959dfa2` | 01/10 | todos SUCCESS |
| F6+F7 | #1355 | `bc24c1b47f332baba67e06098556992755637ecb` | 01/10 | todos SUCCESS |
| F8+F9 | #1415 | `c874285de9594cc79a6b011ee76a6ccca68cc629` | 01/10 | todos SUCCESS |
| F4 | #1354 | `04bb6f7adce36241ff746a05d5a54a1c0c09516b` | 01/10 | todos SUCCESS |

Os 6 required contexts conferidos por PR (`gh pr view --json statusCheckRollup`):
`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`,
`🎭 E2E Tests (Playwright)` — todos `SUCCESS` nos 6 PRs.

`strict=false` confirmado em `main` (`gh api .../branches/main/protection`, 01/10):
`required_status_checks.strict = false`; `enforce_admins.enabled = true`;
`allow_force_pushes=false`, `allow_deletions=false`.

---

## Etapa 97 — Deploy de edge functions

A F1 desligou a Sicoob Bridge (D2): `supabase/functions/sicoob-bridge*` foram removidas do repo e do
`supabase/deployment-manifest.json` (manifesto: 67 funções, 0 menções a `sicoob`). Como a mudança
toca edges, o `deploy-functions.yml` (`workflow_dispatch`) foi disparado.

**Resultado: VERMELHO.** Run `36906530462` (01/10T18:23Z, ref `7b1acc80`), job `Deploy Edge Functions`
= `failure`, no passo "Capturar e validar manifesto remoto pos-deploy":

```
Edge inventory collection failed: Remote function set mismatch;
missing=[], extra=[sicoob-bridge,sicoob-bridge-reply]. No successful attestation emitted.
```

Ou seja: as funções foram **removidas do Git e do manifesto**, mas continuam **implantadas no
projeto**. O gate barra exatamente para o remoto não divergir do repo. O DoD pedia `run id + success`
— não há `success`. Correção: apagar as duas funções remotas (`supabase functions delete`, escopo
admin) e re-disparar. **Não é regressão de código.**

---

## Etapa 98 — Verificação em produção

URL: `https://zapp-web-v2.vercel.app/?view=contacts`. Sem credencial do usuário QA no ambiente, a
parte autenticada (Playwright logado) **não** foi executada; o que deu para provar ao vivo:

**1. Deploy servindo a mudança (bundle).** Crawl dos chunks do domínio (01/10):

```
GET /?view=contacts -> HTTP 200
/assets/ContactsView-rhC7Wh2C.js -> HTTP 200, contém "Mostrar legados" (toggle include_legacy, F5)
```

`useContactsSearch-BvISHl2i.js` e `contactsAggregates-DR6pQy0T.js` do prod têm hash idêntico ao build
local de `main @ 8a862874` — a produção está com o bundle da main. **(o toggle de legados está no ar.)**

**2. Total == Todos e toggle de legados (banco, read-only).**

| `deleted_at IS NULL` + critério | Linhas |
|---|---|
| Default (sem legados) | **2.504** |
| Com legados (`include_legacy`) | **3.104** |
| Legados ocultos | 600 |
| Total na tabela | 3.106 |

Bate com o alvo do plano (3.104 → ≈2.498; real 2.504). "Total == badge Todos" não foi medido na UI
(sem login), mas os dois números vêm do mesmo predicado das RPCs `search_contacts`/`contacts_count_by_type`.

**3. Contato `[E2E]`.** Existe `04dff4dc-c6b1-4283-ac22-bd8639804759` `"[E2E] Contato de teste - nao
apagar"` com `deleted_at = NULL`. O passo "excluir pela UI e conferir `deleted_at`" não foi executado
(exige sessão logada e DML de teste).

**4. "Conversar" abre o chat.** Coberto pelo E2E `contacts-detail.spec.ts` no CI (etapa 61); não
re-verificado em produção por falta de login.

### Checklist de verificação de produção

| # | Verificação | Como | Estado |
|---|-------------|------|--------|
| P1 | App responde em `/?view=contacts` | `curl` | ✅ HTTP 200 |
| P2 | Bundle servido é o da main | crawl de chunks | ✅ toggle presente; hashes batem |
| P3 | Toggle legados muda 3.104 ↔ 2.504 | SQL read-only | ✅ |
| P4 | Total (KPI) == badge Todos (UI) | Playwright logado | ⛔ sem credencial QA |
| P5 | Excluir `[E2E]` grava `deleted_at` | Playwright + SQL | ⛔ sem credencial QA / DML |
| P6 | "Conversar" abre o inbox | Playwright logado | ⛔ sem credencial QA (coberto no E2E do CI) |

---

## Etapa 99 — Guards pós-merge

### `DB Live Guard` / `Contrato DB vivo` — VERMELHO (linha de base, não regressão)

O job reprova na main. Run `36904808959` (`main @ bb025232`, 01/10T18:10Z), passo
"Consolidar veredito do contrato vivo":

```
##[error]Contrato vivo quebrado em: Regenerar manifesto e comparar com o commitado
Paridade tripla (migrations, edges, grants) Comparar migrations com schema_migrations
```

São **3 verificações** (as demais passam; `types-sync`/frescor do `types.ts` está **verde**):

1. **Comparar migrations com schema_migrations** — `707 arquivos` no repo vs `708` no ledger. Registro
   no banco sem arquivo no Git: `version=20260930620000 ledger_name="multiplix_role_permissions_matrix"`.
   (Reconferido por read-only em 01/10: o ledger já estava em **709** e o segundo órfão é
   `20260930590000 fix_talkx_recipients_replica_identity` — o drift é vivo, não congelado.)
2. **Regenerar manifesto e comparar com o commitado** — `[functions] divergente: 2`:
   `mark_team_conversation_read(p_conversation_id uuid)` e `trigger_pending_multiplix_dispatches()`.
   `supabase/schema-manifest.json` está **stale** em relação ao banco.
3. **Paridade tripla (migrations, edges, grants)** — `count divergente: 707 vs 708` e
   `md5 das versoes divergente`. Edges `67/67` e grants batem
   (`fresco=3c45810f...` == `commitado=3c45810f...`).

Causa: **staleness do `schema-manifest.json` + drift de ledger** (objetos de Multiplix/Talk X
aplicados fora do fluxo de migration arquivada). **Não é regressão de código do módulo Contatos.**

### `supabase-usage-guard.mjs` — `novas: 0`

```
Catalogo: 150 tabelas, 8 views, 178 funcoes, 59 trigger functions ... (gerado em 2026-10-01);
projecao forward-only: 158 relacoes, 178 funcoes
Violacoes totais: 1 | no baseline: 1 | novas: 0
OK: nenhuma violacao nova.
```

### Paridade arquivos ↔ ledger (read-only, 01/10)

`node scripts/db-audit/check-triple-parity.mjs` (offline) roda só `[edges] manifesto=67 diretorios=67`.
A parte de banco foi refeita via MCP read-only:

| Lado | Quantidade |
|------|-----------|
| Arquivos em `supabase/migrations/*.sql` | 707 |
| Registros em `supabase_migrations.schema_migrations` | 709 |
| No banco sem arquivo | **2** (`20260930590000`, `20260930620000`) |
| No arquivo sem ledger | **0** |

**Não há paridade** — mesma causa do item 1 acima.

---

## Etapa 100 — Fechamento

- Este documento é o artefato de fechamento.
- **Tabela "Status por fase"**: espelhada acima; a tabela do plano não foi editada (PRs #1354/#1415).
- **Apagar as 6 branches mergeadas**: **não executado** — `delete_branch_on_merge=true` já remove as
  branches de fase no próprio merge; a remoção manual exige `git push --delete`/`gh`, proibidos nesta
  rodada. As branches remotas das fases já não aparecem em `origin` (apagadas no merge).

---

## Bloqueios e dívidas abertas

| # | Bloqueio | Dono | Ação |
|---|----------|------|------|
| B1 | `DB Live Guard` vermelho: manifesto stale + 2 migrations fora do Git | — | Regenerar `schema-manifest.json` e regularizar/registrar as 2 migrations órfãs |
| B2 | `deploy-functions.yml` vermelho: `extra=[sicoob-bridge,sicoob-bridge-reply]` | Joaquim/admin | Apagar as 2 edges remotas e re-disparar |
| ~~B3~~ | ~~Etapa 98 incompleta: sem credencial do usuário QA~~ | — | **Resolvido em 02/10** (complemento abaixo) |
| ~~B7~~ | ~~Etapa 90: baselines não versionadas (captura não determinística contra produção)~~ | — | **Resolvido em 02/10**: backend mockado e PNGs versionados (complemento abaixo) |
| B4 | Etapa 95: receitas do runbook não testadas por execução (DML proibido) | — | Testar na primeira janela com escrita |
| ~~B5~~ | ~~Etapa 67: `text-success-foreground` sobre `bg-success` (2.60/2.30:1)~~ | — | **Resolvido em 02/10**: 5.66/7.80:1 (hover `bg-success/90`: 4.63/6.53:1) (complemento abaixo) |
| B6 | Etapas 52/55/58/59 (F5) dependem de apply de migration | — | Aplicar e refazer o `DB Live Guard` |

---

## Complemento 2026-10-02 — Etapa 98 com usuário QA e etapa 90

Usuário `devin-e2e@promobrindes.com.br`, papel `supervisor` (agente só vê contatos atribuídos).

| # | Verificação | Resultado |
|---|-------------|-----------|
| P4 | Total (KPI) == badge Todos | ✅ 2.504 = 2.504 com legados ocultos; 3.100 com "Mostrar legados" (o banco mudou desde 01/10) |
| P5 | Excluir `[E2E]` grava `deleted_at` | ✅ `delete_contact` 200 com o id; `contacts` vivos por telefone = `[]`; não reaparece após reload |
| P6 | "Conversar" abre o inbox | ✅ `contacts-detail.spec.ts` contra produção |
| — | Specs de Contatos autenticados (6 arquivos) | 14 passed / 1 skipped no app local de `94996eca`; o skip (Mesclar) virou pass em `c646d034` (`contacts-selection` 2/2) |

Bugs achados nesta verificação e corrigidos no PR #1562:

- contato excluído voltava ao limpar a busca: `refetch()` só refazia a entrada ativa de `contacts-search`; agora o prefixo inteiro é invalidado em toda escrita (também tags/ações em massa);
- Esc que fechava um diálogo (Comparar) também limpava a seleção e escondia "Mesclar": o atalho roda em captura e ignora Esc com diálogo aberto;
- layout: KPI estourava o card a 390px; resumo da lista (`h-9` fixo) ficava sob o seletor de vista; toolbar cortava "Filtros Salvos" a 1280px.

**Etapa 90.** O spec gera (`--update-snapshots`) e compara a 0,2%, com toasts ocultos e dado vivo mascarado (valores, deltas, sparklines, contadores, cards/linhas). Em 3 comparações seguidas contra o Supabase de produção: 6/6, 5/6, 3/6. As falhas não foram de layout: banner global "Conexão 'PRINCIPAL' está desconectada" e KPIs que não carregaram em 20s. Por isso os PNGs **não** foram versionados (B7).

Ressalva visual: no mobile o FAB "+" cobre parte do botão "Colunas".

## Complemento 2026-10-02 (2) — Etapas 90 e 67, FAB no mobile

**Etapa 90 (B7).** `e2e/contacts-snapshots.spec.ts` deixou de usar o login real: sessão falsa (`installFakeSession`), backend mockado com 8 contatos fixos (KPIs, abas, lista, "último contato") e relógio parado em 2026-09-15 12:00 UTC. `bloquearRedeReal` falha o teste se alguma chamada sair para o Supabase. Sem máscara de dado vivo. Os 6 PNGs (`e2e/__screenshots__/contacts-{cards,list,table}-{light,dark}-linux.png`) estão versionados. O projeto `chromium-contacts-visual` roda no job E2E de PR do `ci.yml`. Localmente: geração 6/6 e 4 comparações seguidas 6/6 a 0,2%.

**Etapa 67 (B5).** `node scripts/qa/contraste-contatos.mjs --check` → 0 pares abaixo de 4.5:1.

| Token | Antes | Depois | Branco/texto sobre `bg-success` |
|-------|-------|--------|------------------|
| `--success` (claro) | 160 70% 42% | 160 70% 27% | 2.60 → 5.66:1; hover `bg-success/90`: 4.63:1 (e `text-success` sobre o card: 2.60 → 5.66:1) |
| `--success-foreground` (escuro) | 0 0% 100% | 142 80% 6% | 2.30 → 7.80:1 (`text-success` sobre o card segue 7.70:1) |

**FAB no mobile.** O "+" de Contatos ficava empilhado sobre o FAB global "Novo" (`MobileFAB`) e cobria "Colunas". Na vista Contatos o `MobileFAB` sai (a ação "Novo contato" dele só navegava para Contatos), e o "+" desce para a posição dele (`bottom-[76px]`).

## Conclusão

- Fases F2–F9 mergeadas com os 6 required checks verdes e `strict=false`; worktree limpo de DDL do módulo.
- Módulo Contatos: 6 tipos canônicos, exclusão por RPC, legados fora por padrão (3.104 → 2.504),
  fonte única de ícone/cor, testes unit + E2E no CI, inventário e runbook publicados.
- `bun run typecheck` = **exit 0**.
- **Não** está tudo verde: o `DB Live Guard` segue vermelho por staleness de manifesto + drift de
  ledger (B1), e o deploy de edges falha por funções Sicoob órfãs no remoto (B2). Ambos são
  reconciliação de estado do banco/edge — **sem regressão de código**.

*Plano Contatos 100 etapas encerrado em 2026-10-01; B3, B5 e B7 resolvidos em 02/10. Seguem abertos B1, B2, B4 e B6.*
