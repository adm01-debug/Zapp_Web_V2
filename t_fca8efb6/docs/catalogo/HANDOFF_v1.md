# HANDOFF v1 — módulo Catálogo (ZAPP Web V2)

Consolidação do estado do módulo **Catálogo** para handoff. **Sem tag de
release** (`catalog-v1.0.0` **não** foi criada — ver §4). Este arquivo substitui
a leitura dispersa do plano + auditoria + changelog para quem pega o módulo
agora.

Fontes: leitura direta do repo, `gh pr list --state merged` (02/10/2026) e os
arquivos citados. Onde algo depende de sessão autenticada / sistema externo e
não pôde ser feito, está dito como **bloqueado** com o motivo — não como feito.

---

## 1. O que está ENTREGUE

### 1.1 Código e banco

- **Front do módulo** — `src/components/catalog/**` +
  `src/hooks/integrations/use*Catalog*`: catálogo (grade/lista com virtualização
  quando `pageSize >= 48`), detalhe (Sheet), envio (`SendProductDialog` com
  fotos + caption, templates, progresso real), favoritos, rail direito
  (banner, gráfico mensal, contagens), filtros avançados, busca ⌘K, atalhos de
  teclado, acessibilidade (axe) e modais em `lazy()`.
- **Fluxo único de envio** — chat e catálogo usam o mesmo `SendProductDialog`
  (CT-13..CT-17); a edge loga em `catalog_send_events`.
- **Edge `promogifts-catalog`** — 6 ações (`list_products`, `get_product`,
  `list_categories`, `list_suppliers`, `catalog_stats`, `bootstrap`), rate limit
  por ação (CT-19/CT-77), sem log de PII (CT-95).
- **Migrations do módulo** (Supabase Cloud `tnnnlkbymytvtqngbbqh`):
  `20260913013153_catalog_favorites.sql`, `20260913122557_catalog_send_events.sql`,
  `20260924123033_fix_catalog_send_events_insert_policy_anon_bypass.sql`,
  `20260925130000_add_to_authenticated_catalog_send_events_favorites.sql`,
  `20260929650000_catalog_grants_append_only.sql` (CT-01/CT-02),
  `20260930740000_catalogo_send_stats.sql` (CT-48). Segurança detalhada em
  `docs/catalogo/SECURITY.md`.

### 1.2 PRs mergeadas do escopo Catálogo

Confirmadas via `gh pr view`/`gh pr list --state merged` (estado **MERGED**):

| PR | merge | título |
|---|---|---|
| #1396 | 2026-10-01 | feat(catalogo): fecha 13 etapas parciais do plano com evidencia por etapa |
| #1409 | 2026-10-01 | fix(catalogo): oculta "Mais pedidos" no front e registra pendencias do PromoGifts |
| #1426 | 2026-10-01 | feat(catalogo): fecha bloco B/C — rate limit por acao, export CSV, rail, lista e detalhe |
| #1467 | 2026-10-01 | feat(catalogo): fecha bloco D — envio pelo contato, historico e view de envios |
| #1482 | 2026-10-01 | feat(catalogo): bloqueia envio de produto sem WhatsApp (painel, deep link) e registra CT-53 |
| #1490 | 2026-10-01 | feat(catalogo): atalhos de teclado, filtros em reducer e chip de flag no gerenciador |
| #1500 | 2026-10-02 | feat(catalogo): acessibilidade (axe), foco visivel, alt nome+cor e modais em lazy |
| #1534 | 2026-10-02 | feat(catalogo): ajuda do catalogo e testes reais do evento de envio (bloco I) |

O histórico completo (desde 12/09) está na tabela de 41 PRs em
`docs/catalogo/CHANGELOG_CATALOGO.md` (§"PRs do catálogo mergeadas desde
12/09/2026"). Não crio tag — a tabela acima é a referência de release.

---

## 2. O que está BLOQUEADO (e por quem)

| Item | Bloqueio | Depende de |
|---|---|---|
| **CT-10 / CT-11 / CT-18** — primeiro **envio real** pela UI em produção (1 produto, 2 fotos + caption; e a variante com falha induzida → `partial`); envio real pelo chat | `message-delivery` exige **sessão de usuário autenticado**; não há fixture de login no repo e o MCP da Evolution retornou **401** no ambiente de auditoria | **Joaquim** (executar o envio real) |
| **CT-49** — rail "Envios hoje / 7 dias" só aparece com ≥ 1 envio | Depende dos envios reais de CT-10/11/18 (com 0 linhas, a seção nasce oculta — comportamento previsto) | **Joaquim** (após CT-10) |
| **CT-50 / CT-56 / CT-82 / CT-88** — fechamentos de bloco E/F/I (smoke em produção + `e2e/catalog.spec.ts` verde nos 3 browsers) | Encadeiam no envio real e no login de teste; a `e2e` logada exige sessão autenticada e verificar que o usuário de teste enxerga a view | **Joaquim** (envio/sessão) |
| **CT-91 / CT-96 (parte de runtime)** — teste de RLS com **2 usuários reais** (agente × supervisor) | Exige **duas sessões autenticadas** simultâneas, indisponível neste ambiente | **Joaquim** (sessões) — pendência declarada em `docs/catalogo/SECURITY.md` §7 |
| **CT-93** — breadcrumbs `catalog.*` no Sentry + alerta `CATALOG_UPSTREAM_ERROR` > 5/min | Exige **Sentry externo** (criar alerta + evento de teste) | Sentry / **Joaquim** |
| **CT-94** — rate limit testado em produção (61 × `bootstrap` → 429) + UI do CT-59 reagindo | Exige **produção autenticada** + print | **Joaquim** |
| **CT-74** — Lighthouse perf ≥ 90 na view em 4G, CLS < 0,05 | Exige **página autenticada em Chrome real**; o harness atual mede o harness, não o app | **Joaquim** (relatório em `PERF.md`) |
| **CT-73** — payload de `list_products compact` < 30 KB/página | Exige **edge real** para medir | infra/Joaquim |
| **CT-69 (metade contraste)** — contraste dos badges ≥ 4,5:1 | **13 dos 24 pares medidos abaixo de 4,5:1** (ver `docs/catalogo/CONTRASTE.md`). Cor de badge é **decisão de produto** | **Joaquim** (produto) |
| **CT-92 (parcial herdado)** — o CT-92 está ✅, mas há JWTs literais versionados na **anon key** (pública por desenho) em `src/integrations/supabase/client.ts`, `.env.production`, `e2e/fixtures/*` e uma migration de cron — fora do escopo do módulo | Registrado, não bloqueia o catálogo | (informativo) |

---

## 3. Decisões pendentes

1. **Gate de cobertura do módulo.** Hoje `vitest.config.ts:17` limita
   `coverage.include` a `src/lib/**` + `src/services/**` — **o módulo não é
   medido pelo gate padrão** (`bun run test:coverage`). O CT-79 mediu **84,41 %
   de linhas** só com override de CLI
   (`--coverage.include='src/components/catalog/**'`). **Decisão:** incluir
   `src/components/catalog/**` no `coverage.include` e ligar um gate de 80 % no
   módulo (ou manter fora e confiar na medição manual). Não decidi sozinho.
2. **Cores dos badges.** Os badges Novo/Top/Promo usam
   `emerald-500`/`orange-500`/`rose-500` crus (fundo não acompanha o tema):
   pares de **2,54 / 2,80 / 3,67** — abaixo de 4,5:1 (e abaixo de 3:1 em
   WCAG 1.4.11). **Decisão:** trocar por tokens que sigam os 4 temas, ou aceitar
   o desvio documentado. Nenhuma cor foi alterada.

---

## 4. Release — o que **NÃO** foi feito (por instrução)

- **Tag `catalog-v1.0.0` NÃO foi criada** (proibido neste bloco; além disso o
  envio real — CT-10 — ainda não aconteceu, então "release v1" seria
  prematura). A referência de release é a tabela de PRs da §1.2.
- **`CLAUDE.md` NÃO foi tocado** (arquivo compartilhado e grande). Sugestão
  (apenas registrada, NÃO aplicada): acrescentar uma seção curta "Catálogo" com
  (a) bancos — ZAPP `tnnnlkbymytvtqngbbqh` + PromoGifts externo;
  (b) edge `promogifts-catalog` (6 ações, rate limit por ação);
  (c) fluxo único de envio (`SendProductDialog`);
  (d) a regra **"merge ≠ deploy da edge"** (o deploy da edge é por
  `deploy-functions.yml` a partir da `main`, não pelo merge do PR).
- **Branches `claude/feat-catalog-*`** — limpeza não executada (é operação de
  git, não deste bloco).

---

## 5. Comandos úteis

```console
# validador do plano (ver ressalva do CT-99 no plano de finalização, §10)
node scripts/catalog/validate-plan.mjs

# manifesto da edge — parte LOCAL (digest contra o remoto exige SUPABASE_ACCESS_TOKEN)
node scripts/edge-deploy/generate-manifest.mjs --check

# suíte do módulo (23 files / 426 tests em ~11,5 s)
bunx vitest run src/components/catalog

# cobertura do módulo (override de include por CLI — a config não mede o módulo)
bunx vitest run src/components/catalog --coverage --coverage.include='src/components/catalog/**'

# bundle
bun run build && node scripts/ci/bundle-budget.mjs
```

---

## 6. Documentos do módulo

- `PLANO_FINALIZACAO_CATALOGO_100.md` — plano vivo (CT-01..CT-100), estado por etapa.
- `PLANO_IMPLEMENTACAO_CATALOGO_100.md` — plano **SUPERSEDIDO** (11/09), só registro.
- `SECURITY.md` (este diretório) — RLS, grants, view, rate limit, secrets + pendência de RLS com 2 usuários.
- `PERF.md` — medições (CT-27/CT-75/CT-79/CT-80/CT-97).
- `CONTRASTE.md` — tabela de contraste dos badges (pendência).
- `CHANGELOG_CATALOGO.md` — histórico por PR.
- `ARQUITETURA.md`, `COMPONENTES.md`, `PARIDADE.md`, `ENVIO_E2E.md`, `AUDITORIA_CATALOGO_2026-09-29.md`.
