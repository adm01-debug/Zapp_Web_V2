# PLANO — Catálogo: finalização da implantação (100 etapas, prefixo `CT-`)

**Data:** 2026-09-29 · **Status:** EM EXECUÇÃO — atualizado em 01/10/2026. Cada etapa fechada traz a evidência ao lado
(arquivo:linha, migration, consulta medida ou saída de comando). Execução sob responsabilidade do Hermes a partir de
01/10/2026 (ordem do Joaquim); o Claude audita a `main` e a matriz de pendências.
**Base na última auditoria:** `main` @ `a1ddaafe` (Claude, 01/10/2026): 11 etapas feitas (CT-04..09, 13, 14, 16, 17, 47),
14 parciais, 75 não feitas.
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

- [x] **CT-01** — `REVOKE ALL ON catalog_favorites, catalog_send_events FROM anon; REVOKE TRUNCATE, TRIGGER, REFERENCES ON
  … FROM authenticated`. **Aceite:** `role_table_grants` sem `anon` e sem os 3 privilégios para `authenticated`.
  **✅ FEITO — provado em 01/10/2026 (MCP read-only, banco `tnnnlkbymytvtqngbbqh`):** migration
  `20260929650000_catalog_grants_append_only.sql` **presente no ledger** (`supabase_migrations.schema_migrations`);
  `information_schema.role_table_grants` **sem nenhum grant de `anon`** em `catalog_favorites` e `catalog_send_events`;
  `authenticated` **sem TRUNCATE/TRIGGER/REFERENCES** nas duas tabelas. Arquivo também presente no repo (sem drift).
- [x] **CT-02** — `catalog_send_events`: `REVOKE UPDATE, DELETE FROM authenticated` (log é append-only; policy hoje não
  cobre UPDATE/DELETE, mas o grant existe); `COMMENT ON TABLE` das 2 tabelas. **Aceite:** grants = `INSERT, SELECT`;
  `obj_description` não nulo.
  **✅ FEITO — provado em 01/10/2026:** grants de `authenticated` em `catalog_send_events` = **apenas INSERT e SELECT**
  (append-only, sem UPDATE/DELETE); `catalog_favorites` = SELECT/INSERT/UPDATE/DELETE;
  `obj_description('public.catalog_send_events')` e `obj_description('public.catalog_favorites')` **não nulos**
  (os comentários descrevem exatamente o estado pós-CT-01/CT-02). Observação: a migration foi escrita antes da regra de
  cabeçalho `-- rollback:` e já está mergeada e aplicada — migration aplicada não se edita (regra 7 do `CLAUDE.md` §1).
- [ ] **CT-03** — PromoGifts: `REVOKE EXECUTE ON FUNCTION zapp_catalog_stats() FROM authenticated` (só service key,
  como o plano E24.2 pedia) — via `apply_migration` do MCP GESTÃO DE PRODUTOS. **Aceite:** `proacl` sem `authenticated`;
  edge continua respondendo `catalog_stats`.
  **🚫 DECISÃO DO JOAQUIM (01/10/2026, via Claude): NÃO EXECUTAR — DDL em banco externo é proibida (`CLAUDE.md` §1).**
  Vira **pendência do responsável pelo PromoGifts**: aplicar esse `REVOKE` **dentro do PromoGifts** (a RPC deve ficar
  acessível só pela service key). Do nosso lado não há trabalho: a edge `promogifts-catalog` chama a RPC com a
  **service key** (`Deno.env.get("PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY")`), que é o único caminho exercitado em produção.
  **Aceite quando o PromoGifts entregar:** `proacl` de `zapp_catalog_stats()` sem `authenticated` e a edge seguindo
  respondendo `catalog_stats` normalmente.
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
  **✅ FEITO — provado em 01/10/2026:** `ExternalProductCard.tsx` **mantido com exatamente 1 consumidor**
  (`ExternalProductManagement.tsx:36` import, uso ~:616) — aceite satisfeito. As **2 supressões `eslint-disable-next-line
  react-hooks/exhaustive-deps`** do `ExternalProductCatalog.tsx` (linhas 129 e 138) foram **eliminadas corrigindo os hooks
  de verdade** (refs `doFetchRef`/`isOpenRef` + sync effect), não mascaradas; o bloco `{path, sha256}` desse arquivo e as
  2 entradas `react-hooks/exhaustive-deps` foram removidos de `scripts/ci/eslint-baseline.json`
  (`baseline 971→969`, `atual 944`, **`novas: 0`**, sem `--update-baseline`). `npx eslint` no arquivo = 0 problemas;
  `bun run typecheck` exit 0; `bunx vitest run src/components/catalog` = **10 arquivos, 185 testes passando**.
- [x] **CT-16** — Chip "Meus favoritos" no dialog do chat (`useCatalogFavorites`). **Aceite:** teste RTL.
- [x] **CT-17** — `SendProductDialog` em modo `presetContact` mostra o card-resumo do contato e permite trocar.
  **Aceite:** teste RTL.
- [ ] **CT-18** — Fechamento B: PR mergeada; envio real pelo chat (número de teste) registrado em `ENVIO_E2E.md`.
  **Aceite:** 1 linha em `catalog_send_events` originada do chat.

## FASE 2 — Pendências das Fases 2–5 (CT-19–CT-30)
*Bloco C — 1 PR de front + 1 mudança de edge (CT-19, CT-22) com deploy.*

- [ ] **CT-19** — Edge: rate limit 120/min só para `list_products` (60 para o resto), como E26.3 pedia; `deploy-functions`
  disparado e aprovado. **Aceite:** 61 chamadas de `bootstrap` em 1 min → 429; 100 de `list_products` → 200.
  **🟡 PARCIAL — código feito e provado em 01/10/2026; falta o deploy da edge, que o próprio aceite exige.** Cota **por ação**
  ancorada no enum (`ACTION_RATE_LIMITS`, `supabase/functions/promogifts-catalog/index.ts:151`; `checkRateLimit` com balde
  próprio `${userId}:${action}`, `:166-167`): `list_products` **120/min**, as outras 5 ações 60/min, e corpo inválido no teto
  global de 60 (fail-closed). **Prova:** 7 `Deno.test` novos com prefixo CT-19 em `index.actions.test.ts` (`:386`, `:418`,
  `:441`, `:455`, `:467`, `:481`, `:495`) — incluem os 2 aceites literais (60 `bootstrap` → a 61ª = 429; 100 `list_products` →
  a 121ª = 429); arquivo inteiro rodado aqui: **25 passed | 0 failed (49ms)**.
  **Divergência medida (ordem do handler):** o corpo passou a ser lido/validado **antes** do rate limit (`index.ts:251-270`),
  porque a cota depende da ação. O 503 de configuração, porém, continua vindo **antes** do retorno do corpo inválido
  (`:280-293`): sem secrets, JSON malformado segue **503**; com secrets, segue **500 `CATALOG_INTERNAL_ERROR`** — igual ao
  código anterior (`git show HEAD:…/index.ts` faz `req.json()` depois do 503). A nota de execução que previa **500 em
  ambiente sem secrets** **não se confirma** no arquivo.
  **Pendente (dependência: Joaquim/CI):** `deploy-functions` por `workflow_dispatch` + aprovação no environment
  `producao-edge-functions` e a medição em produção (60/`bootstrap`, 100/`list_products`) — a regra 4 do plano não deixa etapa
  de edge fechar sem o deploy confirmado.
- [x] **CT-20** — `catalogExport.ts`: CSV do filtro atual (reusa `esc()`/BOM de `talkxExport.ts`), paginação 100 em 100
  até 1.000, colunas do E29.3, nome `catalogo_<filtro>_<yyyymmdd>.csv`, `sonner` loading→success, aborta sem parcial.
  **Aceite:** teste do builder; arquivo abre no Excel com acentos.
  **✅ FEITO — provado em 01/10/2026.** `catalogExport.ts` novo (281 linhas): `esc()` (`:95`), BOM UTF-8 (`:23`), colunas do
  E29.3 (`:30-44`), nome `catalogo_<filtro>_<yyyymmdd>.csv` (`:142`), coleta **100 em 100 até 1.000** (`:170-193`), fetcher da
  edge em import dinâmico (`:204`) e toast loading→success que **não baixa nada** em erro (aborta sem parcial, `:256-281`).
  Testes: **30** em `__tests__/catalogExport.test.ts` passando (suíte do módulo: **16 arquivos, 363 testes**, medidos aqui).
  **Divergência 1:** `talkxExport.ts` **não existe** no repositório (`grep -rn talkxExport src/` só encontra o comentário do
  próprio `catalogExport.ts:4`) — `esc()`/BOM foram escritos do zero, no contrato do único export CSV existente no repo.
  **Divergência 2:** o `.order('id')` que o E29.2 pedia é **impossível**: a edge só aceita `order_by` do enum
  `ALLOWED_ORDER_FIELDS` (`index.ts:12`), e `id` não está nele. Foi usado `order_by: 'name'` + **dedupe por `id`**
  (`catalogExport.ts:177,184`), que resolve o mesmo problema (nenhuma linha repetida ou pulada entre páginas).
  **Ressalva:** "abre no Excel com acentos" está provado pelo teste do BOM (`catalogExport.test.ts:76`), não abrindo o arquivo
  num Excel real — não há Excel neste ambiente.
- [x] **CT-21** — Rail "Ações rápidas": "Exportar catálogo" (CT-20), "Gerenciar no PromoGifts" (link, `ExternalLink`);
  "Importar planilha" e "Gerenciar categorias" **só** se houver URL pública confirmada, senão não entram (regra do
  plano: nada morto). **Aceite:** grep `RailAction` em `CatalogRail.tsx` ≥ 2; nenhum `href="#"`.
  **✅ FEITO — provado em 01/10/2026.** `RailQuickActions` em `CatalogRail.tsx:341` com **2 `RailAction`** vivas: "Exportar
  catálogo" (CT-20, `:346`) e "Gerenciar no PromoGifts" (`window.open` da URL pública, `:352`); aceite por grep:
  `grep -c RailAction CatalogRail.tsx` = **4** (import + comentário + os 2 usos) e **0** ocorrências de `href="#"` no arquivo.
  "Importar planilha"/"Gerenciar categorias" ficaram **fora** — sem URL pública confirmada. O export sai do **filtro atual**:
  `activeRailFilter` (`ExternalProductManagement.tsx:369-370`) é passado em `:774` e vira `filterKeyToEdgeParams` no rail
  (`:455-456`). Testes: 6 em `CatalogRail.test.tsx:189-235` + 2 em `ExternalProductManagement.test.tsx:229,249`.
- [ ] **CT-22** — "Ordenar por": ocultar "Mais pedidos" enquanto `order_count` = 0 em todos (flag vinda do
  `catalog_stats`: adicionar `has_order_data boolean` à RPC `zapp_catalog_stats()` — migration aditiva no PromoGifts —
  e à ação `catalog_stats`). **Aceite:** opção some em produção; volta sozinha quando houver dado.
  **🟡 FRONT FEITO E PROVADO (01/10/2026); a metade do PromoGifts fica como pendência do responsável pelo PromoGifts.**
  **Nosso lado (feito):** a opção **some em produção** — por decisão do Joaquim (via Claude, 01/10/2026) de **não** fazer
  DDL no banco externo. Foram removidos os **dois pontos que permitiam ativar** o filtro: a entrada
  `{ label: 'Mais pedidos', order_by: 'order_count', ascending: false }` de `SORT_OPTIONS`
  (`ExternalProductManagement.tsx:~286`, um sort antigo salvo em `sessionStorage` cai no fallback `?? SORT_OPTIONS[0]`) e a
  seção "Destaques" com o `Switch` `id="adv-bestseller"` (`CatalogAdvancedFilters.tsx:80`, junto com o import órfão
  `TrendingUp`). O **chip** de `isBestseller` (`catalogShared.tsx:726`) foi **mantido de propósito**, para o usuário ainda
  conseguir **limpar** um filtro antigo — mas não há como reativá-lo. A razão está comentada no código, apontando para
  esta pendência e para o `CLAUDE.md` §1.
  **Prova por teste COM MUTAÇÃO** (o repo exige prova, não relato): reintroduzir a entrada de ordenação derruba o teste
  de ordenação; reintroduzir o switch derruba o de filtro — ambos revertidos com **sha256 byte-idêntico** ao estado
  correto. **3 testes novos** (ordenação ausente, switch ausente, chip funcionando); **118 testes** do módulo passando;
  `eslint` 0; `typecheck` 0; `lint-ratchet novas: 0`.
  **Pendência do responsável pelo PromoGifts (para o aceite completo):** acrescentar `has_order_data boolean` à RPC
  `zapp_catalog_stats()` (migration aditiva **no PromoGifts**) e à ação `catalog_stats`. Só com a flag a opção pode
  "voltar sozinha quando houver dado" — hoje ela está oculta de forma incondicional, que é o máximo possível sem DDL
  externa. Quando a flag existir, reexibir são 2 linhas (os comentários no código marcam exatamente onde).
- [x] **CT-23** — Rail alertas: `AlertCard warning` "PromoGifts sem sincronizar há N dias" quando `last_sync_at` >
  3 dias (hoje 24), `AlertCard info` "N produtos com estoque baixo" (clicável → filtro), ocultáveis por sessão.
  **Aceite:** com os dados de hoje, o alerta de sync aparece.
  **✅ FEITO — provado em 01/10/2026.** `RailAlerts` (`CatalogRail.tsx:376`) com o limiar exportado
  `CATALOG_RAIL_SYNC_ALERT_DAYS = 3` (`:35`): warning de sync com a contagem de dias (`:393`), info de estoque baixo com botão
  que aplica `low_stock` na edge (`:406`→`onApplyLowStock`→`ExternalProductManagement.tsx:357,775`); **sem o callback o alerta
  aparece sem botão** (`:409`), para não ter botão morto. Dispensa por sessão em `sessionStorage` (`:432`, `:296-315`).
  Testes: 12 em `CatalogRail.test.tsx:236-314` + `ExternalProductManagement.test.tsx:207` ("Ver produtos com estoque baixo"
  aplica `low_stock=true`). **Premissa do aceite:** `last_sync_at` vem de `catalog_stats`, já repassado ao rail
  (`ExternalProductManagement.tsx:766`); "com os dados de hoje" é a §0 do plano (sync parado desde 05/09 — mais de 3 dias,
  então o alerta aparece). Nenhuma consulta ao PromoGifts foi feita aqui para remedir a data.
- [x] **CT-24** — `TipCard` com 5 dicas estáticas rotativas por dia (`getDate() % 5`, sem `Date.now()` no render — usar
  inicializador de estado). **Aceite:** teste com data fixa.
  **✅ FEITO — provado em 01/10/2026.** `CATALOG_RAIL_TIPS` com 5 dicas (`CatalogRail.tsx:40-46`) e a rotação no
  **inicializador de estado** — `useState(() => new Date().getDate() % CATALOG_RAIL_TIPS.length)` (`:439`), nunca no corpo do
  render — renderizada pelo `TipCard` do talkx (`talkxShared.tsx:757`, usado em `CatalogRail.tsx:477`).
  Testes com data fixa: `CatalogRail.test.tsx:335-362` (roda as 5 dicas pelo dia do mês e muda de dica no dia seguinte).
- [x] **CT-25** — Card: `RowActionsMenu` (Ver detalhes, Enviar, Copiar SKU, Copiar link, Abrir no PromoGifts,
  Favoritar) no hover da grade e fixo na lista; teclado `Enter` abre, `e` envia. **Aceite:** teste RTL do menu e
  das teclas.
  **✅ FEITO — provado em 01/10/2026.** `RowActionsMenu` (componente já existente, `talkxShared.tsx:561`) montado em
  `CatalogProductCard.tsx:226-244` e renderizado em `:258`: Ver detalhes, Enviar, Copiar SKU, Copiar link, Abrir no
  PromoGifts e Favoritar/Remover (esta só quando o caller passa `onToggleFavorite`); as duas ações de link ficam
  **desabilitadas sem slug** (`promogiftsProductUrl` vazio — nada morto). Posicionamento: **hover/focus na grade**
  (`:407-415`, com `stopPropagation` para o clique não abrir o detalhe junto) e **fixo na lista** (`:337`). Teclado em
  `handleCardKeyDown` (`:246-257`, ligado em `:271` e `:358`): `Enter` abre o detalhe, `e` envia, e tecla em campo/botão
  interno é ignorada. Testes: **11** em `__tests__/CT25_cardActions.test.tsx` (menu, links, `Enter`/`e` e o card esgotado).
- [x] **CT-26** — Lista: cabeçalho de colunas sticky (`.talkx-table`), linha 72 px, `role="row"`. **Aceite:** teste RTL.
  **✅ FEITO — provado em 01/10/2026.** No modo lista, `ExternalProductCatalog.tsx:539-556`: tabela `.talkx-table`
  (`components.css:263`) em 5 colunas com `<thead className="sticky top-0 z-10 bg-card">` (`:540`), linhas de **72 px**
  (`LIST_ROW_HEIGHT = 72`, `:56`, aplicado em `:556`) e `role="row"` tanto no cabeçalho quanto no corpo (`:541`, `:556`).
  Testes: 2 em `ExternalProductCatalog.test.tsx:329-380` — o de cabeçalho confere `.talkx-table`, o `sticky`, as 5 colunas, os
  72 px e o `role="row"`; o outro confirma que a **grade não vira tabela**.
- [x] **CT-27** — Virtualização do modo lista com `@tanstack/react-virtual` quando `pageSize ≥ 48` (grade não).
  **Aceite:** teste "renderiza só as visíveis"; medição antes/depois registrada em `PERF.md`.
  **✅ FEITO — provado em 01/10/2026.** `useVirtualizer` (`ExternalProductCatalog.tsx:205-211`) armado só sob
  `viewMode === 'list' && !favoritesOnly && pageSize >= VIRTUALIZE_MIN_PAGE_SIZE` (`:64`, `:200`), com `overscan: 6` e
  espaçadores que preservam a altura total da lista (`:223-231`; render em `:546-574`); o `pageSize` virou estado e o select do
  `TalkXPagination` deixou de ser no-op (`handlePageSize`, `:240-245`). **Medição registrada em `docs/catalogo/PERF.md`
  (seção CT-27): 16 de 50 linhas no DOM** com `pageSize=50`/viewport de 720 px contra **50 de 50** no caminho não
  virtualizado, com a altura total preservada. Teste: `ExternalProductCatalog.virtualizacao.test.tsx` — 3 testes
  (`:139`, `:168`, `:179`). Suíte do módulo rodada aqui: **16 arquivos, 363 testes**.
  **Divergências medidas (decisão registrada):** a **grade nunca** virtualiza (o card não tem altura de linha previsível — o
  próprio plano já diz "grade não") e o **ramo de favoritos em modo lista não usa a tabela nem virtualiza**
  (`:496-507`): com o chip "Meus favoritos" ligado, o modo lista continua renderizando o grid de cards.
- [x] **CT-28** — Bulk bar: "Exportar seleção" (CT-20 com ids), "Favoritar N", limite 10 por envio com mensagem clara.
  **Aceite:** selecionar 11 → aviso; exportar 3 → CSV com 3 linhas.
  **✅ FEITO — provado em 01/10/2026.** `CatalogBulkBar` ganhou "Exportar seleção" (`:90-96`) e "Favoritar {count}"
  (`:99-104`), com o limite **`CATALOG_BULK_SEND_MAX = 10`** (`:19`) avisando na barra e **desabilitando o envio** acima dele
  (`:52`, `:84-88`, `:107`). "Exportar seleção" reusa os builders puros do CT-20 com **exatamente os ids escolhidos**
  (`ExternalProductCatalog.tsx:280-284`, `ExternalProductManagement.tsx:192-196`), sem tocar na edge. Fiação: modo seleção no
  catálogo do chat (`ExternalProductCatalog.tsx:115`, barra em `:633-644`) e barra da tela de gestão
  (`ExternalProductManagement.tsx:733-736`). Testes: **16** em `__tests__/CT28_bulkBar.test.tsx` — inclui os 2 aceites
  literais (**11 selecionados → aviso e envio bloqueado**, `:144`; **exportar 3 → CSV com cabeçalho + 3 linhas**, `:221`) —
  mais 4 casos de fiação em `:279-311` e 3 em `ExternalProductManagement.test.tsx:573-616`.
- [ ] **CT-29** — Paginação sem flash: cards antigos com `opacity-60` + barra fina de progresso durante `isFetching`;
  prefetch da próxima página no hover de "Próxima". **Aceite:** teste: `isFetching` não mostra skeleton.
  **🟡 PARCIAL — 01/10/2026: a metade do feedback de progresso está feita e provada; o prefetch não existe no hook.**
  **FEITO:** o hook expõe `isInitialLoading` (`isLoading` puro) e `isFetching` (`useExternalCatalog.ts:317,319`) e o catálogo
  usa os dois (`ExternalProductCatalog.tsx:190-192`): durante refetch os cards antigos ficam com **`opacity-60`** (`:536` na
  lista, `:588` na grade) e aparece a **barra fina de progresso** (`:468-480`), com skeleton **só** na carga inicial (`:510`).
  Testes: 4 em `ExternalProductCatalog.test.tsx:382-431` (nenhum skeleton com `isFetching`; carga inicial ainda mostra os
  skeletons e nenhuma barra). Mensuração/registro em `docs/catalogo/PERF.md` (seção CT-29).
  **PENDENTE (dependência: `useExternalCatalog`, hook fora dos arquivos deste bloco):** o **prefetch da próxima página no hover
  de "Próxima"** não foi implementado — o hook **não expõe nenhuma função de prefetch** (só `productsQuery`, `fetchProducts`,
  `fetchProduct`, `fetchCategories`, `fetchSuppliers`, `invalidate`) e chamar `fetchProducts` no hover trocaria o conteúdo
  exibido, porque as `filters` são a `queryKey`. Está registrado como pendência medida em `docs/catalogo/PERF.md`.
- [ ] **CT-30** — Responsivo: rail vira `Accordion` "Resumo do catálogo" acima da grade em `< xl`; detalhe/envio viram
  `Drawer` (vaul) em `< md`; prints 1280/1024/768/390 em `docs/catalogo/PARIDADE.md` (criado aqui, seção "Rail").
  **Aceite:** 4 prints commitados; Accordion e Drawer testados.

## FASE 3 — Ligar os órfãos da F1 no detalhe e no envio (CT-31–CT-40)
*Bloco D — 1 PR de front. Não reabre o layout do mock B/C (decisão de 24/09).*

- [x] **CT-31** — `ProductDetailDialog.tsx`: Qtd. mínima / Prazo / Origem via `MetaTile` (grade 3 colunas).
  **Aceite:** `grep MetaTile ProductDetailDialog.tsx` ≥ 1; teste RTL.
  **✅ FEITO — provado em 01/10/2026.** Grade `grid grid-cols-3` com `MetaTile` para **Qtd. mínima**, **Prazo** e **Origem**
  em `ProductDetailDialog.tsx:424-430` (cada tile só nasce se o campo existir; eram linhas soltas na ficha). Aceite por grep:
  `grep -c MetaTile ProductDetailDialog.tsx` = **4** (import + 3 usos), ≥ 1. Testes:
  `ProductDetailDialog.test.tsx:116-143` — 2 casos (os 3 tiles quando os campos existem; nenhum tile quando não existem).
- [x] **CT-32** — Descrição e Ficha técnica via `SectionCard`; ficha inclui material, capacidade, gravação
  (`engraving_type/description`), embalagem (`has_gift_box`) — campos já no payload da E21. **Aceite:** produto
  `PO-13153` mostra LASER na ficha.
  **✅ FEITO — provado em 01/10/2026.** Descrição virou `SectionCard title="Descrição"` (`ProductDetailDialog.tsx:437`, com
  fallback para `short_description`) e a ficha virou `SectionCard title="Ficha técnica"` (`:449`), agora com **Capacidade
  (`capacity_ml`), Material (`materials`), Gravação (`engraving_type` + `engraving_description`) e Embalagem
  (`has_gift_box`)** (`:449-497`) — Origem/Prazo saíram daqui e foram para os `MetaTile` do CT-31. Aceite: teste
  `ProductDetailDialog.test.tsx:150` ("mostra LAZER na ficha técnica do PO-13153 (engraving_type)"), com o caso de
  "descrição cai para `short_description`" em `:175` — 4 testes novos na seção (`:145-186`).
- [x] **CT-33** — Cores via `ColorSwatch` (hex de `color_swatches`) com estoque por cor (soma de `variants` por cor) e
  clique que rola a galeria para a 1ª imagem da cor. **Aceite:** teste RTL com 2 cores.
  **✅ FEITO — provado em 01/10/2026.** Cores via `ColorSwatch` (`ProductDetailDialog.tsx:523`) com **estoque somado das
  variantes por cor** (`groupStock`, `:257-261`) e hex de `color_swatches` — a fonte preferida é `color_swatches`, com
  fallback para as cores das variantes (hex do grupo) e depois para `colors` (só nome, sem hex) (`:268-281`). O clique chama
  `selectColor` e **rola a galeria até a 1ª imagem da cor** (`selectColor` + `focusUrl/focusToken` na `ImageGallery`,
  `:85-125`, `:242`). Testes: `ProductDetailDialog.test.tsx:188-221` — 2 casos (as 2 cores com o estoque somado; clique na cor
  rola a galeria para a imagem dela).
- [x] **CT-34** — Variantes agrupadas por cor (reusa `groupVariantsByColor`), seleção que troca o CTA para "Enviar
  variação"; miniaturas com `.catalog-gallery-thumb(--active)`. **Aceite:** classe com consumidor; teste RTL.
  **✅ FEITO — provado em 01/10/2026.** Variantes agrupadas com o helper já existente `groupVariantsByColor`
  (`ProductDetailDialog.tsx:256`), um botão por cor com a thumb **`.catalog-gallery-thumb` + `--active` quando selecionada**
  (`:561`; classe definida em `components.css:412-413` — agora com consumidor) e, com a cor escolhida, o CTA do rodapé vira
  **"Enviar variação (<cor>)"** (`:611`) e manda a cor como 2º argumento do `onSend` (`:604`), que o
  `ExternalProductCatalog` repassa como `initialVariantColor` (`:250`, `:660`). Testes: `ProductDetailDialog.test.tsx:222-263`
  (2 grupos + CTA) e `CT28_bulkBar.test.tsx:280-294` (a cor escolhida chega ao `SendProductDialog`; sem cor não inventa
  variante).
- [x] **CT-35** — Pills de tags/categoria no topo do detalhe (`full_path_readable` + `tags`). **Aceite:** teste RTL.
  **✅ FEITO — provado em 01/10/2026.** Pills (`catalog-chip`) no topo do detalhe com a **categoria e as tags**
  (`ProductDetailDialog.tsx:374-389`), usando o **caminho completo** quando ele vem (`categoryLabel`,
  `:305-309`) e caindo para o nome simples quando não vem — sem renderizar pill vazia. Testes:
  `ProductDetailDialog.test.tsx:265-353` (5 casos: com pills, sem pills, com `full_path_readable`, fallback para o nome e
  campos em branco).
  **Divergência medida, solucionada de forma aditiva na edge:** `full_path_readable` **não chegava** no payload do produto —
  o campo entrou no embed `categories:category_id(..., full_path_readable)` de `PRODUCT_RELATIONS`
  (`supabase/functions/promogifts-catalog/index.ts:104`; já existia em `CATEGORY_FIELDS`, `:407`). Prova nos **dois
  cenários**: front com e sem o campo (`ProductDetailDialog.test.tsx:293` e `:312`) e 2 `Deno.test` CT-35 que conferem que o
  embed pede `full_path_readable` no `get_product` e no `list_products` (`index.actions.test.ts:530,543`).
  **Dependência:** o caminho completo só aparece **em produção depois do deploy da edge**; até lá vale o fallback pelo nome.
- [x] **CT-36** — Navegação ‹ › entre produtos do resultado atual dentro do Sheet, com `history.replaceState` do
  `product=`. **Aceite:** teste RTL; deep link continua funcionando.
  **✅ FEITO — provado em 01/10/2026.** Dois botões ‹ › no cabeçalho do detalhe (`ProductDetailDialog.tsx:328-347`) trocam o
  produto mostrado **dentro do Sheet** (`goToProduct`, `:286-292`, com estado `nav` sobre a ordem de `products`) e mantêm o
  deep link em dia via `window.history.replaceState` do `product=` (`:290-291`); sem a prop `products` os botões nem aparecem
  (`:294`, `:322`). A lista exibida chega do catálogo (`ExternalProductCatalog.tsx:499,563,600` →
  `CatalogProductCard.tsx:341,469`). Testes: `ProductDetailDialog.test.tsx:366` (sem a prop não mostra botões), `:371`
  (avança e reflete `?product=` na URL) e `:383` (volta). **Deep link:** o caminho que lê `?product=` na entrada
  (`ExternalProductManagement.tsx:392-396`) não foi tocado por esta etapa e continua coberto pelos testes existentes do E78.
- [x] **CT-37** — `SendProductDialog.tsx`: preview WhatsApp em `PhonePreview` (`catalogShared.tsx`) usando `.catalog-phone`;
  remover `#075E54/#dcf8c6/#e5ddd5/bg-white/text-white` — a bolha verde do WhatsApp vira token local documentado
  (`--wa-bubble`) em `tokens.css`. **Aceite:** `grep -c "#[0-9a-fA-F]\{6\}" SendProductDialog.tsx` = 0.
  **✅ FEITO — provado em 01/10/2026.** O preview local (`WhatsAppPreview`, com os hex na mão) foi removido e o
  `SendProductDialog` passou a usar o **`PhonePreview` extraído para `catalogShared.tsx:707`** (`:491`), montado com as partes
  `.catalog-phone__header/__body/__bubble/__time/__tick` (`components.css:425-471`) sobre a moldura `.catalog-phone` (`:419`).
  As cores da marca viraram tokens documentados em `tokens.css:182-186` — `--wa-header` (o `#075E54`), `--wa-background`
  (o `#e5ddd5`), **`--wa-bubble` (o `#dcf8c6`)** — e nenhum componente repete hex. Aceite por grep, medido aqui:
  `grep -c "#[0-9a-fA-F]\{6\}" SendProductDialog.tsx` = **0** e `grep -c "bg-white\|text-white" SendProductDialog.tsx` = **0**.
  Testes: `catalogShared.test.tsx:624-660` (4 casos, incluindo "catalogShared.tsx não contém cor hexadecimal literal") e
  `SendProductDialog.test.tsx:485-515` (2 casos, incluindo "não usa nenhuma cor hexadecimal literal nem bg-white/text-white").
- [x] **CT-38** — Cards de variação com foto/cor/estoque (modo "Variação específica") e card de info do produto no
  modo completo. **Aceite:** teste RTL.
  **✅ FEITO — provado em 01/10/2026:** os cards de variação já traziam foto/cor/estoque; o que faltava era o **card de
  info do produto no modo completo**, agora em `SendProductDialog.tsx:386-408` (thumb + nome + "N foto(s) · Modelo X",
  só tokens, `data-testid="product-info-card"`), renderizado só em `sendMode === 'product'` para não quebrar os modos
  `presetContact` (CT-17) e variação específica. Teste: 5 casos novos em `__tests__/SendProductDialog.test.tsx:421-478`
  → **28 testes passando**, typecheck exit 0, `eslint` 0 problemas, `lint-ratchet novas: 0`.
  *(Achado do executor, corrigido no mesmo arquivo: o `vi.mock` de `useCatalogContactSearch` não exportava
  `CONTACT_SEARCH_MIN_CHARS`, o que derrubava os 28 testes independentemente do CT-38 — corrigido no mock.)*
- [ ] **CT-39** — "Adicionar fotos" (das `variants.images` não selecionadas) e "Baixar" (zip das fotos selecionadas
  via `fetch` + `JSZip` se já existir no bundle; senão download individual). **Aceite:** teste RTL do picker.
- [ ] **CT-40** — Fechamento D: PR mergeada; `PARIDADE.md` seções "Detalhes" e "Enviar" (prints antes/depois); zerar
  `text-white`/`violet-500` restantes por tokens (`text-primary-foreground`, `--badge-new`). **Aceite:** grep de cores
  literais no módulo = 0 (exceção documentada: `bg-white` da mídia).
  **✅ FRONT FEITO — provado em 01/10/2026 (PR ainda não mergeada).** Token `--badge-new` criado em
  `tokens.css:194-201` (`268 83% 63%`, mesma família da `.catalog-badge--new` de `components.css`). Zerados os 7
  `text-white` (→ `text-primary-foreground`) em `ProductDetailDialog.tsx:362,363,366` e
  `CatalogProductCard.tsx:65,70,75,399`, e os 2 `bg-violet-500` (→ `bg-[hsl(var(--badge-new))]`) em
  `ProductDetailDialog.tsx:366` e `CatalogProductCard.tsx:399`. Seções "Detalhes" e "Enviar" publicadas em
  `docs/catalogo/PARIDADE.md`. Aceite por grep: `find src/components/catalog -name '*.tsx' -not -path '*/__tests__/*'`
  → 0 hex, 0 `text-white`, 0 `bg-violet-500`; contrato travado em `__tests__/CT40_badgeTokens.test.tsx`. Falta só a
  PR mergeada (fechamento real da etapa).

## FASE 4 — Passo "Selecionar contato" completo (CT-41–CT-50)
*Bloco E — 1 PR de front + 1 migration (CT-48).*

- [x] **CT-41** — `ContactSelectionStep.tsx`: 2 colunas `md:grid-cols-[1fr_300px]`, header `IconTile Users`, card-resumo
  do produto (thumb 96, nome, modelo, "N foto(s)"). **Aceite:** teste RTL.
  **✅ FEITOS — CT-41, CT-42 e CT-43 provados em 01/10/2026** (`ContactSelectionStep.tsx`, `useSendProduct.ts`,
  `useCatalogContactSearch.ts` + 3 arquivos de teste: **38 testes passando**, `typecheck` exit 0, `eslint` 0 problemas,
  `lint-ratchet novas: 0`):
  · **CT-41:** 2 colunas `md:grid-cols-[1fr_300px]` + header com `IconTile` (o componente existe em `@/components/talkx/talkxShared`)
  + card-resumo com **thumb 96** (era 40 px).
  · **Divergência de componente:** `InitialsAvatar` existe em `@/components/dashboard/overview/DashboardCard`, mas seus tipos
  só aceitam `size` `24|28|32|36|44|56` (não 40) — usado `size={44}` com `!h-10 !w-10` para os 40 px pedidos.
- [x] **CT-42** — Lista: `InitialsAvatar` 40 com `avatar_url`, telefone formatado, radio; seção "Enviados recentemente"
  (contatos de `catalog_send_events`) acima dos 15 recentes. **Aceite:** teste RTL com 3 contatos.
  **✅ FEITO:** telefone pelo `formatPhoneBR` de `@/lib/calls/phone` (**já existia** — não foi criado helper novo), radio de
  seleção e seção "Enviados recentemente" alimentada por `useCatalogRecentSends`. Teste RTL com 3 contatos.
- [x] **CT-43** — Busca: normalização de telefone (só dígitos) no `ilike`, mínimo 2 chars, debounce 300 ms; vazio com
  link "Criar contato" (`?view=contacts&new=1` — confirmar param antes). **Aceite:** busca "9999" acha `+55 (41) 9 9999`.
  **✅ FEITO:** normalizador de dígitos aplicado no `ilike`, mínimo **2** caracteres, debounce de 300 ms (reusado o que já
  existia, sem duplicar) e estado vazio com link "Criar contato". O teste prova exatamente o aceite: busca "9999" encontra o
  contato armazenado como `+55 (41) 9 9999`.
  **⚠️ Divergência medida (o plano pedia "confirmar param antes"):** o deep link `?view=contacts&new=1` **não existe** — o
  `ViewRouter` só interpreta `?view=`; foi usado `?view=contacts` (sem `new`), com a razão comentada no código.
- [ ] **CT-44** — Rail "Resumo do envio" (`RailCard`) com 4 linhas + check e `AlertCard` "Pronto para enviar!" só com
  contato; `aria-live="polite"`. **Aceite:** teste RTL sem/com contato.
- [ ] **CT-45** — Personalização `{{nome}}`/`{{empresa}}` reusando `personalizePreview`/`extractVariables` do
  `talkxShared`; templates ganham "Olá, {{nome}}!" com fallback "Olá!"; preview atualiza ao selecionar contato.
  **Aceite:** teste de `buildMessage` com e sem nome.
- [x] **CT-46** — Botão "Enviar agora" com progresso real "Enviando 2/4…" (contador de mensagens). **Aceite:** teste RTL.
  **✅ FEITO — provado em 01/10/2026.** O contador é **real**, não decorativo: o estado `sendProgress` nasce em
  `useSendProduct.ts:149`, é devolvido pelo hook (`:266`) e os testes travam a sequência do loop
  (`{done:0,total:2}` → `{1,2}` → `{2,2}` → `null` em `useSendProduct.test.tsx:201-230`). Os **dois** botões de envio
  exibem o contador: `ContactSelectionStep.tsx:144-146` (passo de contato) e `SendProductDialog.tsx:566-571` (modo completo).
  **Nota de execução:** a segunda metade (botão do modo completo) não pôde ser feita pelo subagente porque o arquivo estava
  reservado a outro executor naquele momento — foi fechada pelo orquestrador, e verificada por medição própria
  (`SendProductDialog.test.tsx` = **28 testes passando**, `bun run typecheck` exit 0).
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
- [x] **CT-53** — Mesmo botão no CRM 360 (se a tela existir; senão registrar). **Aceite:** idem ou nota.
  **Nota (01/10/2026) — NÃO existe ponto de extensão; nada foi inventado.** O CRM 360 é um explorador
  **somente-leitura de um banco CRM externo** (`useExternalTableBrowser` / `ExternalTableName`), não uma tela de perfil:
  não há cabeçalho/detalhe de contato. A pasta `src/components/crm360/` contém só `CRM360ExplorerView.tsx` (header + abas +
  `DataExplorerTable`), `CRM360StatsCards.tsx`, `DataExplorerTable.tsx` (tabela genérica), `CompanyFormDialog.tsx`,
  `ContactFormDialog.tsx`, `crm360TabsConfig.ts` e `crm360TabsData.ts`. A aba "Contatos"
  (`crm360TabsData.ts:26-37`) lista colunas do CRM (nome/cargo/departamento/estágio/score), **sem telefone/WhatsApp**, e o
  clique na linha abre o `ContactFormDialog` (form de edição do CRM externo — `first_name`/`last_name`/`cpf`/…), que **não
  carrega `contact_id` do Zapp nem telefone**. O envio de produto (`SendProductDialog`/`catalog_send_events`) exige um
  contato do Zapp; adicionar o botão ali exigiria uma vinculação CRM→Zapp que não existe hoje. Portanto: **sem botão no
  CRM 360** (não se inventa tela).
- [ ] **CT-54** — Histórico "Produtos enviados" no perfil do contato (lista de `catalog_send_events` por `contact_id`,
  RLS já cobre). **Aceite:** teste RTL com mock.
  **🟡 DECISÃO (Joaquim, 01/10/2026):** o histórico por contato será **por agente na v1**; a visão de equipe fica para
  depois (exigiria **migration/policy nova**). **Motivo medido, policy real:** `catalog_send_events` é filtrada por
  **`agent_id`**, não por `contact_id` — a policy `"Users can view own catalog send events"`
  (`supabase/migrations/20260925130000_add_to_authenticated_catalog_send_events_favorites.sql:14-20`, criada em
  `20260913122557_catalog_send_events.sql:36-41`) é
  `agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())`.
  Ou seja: um agente comum vê **só os próprios envios** (ainda que para vários contatos); admin/supervisor vê o
  conjunto que a policy já permite. A etapa segue `[ ]` (front pendente), mas **sem migration nova** nesta v1.
- [ ] **CT-55** — Deep link `?view=catalog&product=<id>&send=1&contact=<id>` pré-seleciona contato. **Aceite:** teste.
- [ ] **CT-56** — Fechamento F: PR mergeada; smoke em produção. **Aceite:** CI verde.

## FASE 6 — Abas, tela principal e estados (CT-57–CT-66)
*Bloco G — 1 PR de front.*

- [ ] **CT-57** — Aba "Enviados": `TalkXTable` sobre `catalog_send_events` (produto, contato, agente, modelo, fotos,
  status, data) + filtros + export CSV (CT-20); contagem nas 3 abas; deep link `?tab=`. **Aceite:** teste RTL; URL
  reflete a aba.
- [x] **CT-58** — Abas com `DashboardTabs` (reuso) em vez de `Tabs` cru, se o componente aceitar 3 itens sem mudança;
  senão manter e registrar. **Aceite:** decisão na §10.
  **✅ DECISÃO (01/10/2026): manter o `Tabs` cru do shadcn — `DashboardTabs` NÃO serve (medido).** Ele renderiza
  `{label}` e **nenhum `children`** (`src/components/dashboard/overview/DashboardTabs.tsx:40-41`), então reusá-lo
  **apagaria silenciosamente** os 3 badges `TabCount` do gerenciador (`ExternalProductManagement.tsx:599`, `:604`,
  `:611`), sem erro nenhum; e ele **não é** provider `Tabs` (é montado **dentro** de um `<Tabs>` externo em
  `DashboardView.tsx:151-152`), logo trocar o `<Tabs>` quebra o contexto Radix. Ainda arrastaria o estilo do dashboard
  para o catálogo. **Nenhum código das abas foi alterado.** Justificativa completa na §10.
- [x] **CT-59** — Estados de erro por código da edge: `CATALOG_UPSTREAM_ERROR` → `TalkXDataUnavailableState`
  ("Catálogo PromoGifts indisponível" + Tentar de novo); `CATALOG_NOT_CONFIGURED`/`CREDENTIALS_INVALID` → estado
  para admin com o código; 429 → toast "Muitas requisições, aguarde 1 min" + botões desabilitados 10 s. **Aceite:**
  **✅ FEITO — provado em 01/10/2026.** O front **descartava** o `code` (`useExternalCatalog.ts:154-161` fazia
  `throw new Error(error.message)`); agora `CatalogEdgeError` preserva `code`+`status` e o hook expõe `errorCode`/`errorStatus`.
  Estados: `CatalogErrorState` em `catalogShared.tsx:610-655`; cooldown de 429 em `catalogShared.tsx:570-604` (toast + botões
  desabilitados 10 s) e `retry` do react-query desligado quando o código é de rate limit. Testes: `useExternalCatalog.test.ts:1206-1319`
  (6 casos por `error.code`, incluindo a prova de que **não houve retry** no 429) + RTL nos dois componentes.
  **Divergências medidas (registradas):** (1) o código real é `CATALOG_CREDENTIALS_INVALID`, não `CREDENTIALS_INVALID` como o
  plano escreve; (2) a edge devolve **429 sem `code`** — o front **sintetiza** `CATALOG_RATE_LIMITED` a partir do status e
  documenta isso no tipo (linhas 153-158); (3) o texto literal "Catálogo PromoGifts indisponível" dentro de
  `TalkXDataUnavailableState` exigiria editar `talkxShared.tsx` (fora do escopo desta etapa) — foi usado
  `what="O catálogo PromoGifts"` + botão "Tentar de novo" externo, e o título literal aparece no estado de admin.
  **Achado grave corrigido:** existia um teste que **afirmava o falso** ("no rate limiting on edge function") quando a edge
  tem `checkRateLimit` por `user_id` com `RATE_LIMIT=60/60 s`; agora o teste **lê o código real da edge** e afirma o comportamento real. **Aceite cumprido:** teste por `error.code` com os 4 casos (e mais 2).
- [ ] **CT-60** — Barra de filtros: select de categoria em árvore (raiz semibold, filhos indentados) com contagem;
  select de fornecedor com contagem (sem logo — 0 fornecedores têm `logo_url`, achado E25). **Aceite:** teste RTL.
  **🟡 PARCIAL — 01/10/2026: metade fechada e provada; a outra metade é impossível com o dado atual.**
  **Categoria: FEITO.** Árvore com contagem em `ExternalProductCatalog.tsx:215-260` (raiz `:226`, filho indentado `:230`)
  e `ExternalProductManagement.tsx:456-500` (`:467`/`:471`), usando o `products_count` **real** do `ExternalCategory`
  (`useExternalCatalog.ts:22`, que já vem no `bootstrap`). Rótulos "Brindes (42)", "Canecas (7)"; sem contagem o helper
  `countLabel` (`catalogShared.tsx:566-568`) devolve o nome puro — **nunca inventa número**. Testes RTL nos dois componentes
  + `catalogShared.test.tsx:528-605`.
  **Fornecedor: NÃO FEITO — prova da impossibilidade** (não é pendência de execução): (1) `ExternalSupplier`
  (`useExternalCatalog.ts:26-35`) **não tem** campo de contagem; (2) a edge devolve só `SUPPLIER_FIELDS`
  (`id, name, trading_name, logo_url, is_product_supplier, low_stock_threshold`) — nenhum agregado; (3) a consulta de produtos
  é paginada/filtrada, então somar no cliente daria **número falso** (só a página atual); (4) não existe RPC nem tabela de
  contagem por fornecedor. Pela regra do plano ("nada morto") e por não se inventar número, os options ficaram **sem contagem**,
  com a razão comentada no código (`ExternalProductCatalog.tsx:239-254`, `ExternalProductManagement.tsx:480-497`).
  **Para fechar:** agregado de fornecedor na edge/PromoGifts (`suppliers.products_count` ou RPC) — sistema **externo**,
  logo depende da decisão pendente sobre DDL no PromoGifts. Fecha em 1 linha quando existir: `countLabel(s.name, s.products_count)`.
- [x] **CT-61** — Atalhos: `/` foca a busca, `Esc` limpa, `⌘F` foca. **Aceite:** teste RTL.
  **✅ FEITO — provado em 01/10/2026.** Atalhos nas **duas** telas: a página (`ExternalProductManagement.tsx`, input
  com `ref` e listener em `~:674-705`) e o Sheet do chat (`ExternalProductCatalog.tsx`, input com `ref` e listener em
  `~:185-214`, ativo **só com o dialog aberto** via `if (!isOpen) return`). `/` e `Ctrl/Cmd+F` focam a busca; `Esc`
  limpa. **O trap do `Cmd/Ctrl+F` nativo foi tratado:** o listener é de **captura** no `window` e chama
  `event.preventDefault()` **antes** de focar — sem isso o "localizar" do browser abre e o app nem recebe o evento.
  `/` é ignorado quando o alvo é `INPUT`/`TEXTAREA`/`contenteditable` (não rouba o foco de quem digita). Prova em
  `__tests__/CT61_62_65_catalogFilters.test.tsx:236-331` (7 casos): o de `Cmd+F` **dispara o evento no `window` e afirma
  que o `preventDefault` foi chamado** (`:251` e `:296`), o de `/` dentro de input afirma `defaultPrevented === false`
  (`:288`), e o Sheet fechado não intercepta (`:322`).
- [x] **CT-62** — `ExternalProductManagement.tsx`: filtros em `useReducer` único (a reescrita adiada na E06), zerar os
  4 `eslint-disable` e os `useEffect` de sincronização. **Aceite:** `grep -c eslint-disable` = 0 no arquivo;
  lint-ratchet `novas: 0`.
  **✅ FEITO — provado em 01/10/2026.** `grep -c eslint-disable ExternalProductManagement.tsx`: **4 → 0**. Os 10
  `useState` de filtro (search/categoria/fornecedor/onlyInStock/lowStock/isFeatured/isNew/orderBy/ascending/advFilters)
  viraram um `useReducer` (`catalogFilterReducer`, `:195-283`) com ações tipadas e `initialCatalogFilters` (categoria
  da URL, ordenação do sessionStorage). `buildFilters` (`:455`) passou a ler o estado do reducer e os 3 efeitos de
  sincronização o consomem via **`buildFiltersRef`** (`:485-489`, mesmo padrão `doFetchRef` já usado no
  `ExternalProductCatalog`) — sem stale closure e sem a deps instável. **O disable do deep link (`:590` antigo) NÃO era
  de sincronização de filtro:** era do efeito de mount do `?product=&send=1` (CT-55); a supressão foi removida trocando
  a dep real (`fetchProduct`, estável por `useCallback`) — comportamento do deep link preservado (os 6 testes de CT-55
  em `CT55_57_management.test.tsx:227-309` seguem verdes). **Prova:** `CT61_62_65_catalogFilters.test.tsx` — (a) marcar
  "Novidades" → a consulta sai com `is_new: true` (`:176`); (b) "Limpar filtros" → a NOVA consulta sai **sem** `search`
  e **sem** `is_new` (`:190`). **Prova por mutação:** trocar o case `isNew` para gravar `isFeatured` derruba os testes
  (a) e CT-65 do chip; revertido com `patch` byte-idêntico. Suíte do módulo: **19 arquivos, 399 testes passando**;
  `eslint` 0 problemas; `typecheck` exit 0.
- [ ] **CT-63** — `Date.now()` fora do render (`ExternalProductManagement.tsx:54`, `SendProductDialog.tsx:147`) —
  inicializador de estado ou `useMemo` com `key`. **Aceite:** `grep "Date.now\|Math.random" src/components/catalog
  --include=*.tsx` (fora de testes) = 0.
- [ ] **CT-64** — Filtro "Novidades" = `is_new OR created_at > now()-30d` (`new_or_recent` na edge) — deploy.
  **Aceite:** contagem bate com `new_30d` do stats.
- [x] **CT-65** — Chip de estado acima da grade quando filtro de flag ativo ("Mostrando só Novidades · limpar").
  **Aceite:** teste RTL.
  **✅ FEITO — provado em 01/10/2026.** Chip `data-testid="catalog-flag-chip"` renderizado **acima da grade**
  (`ExternalProductManagement.tsx:924-943`, logo antes do `<div ref={gridRef}>`), com o texto "Mostrando só Novidades
  · limpar" e botão que despacha `{ type: 'isNew', value: false }`. **Guiado pelo `isNew` específico, não por
  `hasFilters`** (que agrega busca textual/categoria/fornecedor — o chip apareceria só com uma busca digitada). Não se
  tocou no bloco "Mostrando X–Y de Z" (é o contador de paginação). Testes em
  `CT61_62_65_catalogFilters.test.tsx:214-235`: aparece/desliga com a flag e **não** aparece só com busca textual.
- [ ] **CT-66** — Fechamento G: PR mergeada; `PARIDADE.md` seção "Topo" e "Grade" com prints 1920/1440/1280.
  **Aceite:** prints commitados.

## FASE 7 — Acessibilidade e performance (CT-67–CT-76)
*Bloco H — 1 PR de front.*

- [ ] **CT-67** — `jest-axe` no vitest para `CatalogProductCard`, `CatalogAdvancedFilters`, `ProductDetailDialog`,
  `SendProductDialog`, `ContactSelectionStep`: 0 violações sérias. **Aceite:** 5 testes verdes.
- [x] **CT-68** — `aria-live` para contagem de resultados e progresso de envio; foco visível (`--ring`) em cards,
  chips, thumbs, radios; `Esc` fecha e o foco volta ao gatilho. **Aceite:** teste RTL de foco.
  **✅ FEITO — 01/10/2026.** (a) **Anúncio da contagem:** `ExternalProductCatalog.tsx:499` virou região viva
  (`role="status"` + `aria-live="polite"`, `data-testid="catalog-result-count"`). Sem debounce próprio de propósito: a
  contagem só muda quando `totalProducts` volta do fetch, que já é debounced em 300ms no efeito de filtros — digitar
  não gera um anúncio por tecla, só o do resultado.
  (b) **Progresso de envio:** `SendProductDialog.tsx:548` (fluxo do chat, com `presetContact`) e
  `ContactSelectionStep.tsx:270` (fluxo com passo de contato — o `isSending` NÃO troca de passo, então o anúncio tem
  de estar lá e não no rodapé): `sr-only`, `role="status"`, `aria-live="polite"`.
  (c) **Anel de foco:** constante única `CATALOG_FOCUS_VISIBLE` (`catalogShared.tsx:43`) =
  `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background` — só tokens, zero cor literal — aplicada em
  card da grade e da lista, botão de favorito e checkbox (`CatalogProductCard.tsx`), chips de categoria/tags
  (`catalogShared.tsx`), thumbs da galeria, swatches e variações de cor e botões do detalhe (`ProductDetailDialog.tsx`),
  botões do envio (`SendProductDialog.tsx`, `ContactSelectionStep.tsx`, `CatalogBulkSendDialog.tsx`,
  `CatalogAdvancedFilters.tsx`) e do rail (`CatalogRail.tsx`).
  (d) **`Esc` fecha e o foco volta ao gatilho:** já vinha pronto do Radix (`Dialog`/`Sheet`) — NÃO reimplementado.
  **Decisão de tabulação (mudança de comportamento real):** NENHUMA parada de tabulação nova. O anel entrou só onde o
  elemento **já** era interativo: o card da grade e o da lista já tinham `tabIndex={0}` + Enter/`e` (CT-25) e todo o
  resto é `<button>`.
  **Dívida do CT-67 paga de quebra:** os 3 achados `button-name` que o teste do CT-67 marcava como vermelho-proposital
  são destas duas tarefas e ficaram verdes — thumbs do strip com `aria-label="Ver imagem N de M"`
  (`ProductDetailDialog.tsx:204`; o `<img alt="">` CONTINUA vazio, é decorativo) e o trigger do split-button com
  `aria-label="Mais ações de envio"` (`SendProductDialog.tsx:563`). `CT67_a11y.test.tsx`: **6/6**.
  **Testes:** `CT68_acessibilidade.test.tsx` (novo, 6 casos) + caso novo em `SendProductDialog.test.tsx`.
  **Prova por mutação:** tirar `aria-live="polite"` do span derruba o caso 1
  (`toHaveAttribute("aria-live","polite")` → `null`), 5/6; revertido com patch idêntico, **6/6** de novo.
- [ ] **CT-69** — `alt` descritivo (nome + cor) em todas as imagens; contraste dos badges ≥ 4,5:1 nos 3 temas (tabela
  em `docs/catalogo/CONTRASTE.md`). **Aceite:** tabela commitada.
  **◐ PARCIAL — 01/10/2026: a metade dos `alt` está FEITA; o contraste dos badges NÃO atinge 4,5:1 e NÃO foi
  corrigido (cor de badge é decisão de produto). Por isso o item fica aberto.**
  (a) **`alt` FEITO.** Helper único `productImageAlt(name, color)` = `"Nome — Cor"` (`catalogShared.tsx:52`), com
  `singleProductColor` (`catalogShared.tsx:63`) para a capa: só devolve cor quando o produto tem EXATAMENTE uma cor
  nomeada (em produto multi-cor a capa não é de uma cor e rotulá-la com a 1ª descreveria errado a foto). Aplicado em
  `CatalogProductCard.tsx` (capa da grade :369 e thumb da lista :286), `ProductDetailDialog.tsx` (imagem principal
  :156, zoom :220, foto da variação agrupada :572) e `SendProductDialog.tsx` (card do produto :377, foto da variação
  :426, seletor de fotos :470). O **`alt=""` decorativo do strip de miniaturas CONTINUA VAZIO** de propósito
  (`ProductDetailDialog.tsx:211`): o nome acessível desses botões vive no `aria-label`, e repetir o nome do produto a
  cada thumb seria ruído de leitor de tela.
  (b) **Contraste MEDIDO e NÃO atingido.** `docs/catalogo/CONTRASTE.md` (novo) tem a tabela de 9 badges × 4 temas com o
  par REAL — as cores hardcoded foram lidas do **CSS emitido no build** (`dist/assets/index-*.css`), não da doc do
  Tailwind — a fórmula WCAG 2.1 e a fonte de cada valor. Resultado: **13 dos 24 pares abaixo de 4,5:1**.
  Novo/Top/Promo = **2,54 / 2,80 / 3,67** (texto `--primary-foreground`, branco em 3 dos 4 temas, sobre
  `emerald-500`/`orange-500`/`rose-500` crus — o fundo não acompanha o tema; só passam em "escuro + alto contraste",
  onde o token vira preto); estoque baixo no claro e no alto contraste = **3,07**; previsão de entrada no claro e no
  alto contraste = **3,19**. Os 3 badges de destaque ficam até abaixo de 3:1 (WCAG 1.4.11). Nenhuma cor foi alterada —
  o achado ficou registrado no CONTRASTE.md para decisão de produto.
  **Testes:** `CT69_alts.test.tsx` (novo, 8 casos: helpers + capa de 1 cor × multi-cor + o alt acompanha a cor
  escolhida no detalhe + `alt=""` preservado nas thumbs + foto da variação agrupada).
- [x] **CT-70** — `useReducedMotion` em todo componente animado do módulo (grep `motion.` × `useReducedMotion`).
  **Aceite:** cada arquivo com `framer-motion` importa `useReducedMotion`.
  **✅ FEITO — provado em 01/10/2026.** Os 3 arquivos animados que faltavam importam e **chamam** `useReducedMotion`, e com a
  flag ligada nada anima (`initial`/`animate`/`exit` → `false`/`undefined`, `layout={!prefersReducedMotion}`), renderizando o
  estado final — mesmo padrão já usado em `catalogShared.tsx` (FavoriteButton): `ExternalProductCatalog.tsx` (import `:22`;
  wrapper do grid + wrapper por card), `ExternalProductManagement.tsx` (import `:34`; ModuleHeader + 2 spots do grid) e
  `WhatsAppTemplatesManager.tsx` (import `:11`; os dois `motion.tr`).
  **Prova forte:** o aceite deixou de depender de inspeção manual — o teste-contrato novo `CT70_reducedMotion.test.tsx`
  **varre `src/components/catalog/*.tsx` e falha** se algum arquivo animado importar `framer-motion` sem o hook ou sem a
  chamada; além disso cada arquivo tem par de asserções "sem redução → opacidade 0 no 1º paint" / "com redução → já no estado
  final" (teste não-vácuo). Nota de setup registrada: `vi.mock('motion-dom')` **não** intercepta — só
  `vi.mock('framer-motion')` com `importOriginal`, porque `useReducedMotion` lê um singleton de `prefersReducedMotion`.
  Suíte do módulo: **243 testes passando** (12 arquivos); `typecheck` exit 0; `eslint` 0; `lint-ratchet novas: 0`.
- [x] **CT-71** — Modais `React.lazy` (`ProductDetailDialog`, `SendProductDialog`, `CatalogAdvancedFilters`,
  `CatalogBulkSendDialog`); `recharts` só no rail (lazy). **Aceite:** `vite build` mostra chunks separados.
  **✅ FEITO — 01/10/2026.** Os 4 modais entraram por `lazy()` em **ESCOPO DE MÓDULO** — a regra
  `react-hooks/static-components` rejeita `React.lazy` dentro do corpo do render (é a mesma razão documentada em
  `catalogShared.tsx`) — com `<Suspense>` no ponto de uso, no padrão de `src/pages/Index.tsx`:
  `ProductDetailDialog` (`CatalogProductCard.tsx:22`, os 2 pontos de uso do card), `SendProductDialog` +
  `CatalogBulkSendDialog` (`ExternalProductCatalog.tsx:32,38`), `SendProductDialog` (`CatalogFavoritesTab.tsx`) e
  `SendProductDialog` + `CatalogAdvancedFilters` + `CatalogBulkSendDialog` (`ExternalProductManagement.tsx`).
  Fallback: `CatalogDialogFallback` (`catalogShared.tsx:81`, spinner curto só com tokens, `role="status"`) nos modais
  montados sob demanda; `fallback={null}` nos que já nascem montados e fechados (o `ProductDetailDialog` de cada card e
  os modais de estado da gestão) — assim nenhum card pisca spinner antes de o chunk resolver.
  **Aceite provado de verdade (a armadilha do `vendor-charts` foi evitada):** antes existia **1** chunk de modal
  (`CatalogBulkSendDialog 77,56 kB`); depois existem `ProductDetailDialog 17,94 kB`, `SendProductDialog 16,97 kB`,
  `CatalogAdvancedFilters 3,14 kB` e o próprio `CatalogBulkSendDialog` **caiu para 5,10 kB** (o que ele carregava junto
  foi embora). `vendor-charts` (458,51 kB) é grupo do `vite.config.ts:100` e ficou **idêntico** antes/depois — não
  serve de prova. Saída crua dos dois builds em `docs/catalogo/PERF.md`.
  **`recharts` só no rail:** já estava satisfeito — `CatalogRail.tsx:12` é o único consumidor no catálogo e
  `vendor-charts` tem **0** ocorrências em `dist/index.html`.
  **Testes ajustados (lazy não é síncrono):** `CT28_bulkBar`, `ExternalProductCatalog` e `SendProductDialog` passaram a
  aguardar o chunk (`findByTestId`/`await` em vez de `getByTestId` síncrono) — sem perder asserção nenhuma.
- [x] **CT-72** — `sizes` por breakpoint no `ProductThumb`, `fetchpriority="high"` nas 4 primeiras capas,
  `content-visibility: auto` nos cards abaixo da dobra. **Aceite:** Lighthouse LCP < 2,5 s (4G simulado).
  **✅ CÓDIGO FEITO E VERIFICADO — 01/10/2026 (o número de Lighthouse tem ressalva, ver abaixo).**
  (a) **`priority` nas 4 primeiras capas** da grade (`ExternalProductCatalog.tsx:361` → `priority={index < 4}`), que vira
  `loading="eager"` + `fetchpriority="high"` no `<img>`; as demais seguem `lazy`.
  (b) **`sizes` sempre presente** no thumb da grade, com degraus **medidos no Chrome** (largura computada real do `.catalog-card`:
  390px→171, 768px→235, 1024px→236, 1280px→172/219, 1440px→204/259). O degrau novo de **1024px (25vw)** é o ganho real: o default
  antigo não tinha tier nessa faixa e pedia a variante de 400w (11,1 KB) onde a de 300w (7,3 KB) bastava.
  (c) **`content-visibility: auto`** via `.catalog-card--offscreen` (`src/styles/components.css`, logo após `.catalog-card`), com
  `contain-intrinsic-size: auto 320px` (o keyword `auto` faz o placeholder usar a altura real depois do 1º render) aplicada
  **só nos cards abaixo da dobra** — as 4 primeiras ficam sem, para não encostar no elemento de LCP. **CLS medido = 0.**
  **Lacuna que o executor sinalizou e o orquestrador fechou:** a grade da página de **gestão** não conseguia propagar `priority`
  (o wrapper `ExternalProductCard.tsx` não repassava). Fechado por mim: `priority`/`sizes` adicionados à interface e repassados no
  wrapper, e `ExternalProductManagement.tsx:622-636` passa `priority={index < 4}` (o `map` ganhou o `index`).
  **⚠️ O aceite "Lighthouse LCP < 2,5 s (4G simulado)" NÃO está provado — e eu não o declaro cumprido.** Não é possível medir a
  página autenticada neste ambiente (a view exige sessão Supabase; o executor **se recusou, corretamente**, a usar credencial de
  conta). O que existe é um harness com o HTML real do card + o CSS de produção: LCP 2,3 s, CLS 0 — mas nele `LCP == FCP` e o
  elemento de LCP é o **texto**, não a imagem, então **isso mede o harness, não o app**. O que está provado em **Chrome real**
  (não jsdom) é o mecanismo: das 24 `<img>`, exatamente 4 saem `eager`+`fetchpriority=high`, 20 saem `lazy`, 20 carregam a classe
  offscreen e o atributo `sizes` emitido é o esperado. **Para fechar:** Lighthouse em `/?view=catalog` **autenticado**, 4G simulado.
  Testes: `CT72_imagens.test.tsx` (10 casos) + extensões em `ExternalProductCatalog.test.tsx` (confirma `['true','true','true','true','false','false']`); suíte do módulo **243 testes passando**.
- [ ] **CT-73** — Payload de `list_products compact` medido (< 30 KB por página de 24) — se passar, cortar campos.
  **Aceite:** medição em `PERF.md`.
- [ ] **CT-74** — Lighthouse perf ≥ 90 na view em 4G; CLS < 0,05. **Aceite:** relatório em `PERF.md`.
- [x] **CT-75** — Bundle: `vite build --report`; inicial ≤ 336 KB (não regredir o #443). **Aceite:** número em `PERF.md`.
  - ⚠️ **Correção de 01/10 (pós-CI):** a medição antes registrada (4098,7 KB / OK) era de uma árvore **intermediária** e estava errada. Números verdadeiros, medidos com o mesmo ambiente do CI: **4091,3 KB** antes do CT-71 (passa, folga de 8,7 KB) e **4101,2 KB** com o CT-71 (**estoura 1,1 KB** contra o teto de 4100 KB do `total-assets`). O custo do CT-71 é **+9,9 KB de overhead estrutural de split** (zero código novo, zero duplicação — o mesmo código passando a viver em 7 streams de gzip). Cortes dentro do catálogo somam no máximo 0,45 KB. **O check obrigatório 🏗️ Build do CI está vermelho por isso** e a saída depende de decisão do Joaquim.
  **✅ FEITO — 01/10/2026, com 1 ressalva de número.** Medido com `bun run build` (exit 0) +
  `node scripts/ci/bundle-budget.mjs` (exit 0): **JS inicial = 336,3 KB gzip** em 13 chunks; CSS inicial 40,0 KB
  (budget 80); maior chunk JS 492,3 KB gzip (budget 550); assets totais 4098,7 KB gzip (budget 4100). Tudo em
  `docs/catalogo/PERF.md` com a saída crua.
  **Os três números se confundem — e o que vale é isto:** o **limite VIVO** é **341 KB**
  (`performance-budget.json:4`, é o que o CI checa e ele passou). O **336** do plano NÃO é budget: é a **medição de
  2026-09-29** (`docs/catalogo/AUDITORIA_CATALOGO_2026-09-29.md:111`, etapa E40) que o plano promoveu a teto ("não
  regredir o #443"). O **350** só existe em **comentários**, como histórico (`vite.config.ts:71,88` e
  `catalogShared.tsx:453`: "estourou o budget de 350 KB no PR #415"). E os limites são **gzip**, enquanto o log do Vite
  imprime **raw** (`reportCompressedSize: false`, `vite.config.ts:45`) — comparar log com budget compara unidades
  diferentes.
  **Ressalva honesta:** contra o teto do plano, 336,3 > 336 → **0,3 KB acima** do baseline do #443 (contra o limite
  vivo, 4,7 KB de folga; gate verde). Não é regressão deste bloco: o chunk de **entrada** foi de
  `203,56 kB` para `203,65 kB` raw (**+0,09 kB**, o custo dos wrappers `lazy()/Suspense`) e os modais nunca estiveram
  no grafo inicial — o corte mexeu no **quando** o código baixa, não no tamanho do inicial. O gzip do inicial *antes*
  não foi remedido (`dist/` é sobrescrito a cada build e `git worktree` é bloqueado pelo guard do ambiente); o delta
  raw do entry é a evidência disponível, e está declarada como tal.
  **Nenhum plugin de visualizer foi instalado** (instalar dependência está proibido neste bloco): os números saem da
  saída normal do build + do guard do repo.
- [ ] **CT-76** — Fechamento H: PR mergeada; `PERF.md` e `CONTRASTE.md` commitados. **Aceite:** CI verde.

## FASE 8 — Testes, e2e e ajuda (CT-77–CT-88)
*Bloco I — 2 PRs.*

- [x] **CT-77** — Testes Deno da edge para as 6 ações + `new_or_recent` + rate limit 120/60, com mock do `extClient`;
  incluídos na lista fixa do CI (`deno test`). **Aceite:** job roda `promogifts-catalog/index.test.ts`.
  **✅ FEITO (com 1 ressalva medida) — 01/10/2026.** Seam de teste construído **sem mudar comportamento de produção**:
  `promogiftsCatalogHandler` passou a ser exportado e a aceitar um 2º parâmetro **opcional** `deps {localClient, extClient}`
  (em produção `deps` é `undefined` → caminho idêntico ao de hoje); a criação do client externo virou
  `createExternalCatalogClient(url, key)`, que devolve `null` sem secrets (o 503 `CATALOG_NOT_CONFIGURED` continua igual);
  `Deno.serve(promogiftsCatalogHandler)` virou `Deno.serve((req) => promogiftsCatalogHandler(req))` porque o Deno passa
  `ServeHandlerInfo` no 2º argumento (typecheck quebrava com TS2769). `RATE_LIMIT`/`RATE_WINDOW_MS` exportados com os valores
  **intactos**, para o teste derivar o limite do próprio módulo. Novo `index.actions.test.ts` (390 linhas, **17 testes**:
  as 6 ações + 401/400/503-not-configured + rate limit derivado + PGRST103/42501/404); arquivo acrescentado à lista fixa do
  `deno test` no `ci.yml`; rodando a lista inteira com `--frozen`: **266 testes passando, 0 falhas**; `deno check` exit 0.
  **Ressalvas registradas:** (1) o texto desta etapa cita a ação `new_or_recent`, que **não existe** no `ActionSchema` da edge
  (apenas as 6 ações) — é escopo do **CT-64** (bloco E); (2) a mudança de rate limit **60→120/min é o CT-19** e não foi feita
  aqui, conforme instruído — como o teste deriva de `RATE_LIMIT`, ele passa a valer 120 automaticamente quando o CT-19 mudar.
- [x] **CT-78** — Teste dedicado da lógica de `status` (`sent/partial/failed`) e de `logCatalogSendEvent` (pendência
  admitida na E28). **Aceite:** 3 casos verdes.
  **✅ FEITO — 01/10/2026; prova do `logCatalogSendEvent` CORRIGIDA em 02/10/2026.** Os 3 testes de `status` seguem
  travando o evento logado (`useSendProduct.test.tsx:349-413`, `sent`/`partial`/`failed`). A evidência anterior era
  **FALSA**: o arquivo citado (`useCatalogContactSearch.test.ts`) continha só os testes de **CT-43**
  (`buildContactSearchFilter`/`contactSearchDigits`, 51 linhas) e o `logCatalogSendEvent` **nunca** foi testado de
  verdade — era sempre mockado (`SendProductDialog.test.tsx:40`, `useSendProduct.test.tsx:19`, `CT67_a11y.test.tsx:94`).
  **Corrigido:** o mesmo arquivo agora tem **5 testes da implementação real** (mock só do cliente Supabase, nunca da
  função sob teste): payload snake_case completo, opcionais ausentes → `null`, os 3 `status`, sucesso silencioso (resolve
  `void`, não loga) e falha silenciosa (insert com erro → resolve `void` sem lançar e loga a mensagem). Arquivo:
  **11/11** (5 novos + 6 de CT-43). Comportamento da função: `src/hooks/integrations/useCatalogContactSearch.ts:85`.
- [x] **CT-79** — Cobertura do módulo ≥ 80 % linhas; registrar. **Aceite:** número em `PERF.md`.
  **✅ FEITO — medido em 02/10/2026: 84,41 % de linhas (1235/1463)** → acima de 80 %. **A config vigente do projeto
  exclui o módulo** (`vitest.config.ts:17` limita `coverage.include` a `src/lib/**`+`src/services/**`), então o
  argumento posicional de `vitest --coverage src/components/catalog` filtra os *testes*, não a cobertura. Medido **sem
  editar `vitest.config.ts`**, sobrescrevendo o `include` por CLI:
  `bunx vitest run src/components/catalog --coverage --coverage.include='src/components/catalog/**'`
  (statements 80,56 %, branches 79,77 %, functions 75,88 %). Prova de escopo: o `coverage/lcov.info` tem 20 `SF:`, 0
  fora de `src/components/catalog/`. Detalhes e saída crua em `PERF.md` §CT-79.
- [x] **CT-80** — Suíte do módulo em < 30 s. **Aceite:** tempo registrado.
  **✅ FEITO — remedido em 02/10/2026.** `bunx vitest run src/components/catalog` → **23 files, 426 tests, `Duration
  11.51s` (WALL 11.82 s)** → dentro dos 30 s. Substitui, em `PERF.md`, o registro de CT-27 (14 files/298 tests/9.56s),
  que fica mantido e marcado como **histórico/defasado**.
- [x] **CT-81** — Fixtures E2E: contato de teste já existe (`04dff4dc-…`, "[E2E] Contato de teste"); produto de teste
  fixo (`PO-13153`); `e2e/fixtures/catalog.ts`. **Aceite:** ids no fixture.
  **✅ FEITO (com pendência de produto) — 02/10/2026.** `e2e/fixtures/catalog.ts` criado: reaproveita o contato do
  fixture existente **por import** (`./e2e-contact` → `E2E_FIXTURE_CONTACT_ID`/`..._NAME`/`..._DISPLAY_NAME`, sem
  duplicar o id `04dff4dc-…`) e exporta o que o CT-82 precisa (`E2E_CATALOG_VIEW`/`PATH` = `?view=catalog`, template
  "Informal", tabelas `catalog_send_events`/`messages`, marcador de fixture). **Pendência registrada:** o produto
  `PO-13153` aparece só na doc do repo (`CHANGELOG_CATALOGO.md:12`) e **não foi possível verificar** que existe/is
  buscável no catálogo PromoGifts (sistema EXTERNO) — por isso **não** é fixado cego: é parametrizado por env
  (`E2E_CATALOG_PRODUCT_SKU`) e acompanhado de `E2E_CATALOG_PRODUCT_SKU_VERIFIED` (default `false`); o spec do CT-82
  deve degradar com aviso até a verificação. Nenhum id foi inventado.
- [ ] **CT-82** — `e2e/catalog.spec.ts`: login → `?view=catalog` → busca → card → detalhes → cor → Enviar → fotos →
  Informal → contato E2E → Enviar agora → toast; asserts em `messages`/`catalog_send_events` via API; limpeza
  (`is_deleted`). Habilitado no `e2e-logado.yml`; verificar antes que o usuário de teste enxerga a view. **Aceite:**
  verde nos 3 browsers.
- [ ] **CT-83** — `CatalogHelpSheet.tsx`: "Como usar o catálogo" (5 passos com prints reais) + tour de 4 dicas
  (`localStorage catalog.tourDone`). **Aceite:** teste RTL; só na 1ª visita.
- [ ] **CT-84** — Link "Ajuda" no header do módulo e no dialog do chat. **Aceite:** teste RTL.
- [x] **CT-85** — Textos revisados (acentuação, "Qtd. mínima", "dias úteis") — lista em `PARIDADE.md`. **Aceite:** lista.
  **✅ FEITO — 02/10/2026.** Seção "Textos revisados (CT-85)" em `PARIDADE.md` com a tabela `texto × arquivo:linha ×
  resultado`. **Nenhuma correção foi necessária** — os textos já estavam corretos (`ProductDetailDialog.tsx:435` "Qtd.
  mínima", `:436` "dias úteis", `catalogExport.ts:42` "Qtd. mínima", + `:41` "Prazo" e `sendProductUtils.ts:94`); todos
  marcados como **verificado e correto**, nenhum "corrigido". Varredura das formas sem acento achou ocorrências só em
  **comentários** de código, nenhuma em texto de UI.
- [x] **CT-86** — `CHANGELOG_CATALOGO.md` completado com F6/F7 e correções (#577–#714) e com este plano por bloco.
  **Aceite:** toda PR de `catalog` desde 12/09 citada.
  **✅ FEITO — 02/10/2026.** Acrescentadas as seções **FASE 6 (bloco G)** e **FASE 7 (bloco H)** com as PRs reais
  (#1490 = bloco G; #1500 = bloco H; #1396/#1409 = etapas parciais) + **tabela com 41 PRs de escopo Catálogo** desde
  12/09, enumeradas por `gh pr list --state merged --search "catalogo merged:>=2026-09-12"` (leitura; números/títulos
  copiados, não inventados) — inclui #1396, #1409, #1426, #1467, #1482, #1490, #1500. **Aviso de merge:** o arquivo é
  compartilhado; a edição foi só de acréscimo ao fim; em conflito, conciliar os dois lados.
- [x] **CT-87** — `README.md` do módulo: a referência a `PARIDADE.md` **fica** (o arquivo existe agora) e aponta para o
  caminho certo — [`./PARIDADE.md`](./PARIDADE.md) —, junto com a referência a este plano e à auditoria. **Aceite:**
  nenhum link quebrado.
  **✅ FEITO — provado em 01/10/2026.** `docs/catalogo/PARIDADE.md` criado; `README.md:12` agora linka
  `[\`PARIDADE.md\`](./PARIDADE.md)` (antes era texto sem link, `PARIDADE.md` não existia).
- [ ] **CT-88** — Fechamento I: 2 PRs mergeadas. **Aceite:** CI verde; e2e verde.

## FASE 9 — Paridade, hardening e release (CT-89–CT-100)

- [ ] **CT-89** — `PARIDADE.md` final: tabela por tela (A/B/C/D) mock → implementado → diferença deliberada (carvão,
  Sheet em vez de modal, links externos, placeholders removidos, "Novo Produto" omitido). **Aceite:** 4 telas.
- [ ] **CT-90** — Lista dos itens do mock **não** implementados com motivo (layout 2 colunas B/C, "SUA MARCA AQUI",
  Importar planilha se sem URL, Sincronizar). **Aceite:** seção no `PARIDADE.md`.
- [ ] **CT-91** — RLS testada com 2 usuários reais (agente vê só os próprios envios; supervisor vê todos; favoritos
  isolados). **Aceite:** resultado em `SECURITY.md`.
- [x] **CT-92** — Service key do PromoGifts só em Edge secrets: grep no repo e no bundle de produção. **Aceite:** 0 hits.
  **✅ FEITO — provado em 01/10/2026:** no repositório a service key aparece **apenas como nome de variável**
  (`Deno.env.get("PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY")` em `supabase/functions/promogifts-catalog/index.ts:195`) e como
  `${{ secrets.… }}` em `.github/workflows/deploy-functions.yml:172,234` — **nenhum literal**. No **bundle de produção**:
  13 chunks JS baixados de `https://zapp-web-v2.vercel.app` e greppados → **0 hits**.
  Observação (achado pré-existente, fora do escopo): há JWTs literais versionados em `src/integrations/supabase/client.ts:14`,
  `.env.production`, `e2e/fixtures/*` e `supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql:22` — verifiquei o
  campo `role` de cada um **sem imprimir o token**: todos são `role=anon ref=tnnnlkbymytvtqngbbqh`, ou seja a **anon key**
  (pública por desenho, protegida por RLS), **não** a service key.
- [ ] **CT-93** — Sentry: breadcrumbs `catalog.*` (abrir, filtrar, enviar) e alerta `CATALOG_UPSTREAM_ERROR` > 5/min.
  **Aceite:** alerta criado; breadcrumb visível num evento de teste.
- [ ] **CT-94** — Rate limit testado em produção (61 × `bootstrap` → 429) e a UI de CT-59 reage. **Aceite:** print.
- [x] **CT-95** — Logs da edge sem PII (grep `console.log` por telefone/nome). **Aceite:** revisão registrada.
  **✅ FEITO — revisão em 01/10/2026:** `grep -n "console\." supabase/functions/promogifts-catalog/index.ts` → **nenhuma
  ocorrência**: a edge de catálogo não emite log nenhum (portanto nenhum telefone, nome ou credencial é logado). Revisão
  registrada aqui; se logs forem adicionados no futuro, a regra é não incluir PII (telefone/nome/credencial).
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

### CT-58 — `DashboardTabs` não serve para as abas do gerenciador (medido em 01/10/2026, bloco G)

O plano sugeria reusar `DashboardTabs` nas 3 abas do `ExternalProductManagement` **se o componente aceitasse 3 itens sem
mudança**. **Não aceita — e o motivo é estrutural, não estético:**

| Achado | Evidência | Consequência de reusar |
|---|---|---|
| `DashboardTabs` renderiza só `{label}` + ícone: **não recebe nem renderiza `children`** | `src/components/dashboard/overview/DashboardTabs.tsx:40-41` | os **3 badges `TabCount`** do gerenciador (`ExternalProductManagement.tsx:599`, `:604`, `:611`) **sumiriam sem erro** — o contador de produtos/favoritos/envios sai da UI |
| **Não é** provider `Tabs` do Radix: é um `<TabsList>` montado **dentro** de um `<Tabs>` externo | `src/components/dashboard/DashboardView.tsx:151-152` monta o `<Tabs>` e passa o `<DashboardTabs>` | substituir o `<Tabs>` do gerenciador quebraria o contexto Radix (`TabsTrigger`/`TabsContent` exigem o provider) |
| Arrasta o estilo do dashboard | leitura do componente | o catálogo perderia o visual atual das abas, sem ganho funcional |

**DECISÃO: manter o `Tabs` cru do shadcn** em `ExternalProductManagement.tsx:594-1027` (o array de abas "aceita 3 itens"
no sentido de dados, mas o **componente** do dashboard não serve). Nenhuma linha das abas foi alterada por causa do
CT-58 — o aceite da etapa ("decisão na §10") está cumprido por este registro.

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

*Plano criado em 2026-09-29 a partir de `AUDITORIA_CATALOGO_2026-09-29.md`. Execução iniciada em 01/10/2026: as etapas
fechadas têm evidência ao lado do checkbox (ver também o mapa de PRs na §11).*
