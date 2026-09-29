# PLANO — Catálogo: finalização da implantação (100 etapas, prefixo `CT-`)

**Data:** 2026-09-29 · **Status:** PLANEJADO — nada executado
**Origem:** `docs/catalogo/AUDITORIA_CATALOGO_2026-09-29.md` (41 DONE · 1 DESCARTADO · 38 PARCIAL · 20 AUSENTE sobre o
plano de 11/09) + leitura ao vivo dos bancos ZAPP e PromoGifts em 29/09.
**Sucede** `PLANO_IMPLEMENTACAO_CATALOGO_100.md` (não reabrir; fica como registro do escopo original e dos mocks).
**Base:** `main` @ `a4d8573`. **DB ZAPP:** `tnnnlkbymytvtqngbbqh`. **DB PromoGifts:** MCP `SUPABASE - GESTÃO DE PRODUTOS`
(só objetos aditivos read-only; nunca alterar `products`).

---

## 0. Verdades que toda etapa respeita (medidas em 29/09)

| Verdade | Prova | Regra derivada |
|---|---|---|
| **0 envios reais em 18 dias** (`catalog_send_events` = 0; `messages` sem `imagedelivery.net`) | SQL ZAPP | O primeiro marco do plano é um envio real verificado (CT-10). Nenhuma etapa de UX de envio fecha sem ele. |
| `anon` tem tudo e `authenticated` tem `TRUNCATE` em `catalog_favorites`/`catalog_send_events` | `role_table_grants` | CT-01 revoga antes de qualquer outra coisa. |
| PromoGifts sem sync desde 05/09; `order_count` = 0 em 100% | SQL PromoGifts | UI avisa (CT-30) e esconde ordenação morta (CT-22). |
| O chat envia produto por outro caminho (`ChatDialogs.tsx` → `onSendProduct`), sem log/rascunho | grep | Um único fluxo de envio (CT-14). |
| `MetaTile`, `SectionCard`, `ColorSwatch`, `.catalog-phone`, `.catalog-gallery-thumb` existem e ninguém usa | grep | Ligar antes de criar qualquer primitivo novo (CT-31–CT-36). |
| Fases 6 e 7 foram **encerradas com escopo reduzido por decisão do dono** (Sheet em vez de modal; sem layout 2 colunas) | notas no plano de 11/09 | Este plano **não** reabre o layout do mock B/C. Fecha só lacunas funcionais dentro do Sheet/Dialog atuais. |
| `use-toast` em `useSendProduct.ts`, `sonner` no resto | grep | Toasts do módulo: `sonner`. |
| Sem `node_modules` no container de auditoria; gates reais só na CI | — | Toda PR cita os gates da CI (typecheck-ratchet, lint-ratchet, usage-guard, vitest, build). |

### Regras de execução

1. Diff mínimo, carvão, zero número fabricado, `sonner`, pt-BR — herdadas do plano de 11/09.
2. Uma PR por bloco (§11); branch `claude/feat-catalog-<bloco>-<AAMMDD-HHMM>`; squash em `main`; front mergeia com CI verde.
3. DDL no ZAPP: arquivo em `supabase/migrations/` → PR → merge → apply por `db_query` + ledger na mesma transação
   (`scripts/db-audit/register-migration.mjs`) → `supabase-usage-guard.mjs` `novas: 0` → `types-sync`. Versão via
   `SELECT supabase_migrations.reserve_migration_version('catalog-ct','CT-##')`. PRs de DDL aguardam Joaquim.
4. Edge `promogifts-catalog`: mudança só entra em produção por `workflow_dispatch` do `deploy-functions.yml` +
   aprovação no environment `producao-edge-functions`. Merge ≠ deploy — a etapa só fecha com o deploy confirmado.
5. Cada etapa tem aceite verificável (query, teste, grep ou comportamento em produção). O plano de 11/09 é
   atualizado com os checkboxes das etapas equivalentes ao fechar cada bloco (CT-99).

---

## FASE 0 — Segurança e prova de vida do envio (CT-01–CT-12)
*Bloco A: 1 PR de DDL (CT-01–CT-03, aguarda Joaquim) + 1 PR de front (CT-04–CT-09) + teste real (CT-10–CT-12).*

- [ ] **CT-01** — `REVOKE ALL ON catalog_favorites, catalog_send_events FROM anon; REVOKE TRUNCATE, TRIGGER, REFERENCES ON
  … FROM authenticated`. **Aceite:** `role_table_grants` sem `anon` e sem os 3 privilégios para `authenticated`.
- [ ] **CT-02** — `catalog_send_events`: `REVOKE UPDATE, DELETE FROM authenticated` (log é append-only; policy hoje não
  cobre UPDATE/DELETE, mas o grant existe); `COMMENT ON TABLE` das 2 tabelas. **Aceite:** grants = `INSERT, SELECT`;
  `obj_description` não nulo.
- [ ] **CT-03** — PromoGifts: `REVOKE EXECUTE ON FUNCTION zapp_catalog_stats() FROM authenticated` (só service key,
  como o plano E24.2 pedia) — via `apply_migration` do MCP GESTÃO DE PRODUTOS. **Aceite:** `proacl` sem `authenticated`;
  edge continua respondendo `catalog_stats`.
- [ ] **CT-04** — `useSendProduct.ts`: caption na 1ª imagem (`content = mensagem`, `messageType: 'image'`), demais
  imagens sem caption, texto separado **só** quando não há foto. Confirmar que `sendOutboundMessage`/`message-delivery`
  propagam caption (coluna `messages.caption` existe — ler `message-delivery/index.ts` antes). **Aceite:** teste unitário
  com mock: 3 fotos → 3 mensagens (não 4); 0 fotos → 1 texto.
- [ ] **CT-05** — Throttle entre fotos: `await sleep(800 + Math.random()*700)` entre envios (humanização), fora do render;
  falha em 1 foto não aborta as demais (já é assim) — manter. **Aceite:** teste com timers falsos verifica o intervalo.
- [ ] **CT-06** — `useSendProduct.ts`: `use-toast` → `sonner`; toasts com 3 tons; sucesso com ação "Abrir conversa" →
  `?view=inbox&contact=<id>` (confirmar o param real lendo `ViewRouter.tsx`/inbox deep link antes; se o inbox usar
  `conversation=`, resolver a conversa pelo `contact_id`); falha com "Tentar de novo" reabrindo no passo de contato.
  **Aceite:** `grep use-toast src/components/catalog` vazio; clique no toast abre a conversa certa.
- [ ] **CT-07** — Pós-envio invalida `CATALOG_SEND_EVENTS_KEY` (rail "Enviados recentemente" atualiza sem reload).
  **Aceite:** teste do hook verifica `invalidateQueries`.
- [ ] **CT-08** — Checagem pré-envio: conexão WhatsApp ativa (`whatsapp_connections.status='connected'`, mesma query já
  usada no inbox) e contato não suprimido (`talkx_blacklist_active` / opt-out — confirmar a tabela real antes); bloqueio
  com `AlertCard` e botão desabilitado. **Aceite:** com conexão `disconnected` o botão "Enviar" fica desabilitado
  com explicação.
- [ ] **CT-09** — `Ctrl+Enter` envia no passo de contato; `Esc` volta. **Aceite:** teste RTL.
- [ ] **CT-10** — **Envio real** para número de teste da Promo Brindes, pela UI em produção, 1 produto com 2 fotos +
  Informal: verificar `messages` (2 linhas `image` com `media_url` `imagedelivery.net` + caption, `status` após 30 s),
  `catalog_send_events` (1 linha `sent` com 2 `message_ids`), WhatsApp real recebeu. **Aceite:** ids e horário
  registrados em `ENVIO_E2E.md` (seção "Primeiro envio real"); mensagens de teste marcadas `is_deleted`.
- [ ] **CT-11** — Repetir CT-10 com falha induzida (foto com URL inválida): resultado `partial`, toast âmbar, evento
  `partial`. **Aceite:** linha `partial` em `catalog_send_events`.
- [ ] **CT-12** — Fechamento A: apply CT-01–CT-03, `types-sync`, `db-live-guard` verde; PR de front mergeada; deploy
  Vercel confirmado; `ENVIO_E2E.md` atualizado. **Aceite:** 5 evidências commitadas.

## FASE 1 — Um único fluxo de envio (chat + catálogo) (CT-13–CT-18)
*Bloco B — 1 PR de front.*

- [x] **CT-13** — Ler `ChatDialogs.tsx`, `InputExtraTools.tsx`, `ChatInputToolbars.tsx` e o handler `onSendProduct` do
  inbox; registrar na §10 o que o chat faz hoje (mensagem única? sem fotos?). **Aceite:** texto na §10.
- [x] **CT-14** — `ExternalProductCatalog.tsx` passa a abrir `SendProductDialog` com `presetContact` = contato da conversa
  aberta (pula o passo D); `onSendProduct` do inbox é removido ou vira adaptador fino. **Aceite:** envio pelo chat
  grava `catalog_send_events` com `contact_id` da conversa; `grep onSendProduct src/components/inbox` vazio.
- [x] **CT-15** — `ExternalProductCatalog.tsx` reusa `CatalogProductCard` (grade/lista), `TalkXPagination`, estados de
  vazio/erro da tela principal; remove `ScrollArea` interno e `ExternalProductCard` legado se ficar sem consumidor.
  **Aceite:** `ExternalProductCard.tsx` apagado ou com 1 consumidor; `eslint-baseline.json` sem entrada do arquivo.
- [x] **CT-16** — Chip "Meus favoritos" no dialog do chat (`useCatalogFavorites`). **Aceite:** teste RTL.
- [x] **CT-17** — `SendProductDialog` em modo `presetContact` mostra o card-resumo do contato e permite trocar.
  **Aceite:** teste RTL.
- [ ] **CT-18** — Fechamento B: PR mergeada; envio real pelo chat (número de teste) registrado em `ENVIO_E2E.md`.
  **Aceite:** 1 linha em `catalog_send_events` originada do chat.

## FASE 2 — Pendências das Fases 2–5 (CT-19–CT-30)
*Bloco C — 1 PR de front + 1 mudança de edge (CT-19, CT-22) com deploy.*

- [ ] **CT-19** — Edge: rate limit 120/min só para `list_products` (60 para o resto), como E26.3 pedia; `deploy-functions`
  disparado e aprovado. **Aceite:** 61 chamadas de `bootstrap` em 1 min → 429; 100 de `list_products` → 200.
- [ ] **CT-20** — `catalogExport.ts`: CSV do filtro atual (reusa `esc()`/BOM de `talkxExport.ts`), paginação 100 em 100
  até 1.000, colunas do E29.3, nome `catalogo_<filtro>_<yyyymmdd>.csv`, `sonner` loading→success, aborta sem parcial.
  **Aceite:** teste do builder; arquivo abre no Excel com acentos.
- [ ] **CT-21** — Rail "Ações rápidas": "Exportar catálogo" (CT-20), "Gerenciar no PromoGifts" (link, `ExternalLink`);
  "Importar planilha" e "Gerenciar categorias" **só** se houver URL pública confirmada, senão não entram (regra do
  plano: nada morto). **Aceite:** grep `RailAction` em `CatalogRail.tsx` ≥ 2; nenhum `href="#"`.
- [ ] **CT-22** — "Ordenar por": ocultar "Mais pedidos" enquanto `order_count` = 0 em todos (flag vinda do
  `catalog_stats`: adicionar `has_order_data boolean` à RPC `zapp_catalog_stats()` — migration aditiva no PromoGifts —
  e à ação `catalog_stats`). **Aceite:** opção some em produção; volta sozinha quando houver dado.
- [ ] **CT-23** — Rail alertas: `AlertCard warning` "PromoGifts sem sincronizar há N dias" quando `last_sync_at` >
  3 dias (hoje 24), `AlertCard info` "N produtos com estoque baixo" (clicável → filtro), ocultáveis por sessão.
  **Aceite:** com os dados de hoje, o alerta de sync aparece.
- [ ] **CT-24** — `TipCard` com 5 dicas estáticas rotativas por dia (`getDate() % 5`, sem `Date.now()` no render — usar
  inicializador de estado). **Aceite:** teste com data fixa.
- [ ] **CT-25** — Card: `RowActionsMenu` (Ver detalhes, Enviar, Copiar SKU, Copiar link, Abrir no PromoGifts,
  Favoritar) no hover da grade e fixo na lista; teclado `Enter` abre, `e` envia. **Aceite:** teste RTL do menu e
  das teclas.
- [ ] **CT-26** — Lista: cabeçalho de colunas sticky (`.talkx-table`), linha 72 px, `role="row"`. **Aceite:** teste RTL.
- [ ] **CT-27** — Virtualização do modo lista com `@tanstack/react-virtual` quando `pageSize ≥ 48` (grade não).
  **Aceite:** teste "renderiza só as visíveis"; medição antes/depois registrada em `PERF.md`.
- [ ] **CT-28** — Bulk bar: "Exportar seleção" (CT-20 com ids), "Favoritar N", limite 10 por envio com mensagem clara.
  **Aceite:** selecionar 11 → aviso; exportar 3 → CSV com 3 linhas.
- [ ] **CT-29** — Paginação sem flash: cards antigos com `opacity-60` + barra fina de progresso durante `isFetching`;
  prefetch da próxima página no hover de "Próxima". **Aceite:** teste: `isFetching` não mostra skeleton.
- [ ] **CT-30** — Responsivo: rail vira `Accordion` "Resumo do catálogo" acima da grade em `< xl`; detalhe/envio viram
  `Drawer` (vaul) em `< md`; prints 1280/1024/768/390 em `docs/catalogo/PARIDADE.md` (criado aqui, seção "Rail").
  **Aceite:** 4 prints commitados; Accordion e Drawer testados.

## FASE 3 — Ligar os órfãos da F1 no detalhe e no envio (CT-31–CT-40)
*Bloco D — 1 PR de front. Não reabre o layout do mock B/C (decisão de 24/09).*

- [ ] **CT-31** — `ProductDetailDialog.tsx`: Qtd. mínima / Prazo / Origem via `MetaTile` (grade 3 colunas).
  **Aceite:** `grep MetaTile ProductDetailDialog.tsx` ≥ 1; teste RTL.
- [ ] **CT-32** — Descrição e Ficha técnica via `SectionCard`; ficha inclui material, capacidade, gravação
  (`engraving_type/description`), embalagem (`has_gift_box`) — campos já no payload da E21. **Aceite:** produto
  `PO-13153` mostra LASER na ficha.
- [ ] **CT-33** — Cores via `ColorSwatch` (hex de `color_swatches`) com estoque por cor (soma de `variants` por cor) e
  clique que rola a galeria para a 1ª imagem da cor. **Aceite:** teste RTL com 2 cores.
- [ ] **CT-34** — Variantes agrupadas por cor (reusa `groupVariantsByColor`), seleção que troca o CTA para "Enviar
  variação"; miniaturas com `.catalog-gallery-thumb(--active)`. **Aceite:** classe com consumidor; teste RTL.
- [ ] **CT-35** — Pills de tags/categoria no topo do detalhe (`full_path_readable` + `tags`). **Aceite:** teste RTL.
- [ ] **CT-36** — Navegação ‹ › entre produtos do resultado atual dentro do Sheet, com `history.replaceState` do
  `product=`. **Aceite:** teste RTL; deep link continua funcionando.
- [ ] **CT-37** — `SendProductDialog.tsx`: preview WhatsApp em `PhonePreview` (`catalogShared.tsx`) usando `.catalog-phone`;
  remover `#075E54/#dcf8c6/#e5ddd5/bg-white/text-white` — a bolha verde do WhatsApp vira token local documentado
  (`--wa-bubble`) em `tokens.css`. **Aceite:** `grep -c "#[0-9a-fA-F]\{6\}" SendProductDialog.tsx` = 0.
- [ ] **CT-38** — Cards de variação com foto/cor/estoque (modo "Variação específica") e card de info do produto no
  modo completo. **Aceite:** teste RTL.
- [ ] **CT-39** — "Adicionar fotos" (das `variants.images` não selecionadas) e "Baixar" (zip das fotos selecionadas
  via `fetch` + `JSZip` se já existir no bundle; senão download individual). **Aceite:** teste RTL do picker.
- [ ] **CT-40** — Fechamento D: PR mergeada; `PARIDADE.md` seções "Detalhes" e "Enviar" (prints antes/depois); zerar
  `text-white`/`violet-500` restantes por tokens (`text-primary-foreground`, `--badge-new`). **Aceite:** grep de cores
  literais no módulo = 0 (exceção documentada: `bg-white` da mídia).

## FASE 4 — Passo "Selecionar contato" completo (CT-41–CT-50)
*Bloco E — 1 PR de front + 1 migration (CT-48).*

- [ ] **CT-41** — `ContactSelectionStep.tsx`: 2 colunas `md:grid-cols-[1fr_300px]`, header `IconTile Users`, card-resumo
  do produto (thumb 96, nome, modelo, "N foto(s)"). **Aceite:** teste RTL.
- [ ] **CT-42** — Lista: `InitialsAvatar` 40 com `avatar_url`, telefone formatado, radio; seção "Enviados recentemente"
  (contatos de `catalog_send_events`) acima dos 15 recentes. **Aceite:** teste RTL com 3 contatos.
- [ ] **CT-43** — Busca: normalização de telefone (só dígitos) no `ilike`, mínimo 2 chars, debounce 300 ms; vazio com
  link "Criar contato" (`?view=contacts&new=1` — confirmar param antes). **Aceite:** busca "9999" acha `+55 (41) 9 9999`.
- [ ] **CT-44** — Rail "Resumo do envio" (`RailCard`) com 4 linhas + check e `AlertCard` "Pronto para enviar!" só com
  contato; `aria-live="polite"`. **Aceite:** teste RTL sem/com contato.
- [ ] **CT-45** — Personalização `{{nome}}`/`{{empresa}}` reusando `personalizePreview`/`extractVariables` do
  `talkxShared`; templates ganham "Olá, {{nome}}!" com fallback "Olá!"; preview atualiza ao selecionar contato.
  **Aceite:** teste de `buildMessage` com e sem nome.
- [ ] **CT-46** — Botão "Enviar agora" com progresso real "Enviando 2/4…" (contador de mensagens). **Aceite:** teste RTL.
- [ ] **CT-47** — Envio multi-produto (bulk) passa pelo mesmo passo de contato e pelo resumo ("N produtos");
  `CatalogBulkSendDialog` vira modo de `SendProductDialog` ou reusa `ContactSelectionStep`. **Aceite:** 1 componente de
  contato no módulo.
- [ ] **CT-48** — View `catalog_send_stats` (ZAPP): envios por dia (30 d), por agente, por produto, taxa parcial/falha;
  `security_invoker = on`; catalogada (`schema-catalog.json`, `types-sync`). **Aceite:** view no ledger; `db-guard` verde.
- [ ] **CT-49** — Rail "Envios hoje / 7 dias" a partir da view, só se ≥ 1. **Aceite:** com os envios de CT-10/11/18
  aparece.
- [ ] **CT-50** — Fechamento E: PR mergeada; envio real ponta a ponta (catálogo → detalhe → enviar → contato → recebido)
  registrado em `ENVIO_E2E.md`; `PARIDADE.md` seção "Contato". **Aceite:** evidências commitadas.

## FASE 5 — Envio pelo contato e CRM 360 (CT-51–CT-56)
*Bloco F — 1 PR de front.*

- [ ] **CT-51** — Localizar o header do contato (`src/components/contacts/**` ou `crm360/**`) e o ponto de extensão;
  registrar na §10. **Aceite:** texto na §10.
- [ ] **CT-52** — Botão "Enviar produto" no header do contato → `ExternalProductCatalog` com `presetContact` (CT-14).
  **Aceite:** evento em `catalog_send_events` com `contact_id` do perfil.
- [ ] **CT-53** — Mesmo botão no CRM 360 (se a tela existir; senão registrar). **Aceite:** idem ou nota.
- [ ] **CT-54** — Histórico "Produtos enviados" no perfil do contato (lista de `catalog_send_events` por `contact_id`,
  RLS já cobre). **Aceite:** teste RTL com mock.
- [ ] **CT-55** — Deep link `?view=catalog&product=<id>&send=1&contact=<id>` pré-seleciona contato. **Aceite:** teste.
- [ ] **CT-56** — Fechamento F: PR mergeada; smoke em produção. **Aceite:** CI verde.

## FASE 6 — Abas, tela principal e estados (CT-57–CT-66)
*Bloco G — 1 PR de front.*

- [ ] **CT-57** — Aba "Enviados": `TalkXTable` sobre `catalog_send_events` (produto, contato, agente, modelo, fotos,
  status, data) + filtros + export CSV (CT-20); contagem nas 3 abas; deep link `?tab=`. **Aceite:** teste RTL; URL
  reflete a aba.
- [ ] **CT-58** — Abas com `DashboardTabs` (reuso) em vez de `Tabs` cru, se o componente aceitar 3 itens sem mudança;
  senão manter e registrar. **Aceite:** decisão na §10.
- [ ] **CT-59** — Estados de erro por código da edge: `CATALOG_UPSTREAM_ERROR` → `TalkXDataUnavailableState`
  ("Catálogo PromoGifts indisponível" + Tentar de novo); `CATALOG_NOT_CONFIGURED`/`CREDENTIALS_INVALID` → estado
  para admin com o código; 429 → toast "Muitas requisições, aguarde 1 min" + botões desabilitados 10 s. **Aceite:**
  teste por `error.code` (4 casos).
- [ ] **CT-60** — Barra de filtros: select de categoria em árvore (raiz semibold, filhos indentados) com contagem;
  select de fornecedor com contagem (sem logo — 0 fornecedores têm `logo_url`, achado E25). **Aceite:** teste RTL.
- [ ] **CT-61** — Atalhos: `/` foca a busca, `Esc` limpa, `⌘F` foca. **Aceite:** teste RTL.
- [ ] **CT-62** — `ExternalProductManagement.tsx`: filtros em `useReducer` único (a reescrita adiada na E06), zerar os
  4 `eslint-disable` e os `useEffect` de sincronização. **Aceite:** `grep -c eslint-disable` = 0 no arquivo;
  lint-ratchet `novas: 0`.
- [ ] **CT-63** — `Date.now()` fora do render (`ExternalProductManagement.tsx:54`, `SendProductDialog.tsx:147`) —
  inicializador de estado ou `useMemo` com `key`. **Aceite:** `grep "Date.now\|Math.random" src/components/catalog
  --include=*.tsx` (fora de testes) = 0.
- [ ] **CT-64** — Filtro "Novidades" = `is_new OR created_at > now()-30d` (`new_or_recent` na edge) — deploy.
  **Aceite:** contagem bate com `new_30d` do stats.
- [ ] **CT-65** — Chip de estado acima da grade quando filtro de flag ativo ("Mostrando só Novidades · limpar").
  **Aceite:** teste RTL.
- [ ] **CT-66** — Fechamento G: PR mergeada; `PARIDADE.md` seção "Topo" e "Grade" com prints 1920/1440/1280.
  **Aceite:** prints commitados.

## FASE 7 — Acessibilidade e performance (CT-67–CT-76)
*Bloco H — 1 PR de front.*

- [ ] **CT-67** — `jest-axe` no vitest para `CatalogProductCard`, `CatalogAdvancedFilters`, `ProductDetailDialog`,
  `SendProductDialog`, `ContactSelectionStep`: 0 violações sérias. **Aceite:** 5 testes verdes.
- [ ] **CT-68** — `aria-live` para contagem de resultados e progresso de envio; foco visível (`--ring`) em cards,
  chips, thumbs, radios; `Esc` fecha e o foco volta ao gatilho. **Aceite:** teste RTL de foco.
- [ ] **CT-69** — `alt` descritivo (nome + cor) em todas as imagens; contraste dos badges ≥ 4,5:1 nos 3 temas (tabela
  em `docs/catalogo/CONTRASTE.md`). **Aceite:** tabela commitada.
- [ ] **CT-70** — `useReducedMotion` em todo componente animado do módulo (grep `motion.` × `useReducedMotion`).
  **Aceite:** cada arquivo com `framer-motion` importa `useReducedMotion`.
- [ ] **CT-71** — Modais `React.lazy` (`ProductDetailDialog`, `SendProductDialog`, `CatalogAdvancedFilters`,
  `CatalogBulkSendDialog`); `recharts` só no rail (lazy). **Aceite:** `vite build` mostra chunks separados.
- [ ] **CT-72** — `sizes` por breakpoint no `ProductThumb`, `fetchpriority="high"` nas 4 primeiras capas,
  `content-visibility: auto` nos cards abaixo da dobra. **Aceite:** Lighthouse LCP < 2,5 s (4G simulado).
- [ ] **CT-73** — Payload de `list_products compact` medido (< 30 KB por página de 24) — se passar, cortar campos.
  **Aceite:** medição em `PERF.md`.
- [ ] **CT-74** — Lighthouse perf ≥ 90 na view em 4G; CLS < 0,05. **Aceite:** relatório em `PERF.md`.
- [ ] **CT-75** — Bundle: `vite build --report`; inicial ≤ 336 KB (não regredir o #443). **Aceite:** número em `PERF.md`.
- [ ] **CT-76** — Fechamento H: PR mergeada; `PERF.md` e `CONTRASTE.md` commitados. **Aceite:** CI verde.

## FASE 8 — Testes, e2e e ajuda (CT-77–CT-88)
*Bloco I — 2 PRs.*

- [ ] **CT-77** — Testes Deno da edge para as 6 ações + `new_or_recent` + rate limit 120/60, com mock do `extClient`;
  incluídos na lista fixa do CI (`deno test`). **Aceite:** job roda `promogifts-catalog/index.test.ts`.
- [ ] **CT-78** — Teste dedicado da lógica de `status` (`sent/partial/failed`) e de `logCatalogSendEvent` (pendência
  admitida na E28). **Aceite:** 3 casos verdes.
- [ ] **CT-79** — Cobertura do módulo ≥ 80 % linhas (`vitest --coverage src/components/catalog`); registrar.
  **Aceite:** número em `PERF.md`.
- [ ] **CT-80** — Suíte do módulo em < 30 s. **Aceite:** tempo registrado.
- [ ] **CT-81** — Fixtures E2E: contato de teste já existe (`04dff4dc-…`, "[E2E] Contato de teste"); produto de teste
  fixo (`PO-13153`); `e2e/fixtures/catalog.ts`. **Aceite:** ids no fixture.
- [ ] **CT-82** — `e2e/catalog.spec.ts`: login → `?view=catalog` → busca → card → detalhes → cor → Enviar → fotos →
  Informal → contato E2E → Enviar agora → toast; asserts em `messages`/`catalog_send_events` via API; limpeza
  (`is_deleted`). Habilitado no `e2e-logado.yml`; verificar antes que o usuário de teste enxerga a view. **Aceite:**
  verde nos 3 browsers.
- [ ] **CT-83** — `CatalogHelpSheet.tsx`: "Como usar o catálogo" (5 passos com prints reais) + tour de 4 dicas
  (`localStorage catalog.tourDone`). **Aceite:** teste RTL; só na 1ª visita.
- [ ] **CT-84** — Link "Ajuda" no header do módulo e no dialog do chat. **Aceite:** teste RTL.
- [ ] **CT-85** — Textos revisados (acentuação, "Qtd. mínima", "dias úteis") — lista em `PARIDADE.md`. **Aceite:** lista.
- [ ] **CT-86** — `CHANGELOG_CATALOGO.md` completado com F6/F7 e correções (#577–#714) e com este plano por bloco.
  **Aceite:** toda PR de `catalog` desde 12/09 citada.
- [ ] **CT-87** — `README.md` do módulo: remover a referência a `PARIDADE.md` até ela existir (CT-30 cria), apontar
  para este plano e para a auditoria. **Aceite:** nenhum link quebrado.
- [ ] **CT-88** — Fechamento I: 2 PRs mergeadas. **Aceite:** CI verde; e2e verde.

## FASE 9 — Paridade, hardening e release (CT-89–CT-100)

- [ ] **CT-89** — `PARIDADE.md` final: tabela por tela (A/B/C/D) mock → implementado → diferença deliberada (carvão,
  Sheet em vez de modal, links externos, placeholders removidos, "Novo Produto" omitido). **Aceite:** 4 telas.
- [ ] **CT-90** — Lista dos itens do mock **não** implementados com motivo (layout 2 colunas B/C, "SUA MARCA AQUI",
  Importar planilha se sem URL, Sincronizar). **Aceite:** seção no `PARIDADE.md`.
- [ ] **CT-91** — RLS testada com 2 usuários reais (agente vê só os próprios envios; supervisor vê todos; favoritos
  isolados). **Aceite:** resultado em `SECURITY.md`.
- [ ] **CT-92** — Service key do PromoGifts só em Edge secrets: grep no repo e no bundle de produção. **Aceite:** 0 hits.
- [ ] **CT-93** — Sentry: breadcrumbs `catalog.*` (abrir, filtrar, enviar) e alerta `CATALOG_UPSTREAM_ERROR` > 5/min.
  **Aceite:** alerta criado; breadcrumb visível num evento de teste.
- [ ] **CT-94** — Rate limit testado em produção (61 × `bootstrap` → 429) e a UI de CT-59 reage. **Aceite:** print.
- [ ] **CT-95** — Logs da edge sem PII (grep `console.log` por telefone/nome). **Aceite:** revisão registrada.
- [ ] **CT-96** — `SECURITY.md` do módulo (RLS, grants pós-CT-01, secrets, rate limit, o que o `anon` não vê).
  **Aceite:** arquivo commitado.
- [ ] **CT-97** — `deployment-manifest.json` final = versão deployada (digest confere). **Aceite:** `--check` ok.
- [ ] **CT-98** — `ARQUITETURA.md` atualizado: números de 29/09 (7.722 ativos, `order_count` = 0, sync parado), fluxo
  único de envio, view `catalog_send_stats`. **Aceite:** diff commitado.
- [ ] **CT-99** — Plano de 11/09 recebe os checkboxes marcados conforme o estado real (por etapa equivalente) e o
  cabeçalho "SUPERSEDIDO por `PLANO_FINALIZACAO_CATALOGO_100.md`". **Aceite:** `validate-plan.mjs` ainda passa.
- [ ] **CT-100** — Release: tag `catalog-v1.0.0` + notas (do changelog), `HANDOFF_v1.md` (estado, pendências, comandos),
  branches `claude/feat-catalog-*` apagadas, CLAUDE.md com seção curta "Catálogo" (bancos, edge, fluxo de envio,
  regra "merge ≠ deploy da edge"). **Aceite:** tag existe; CLAUDE.md atualizado.

---

## 10. Decisões e achados registrados durante a execução

### CT-13 — o que o chat fazia ao enviar produto (medido em 29/09, bloco B)

Antes deste bloco, o envio de produto pelo chat **não** passava pelo catálogo:

| Hoje (antes do bloco B) | Evidência |
|---|---|
| `ChatDialogs.tsx` / `InputExtraTools.tsx` / `ChatInputToolbars.tsx` abriam `ExternalProductCatalog` passando `onSendProduct` | `grep -rn onSendProduct src/components/inbox` (3 chamadas + 6 repasses de prop) |
| O handler `handleSendProduct` (`useChatPanelHandlers.ts`) montava **uma única mensagem de texto**: `📦 *nome*`, marca, preço (pt-BR), qtd. mínima, cores, dimensões, personalização, prazo, estoque, 300 chars de descrição e a URL da foto **como link** | leitura do handler |
| Resultado: **0 fotos** enviadas como imagem, **nenhum caption**, **nenhum** registro em `catalog_send_events`, **nenhum rascunho** | `catalog_send_events` = 0 linhas em 29/09; `messages` sem `imagedelivery.net` |
| Toasts do handler usavam `use-toast` (`toast({ title, description })`), não `sonner` | `useChatPanelHandlers.ts` importa `@/hooks/ui/use-toast` |

Depois do bloco B, o chat abre o **mesmo** `SendProductDialog` da tela de catálogo, com
`presetContact` = contato da conversa (pula o passo de contato) — ou seja, um único fluxo de envio,
com fotos com caption (CT-04), throttle (CT-05), toasts `sonner` (CT-06), invalidação do rail
(CT-07), checagem pré-envio (CT-08) e log em `catalog_send_events` (E28).

## 11. Mapa de PRs

| Bloco | Etapas | Tipo | Gate | PR | Deploy/apply |
|---|---|---|---|---|---|
| A | CT-01–CT-12 | DDL (3) + front + teste real | DDL aguarda Joaquim | — | — |
| B | CT-13–CT-18 | Front | CI verde | — | — |
| C | CT-19–CT-30 | Front + edge (CT-19, CT-22) + RPC PromoGifts (CT-22) | edge: dispatch + aprovação | — | — |
| D | CT-31–CT-40 | Front | CI verde | — | — |
| E | CT-41–CT-50 | Front + view (CT-48) | view aguarda Joaquim | — | — |
| F | CT-51–CT-56 | Front | CI verde | — | — |
| G | CT-57–CT-66 | Front + edge (CT-64) | edge: dispatch + aprovação | — | — |
| H | CT-67–CT-76 | Front | CI verde | — | — |
| I | CT-77–CT-88 | Testes/e2e/docs | CI verde | — | — |
| J | CT-89–CT-100 | Docs/hardening/release | — | — | — |

**Ordem:** A → B → (C, D em paralelo) → E → F → G → H → I → J. A é obrigatória antes de qualquer outra: enquanto
não houver 1 envio real verificado, todo o resto é vitrine.

## 12. Fora de escopo (registrado, não esquecido)

- Layout 2 colunas do mock B (detalhe) e C (envio) — decisão do dono em 24/09.
- "Sincronizar catálogo" no ZAPP — a edge não tem ação de sync; o importador é do PromoGifts.
- Migrar `useRecommendedProducts` (AiTab) da tabela local `products` para o PromoGifts.
- Ordenação por relevância (`ts_rank_cd`) — exige RPC dedicada no PromoGifts.
- Reativar a sincronização do PromoGifts (parada desde 05/09) — sistema externo.

*Plano criado em 2026-09-29 a partir de `AUDITORIA_CATALOGO_2026-09-29.md`. Nenhuma etapa executada.*
