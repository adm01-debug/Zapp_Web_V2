# Arquivos do Chat Panel — Plano de redesign em 50 etapas (revisão do plano do Codex)

**Data:** 01/10/2026.

**Status:** plano aprovado para execução. As quatro decisões de negócio (D1–D4, seção 5) foram tomadas pelo Joaquim em 01/10/2026; não há pergunta pendente. As 50 etapas estão pendentes de execução. Este commit contém somente o documento.

**Base consultada:** `adm01-debug/Zapp_Web_V2` em `762c7c2` (branch desta sessão, a partir de `main`) e `adm01-debug/Promo_Gifts_V4` em `92690bd8` (clone raso, leitura). Nenhuma das duas bases foi alterada. Nenhum cenário abaixo foi executado ou validado.

**Escopo:** aba **Arquivos** do painel central do inbox (`src/components/inbox/tabs/FilesTab.tsx` e dependentes). Objetivo: reproduzir no chat o padrão de operação do catálogo do Promo Gifts V4 — botão **Layout** (Grid / Lista / Tabela + colunas 3·4·5·6·8) e botão **Selecionar** — sem transportar as regras comerciais do catálogo.

**Documento revisado:** `PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_ZAPP_WEB_V2_50_ETAPAS.md` (plano do Codex, enviado pelo Joaquim). A seção 1 lista o que ele acertou, o que faltou e o que estava errado, com a evidência de código correspondente. As seções seguintes são o plano refeito.

---

## 1. Auditoria do plano do Codex

### 1.1 O que o Codex acertou e este plano mantém

- A direção central: um explorador de mídias com três modos compartilhando os mesmos dados, filtros, ordenação, seleção e ações (Codex 03, 04, 12, 25).
- Separar categoria (Todos/Imagens/Vídeos/Áudios/Docs) de modo de exibição (Codex 08).
- Preferência de colunas ≠ capacidade momentânea (Codex 15).
- Seleção por ID estável, não por índice (Codex 32).
- Não copiar o reset diário de defaults do catálogo (`dailyCatalogDefaults`, Codex 37).
- O achado do `onForward={() => {}}` em `FilesTab.tsx:162` (Codex 25 da tabela / etapa 41).

### 1.2 Falhas e lacunas encontradas (com evidência)

| # | Achado | Evidência | Consequência no plano |
|---|---|---|---|
| G1 | **Encaminhar não existe em lugar nenhum do ZAPP.** O Codex (etapa 41) manda "reaproveitar o serviço de envio já usado pelo chat". Não há tal serviço: o handler do próprio chat também é um stub. | `src/components/inbox/chat/useChatPanelHandlers.ts:125` — `handleForwardToTargets` só faz `log.debug(...)`. O diálogo chama `onForward`, fecha e mostra "Mensagem encaminhada". | Encaminhar vira **nova funcionalidade** com envio real pela Evolution GO (custo, risco antispam). Entra como PR própria (PR G). **Decidido (D1, 01/10): sim, com limite de 10 destinos × 10 arquivos por lote.** |
| G2 | **O ZAPP já tem Grid/Lista/Tabela com seletor de colunas** no módulo Contatos. O Codex ignora e manda portar tudo do Promo Gifts. Resultado seria dois controles de "Layout" diferentes no mesmo produto. | `src/components/contacts/ContactViewSwitcher.tsx` (segmentado Cards/Lista/Tabela + menu "Colunas" 3·4·5·6), `ContactContentArea.tsx:17-20` (mapa de classes por colunas), `ContactsTable.tsx:55` (`SortableHeader`), `ContactListItem.tsx:32` (linha `h-16`). | O **modelo de interação** é o do Promo Gifts (pedido do Joaquim: popover Layout + Selecionar), mas o **vocabulário visual** (altura de linha, cabeçalho ordenável, mapa de colunas, tokens) é reaproveitado de Contatos. Unificar os dois controles num componente só fica em "Próximos passos". |
| G3 | **Mensagem "excluída" continua na galeria.** A exclusão só marca `is_deleted = true` e mantém `media_url`; o hook da galeria não filtra `is_deleted`, e o RPC de contagem da aba também não. Pelo código, após o toast "Mensagem removida" e o refetch, o item volta a aparecer. | `FileCard.tsx:39-44` (update), `src/hooks/chat/useContactMedia.ts:52-57` (sem filtro), `supabase/migrations/20260928140200_tab_counts_tasks_own.sql:41-44` (`files_total` sem filtro). | Confirmar ao vivo na etapa 01. Correção na etapa 09 (hook) e 42 (RPC, que é DDL → fluxo de migration e PR aberta para o Joaquim). |
| G4 | **Política de mídia incoerente.** "Baixar" está bloqueado por `notifyDownloadBlocked`, mas "Copiar link" copia a URL **assinada** (válida 1 h) e o visualizador tem "abrir em nova aba" com a mesma URL; o `<audio>` não tem `controlsList="nodownload"` (o `<video>` tem). O Codex (42) cita, mas não força decisão. | `FileCard.tsx:28-35`, `FileDetailPanel.tsx:25-32`, `MediaPreviewDialog.tsx:36-40,52-53`. | **Decidido (D2, 01/10): política fechada** — sem "Copiar link" e sem "abrir em nova aba"; o plano aplica isso nos três modos e no visualizador, não "remove um botão". |
| G5 | **Custo real de abrir a aba é 1 assinatura de URL por arquivo**, não renderização. Cada `FileCard` chama `useResolvedStorageUrl` → até 200 `createSignedUrl` numa abertura. O Codex (46) propõe avaliar virtualização, que não resolve isso e é desnecessária com o teto de 200. | `FileCard.tsx:26`, `useResolvedStorageUrl.ts:48-57`, `useContactMedia.ts:57` (`limit(200)`). `@tanstack/react-virtual` já é dependência (`package.json:65`), mas o uso correto aqui é outro. | Etapa 10: assinar em **lote** no hook (`createSignedUrls`) e carregar miniaturas por visibilidade. Sem virtualização. |
| G6 | **Capacidade de colunas nunca foi calculada.** O Codex manda "medir o contêiner" sem dizer o que cabe. Medido pelo código: sidebar 256 px (64 colapsada), conversas 350 px, detalhes do contato 323 px (colapsável), padding do painel 16+16. | `docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md` (`--sidebar-w 256px`, `64px`), `ConversationListSidebar.tsx:115`, `ContactDetails.tsx:99`, `ConversationTabContent.tsx:34` (`p-4`). | Tabela de capacidade na seção 3. Conclusão: as 5 opções (3·4·5·6·8) **são** alcançáveis em 1920×1080, mas só com cálculo por contêiner — `window.innerWidth` (Promo Gifts) daria 8 colunas num painel de 959 px. |
| G7 | **Não há infraestrutura para container queries.** O Codex sugere consultas de contêiner; o Tailwind do ZAPP só tem `tailwindcss-animate`, não existe hook de medida, e o `ResizeObserver` só é stubado num mock específico, não no setup global do Vitest. | `tailwind.config.ts:429`, busca por `useResizeObserver|useElementSize` em `src/hooks` vazia, `src/test/volumeControlMocks.ts:26-29`. | Etapa 07 cria o hook de medida; etapa 46 cobre o stub de teste. Sem plugin novo de Tailwind (classes literais por mapa, etapa 16). |
| G8 | **Os cartões não são operáveis por teclado hoje.** `FileCard` é um `<div onClick>` sem `tabIndex`/`role`; os botões internos são alcançáveis, mas abrir detalhes não é. O Codex (47) fala em teclado só genericamente. | `FileCard.tsx:49-53`. | Etapa 20 define a estrutura semântica do cartão; etapa 47 verifica. |
| G9 | **`window.confirm` na exclusão**, com `alert-dialog.tsx` já disponível no projeto. Não citado pelo Codex. | `FileCard.tsx:39`, `FileDetailPanel.tsx:35`, `src/components/ui/alert-dialog.tsx`. | Etapa 35. |
| G10 | **Convenção de persistência errada.** O Codex propõe chave "por usuário e organização". O ZAPP não tem conceito de organização; a convenção real é `zapp.<área>.<pref>` e sufixo por usuário quando necessário. | Chaves existentes: `zapp.media.volume`, `zapp.media.muted`, `catalog.view`, `zapp-presence-status:<userId>`. | Etapa 06: `zapp.inbox.files.view:<userId>` versionada. |
| G11 | **Contagens divergentes.** Chips vêm da lista capada em 200 e incluem apagadas; o badge da aba vem do RPC (sem cap, inclui apagadas). Para contato com >200 mídias o chip "Todos" diz 200 e a aba diz outra coisa. O Codex (44) vê o cap, não a divergência. | `useContactMedia.ts:74-80`, RPC acima. | Etapas 14 (texto honesto) e 42 (fonte única de contagem). |
| G12 | **Promo Gifts tem dois clamps inconsistentes e efeito colateral no componente.** `ColumnSelector` limita por 640/900/1100/1280 e grava `localStorage` no clique; `useCatalogState` limita por 768/1024/1280/1536. O Codex nota "limites diferentes" e para aí. | `promo_gifts_v4/src/components/products/ColumnSelector.tsx:47-53,136-150`, `useCatalogState.ts:296-305`. | Um único cálculo (etapa 07) e persistência só no hook (etapa 06). O componente de colunas vira puramente controlado. |
| G13 | **Sem engenharia de entrega.** O Codex não fatia em PRs, não define `data-testid`, não liga às regras do repo (merge = deploy Vercel; DDL só por migration + PR aberta; sem E2E de Arquivos; o contato E2E seedado não tem mídia), e gasta 3 das 50 etapas em "documentar/delimitar". | `CLAUDE.md` seções 1 e 3; `e2e/` sem spec de Arquivos. | Seção 4 (sequência de PRs), seção 5 (decisões), etapa 49 (fixture E2E), etapa 50 (homologação + rollback). |
| G14 | **Pôster de vídeo.** O Codex (26) manda "usar pôster quando houver referência válida". Não existe campo de thumbnail em `messages`; prometer pôster é prometer dado que não há. | `useContactMedia.ts:5-17` (campos), `media_meta` sem contrato documentado. | Etapa 27: primeiro frame via `preload="metadata"` só quando visível; sem pôster inventado. |
| G15 | **"Você" para qualquer agente.** Qualquer mensagem com `sender = 'agent'` vira "Você", mesmo enviada por outro atendente. O Codex (19) cobre; mantido, mas com a restrição real: a query não traz o autor. | `FileCard.tsx:76-77`, `useContactMedia.ts:52`. | Etapa 09: rótulo "Atendente" até existir coluna de autor na consulta; nunca "Você" sem prova. |

### 1.3 Problemas de forma do plano do Codex

- "Aceite" em prosa, sem comando, teste ou medição que prove o critério. Aqui, cada etapa tem um aceite verificável (teste nomeado, medição, request real ou print).
- Etapas 01–03 são preâmbulo (documentar, delimitar, "transpor a arquitetura"); viraram uma etapa de diagnóstico ao vivo com evidência (01) e uma matriz de preservação (04).
- Nenhum ponto de decisão explícito para o Joaquim. Aqui há três (seção 5), apresentados como escolha de negócio.

---

## 2. Resultado pretendido

Na aba Arquivos do chat, o operador encontra a mesma lógica do catálogo do Promo Gifts: barra de ferramentas com busca, ordenação, **Selecionar** e **Layout**; popover Layout com **Visualização** (Grid / Lista / Tabela) e, só no Grid, **Colunas** (3·4·5·6·8). O Grid serve ao reconhecimento visual, a Lista à consulta compacta, a Tabela à comparação por metadados. Trocar de modo não perde filtro, ordenação nem seleção. Abrir detalhes não comprime a galeria. Nenhuma ação anuncia resultado que não ocorreu.

Tudo dimensionado pelo painel central real (não pela janela) e alimentado só pelos arquivos do contato. Nada de carrinho, preço, favoritos, coleções ou orçamento.

---

## 3. Capacidade real de colunas (medida pelo código, a confirmar na etapa 02)

Largura útil do painel central em 1920 px = 1920 − sidebar − conversas (350) − detalhes do contato (323, se aberto) − padding (32). Capacidade = ⌊(largura + 12) ÷ (168 + 12)⌋, com cartão mínimo 168 px e espaçamento 12 px (valores de projeto; validar na etapa 17).

| Laterais | Largura útil | Colunas que cabem | Com painel de detalhes do arquivo lado a lado (−276) |
|---|---|---|---|
| Sidebar expandida + contato aberto | 959 px | 5 | 683 px → 3 |
| Sidebar colapsada + contato aberto | 1151 px | 6 | 875 px → 4 |
| Sidebar expandida + contato fechado | 1282 px | 7 → oferece 6 | 1006 px → 5 |
| Sidebar colapsada + contato fechado | 1474 px | 8 | 1198 px → 6 |

Leitura: as cinco opções do Promo Gifts são legítimas no chat, mas **8 colunas só existe com as duas laterais recolhidas**. Por isso o seletor mostra as 5 opções sempre e desabilita (com motivo) as que não cabem agora, em vez de escondê-las — o operador entende o que precisa recolher para ganhar densidade.

---

## 4. Sequência de entrega (uma PR por fase, cada uma reversível por `revert`)

| PR | Fases | Conteúdo | Merge | Deploy |
|---|---|---|---|---|
| A | 1 | Hooks de estado, capacidade, seleção, dados em lote | Autonomia (front) | Vercel automático |
| B | 2 | Toolbar + popover Layout + Selecionar | Autonomia | Vercel |
| C | 3 | Grid e cartão novos | Autonomia | Vercel |
| D | 4 | Lista e Tabela | Autonomia | Vercel |
| E | 5 | Miniaturas, mídia e visualizador | Autonomia | Vercel |
| F | 6 | Detalhes, barra de seleção, exclusão | Autonomia | Vercel |
| G | 7 | Encaminhar real (D1 decidido: sim, com limite) | Autonomia no front; Evolution já em produção | Vercel |
| H | 8 | Paginação, contagens, realtime | Front: autonomia. **RPC/DDL: PR fica aberta para o Joaquim** (regra 8 do fluxo Git) | Vercel + migration pelo fluxo da seção 1 do `CLAUDE.md` |
| — | 0 e 9 | Diagnóstico, testes, E2E, homologação | Acompanham as PRs acima | — |

Ordem obrigatória: A → B → C → D → E → F; G e H podem entrar depois de F em qualquer ordem. Nenhuma PR mistura assuntos; nenhuma toca `main` direto; branch nova com carimbo de hora por PR.

---

## 5. Decisões de negócio (tomadas pelo Joaquim em 01/10/2026)

| ID | Decisão | Opções consideradas | **Decisão** | Vale para a PR |
|---|---|---|---|---|
| **D1** | Encaminhar arquivos vai existir de verdade? | **Sim**: envio real pela Evolution GO para contatos/grupos, com limite por lote (custo de mensagens, risco de bloqueio antispam se abusado). **Não**: o botão sai da aba e do chat até existir serviço; nada de "Mensagem encaminhada" falso. | **Sim, com limite**: 10 destinos × 10 arquivos por operação, confirmação explícita acima de 20 envios. | G |
| **D2** | Política de link/abertura externa | **Fechada**: sem "Copiar link" e sem "abrir em nova aba"; visualizar só dentro do ZAPP (coerente com o bloqueio de download). **Aberta**: mantém copiar/abrir, assumindo que a URL assinada (1 h) sai do sistema. | **Fechada**: sem "Copiar link", sem "abrir em nova aba"; arquivo só é visto dentro do ZAPP. | C, E |
| **D3** | Densidade inicial do Grid | 4 colunas (recomendado: cabe com todas as laterais abertas e lê bem prints de tabela) ou 5/6 (mais denso, miniaturas de ~160 px). | **4 colunas**; o operador sobe para 6/8 pelo popover ao recolher as laterais. | A, C |
| **D4** | Dados de produção que o plano toca | (a) 1 mensagem de mídia de teste no contato E2E já seedado; (b) migration no RPC `get_conversation_tab_counts` para excluir apagadas. | **Autorizados os dois.** A fixture é DML no contato de teste; a migration segue arquivo → PR → merge → ledger, com a PR H mergeada pelo Joaquim (regra 8 do fluxo Git). | H, 49 |

---

## 6. Não fazer (fora do escopo, mesmo que apareça no caminho)

- Pastas, upload pela aba, favoritos, OCR, classificação por IA, versionamento, ZIP em lote, exclusão em massa.
- Unificar o seletor de Contatos com o de Arquivos (vai para "Próximos passos").
- Reset diário de preferências do catálogo.
- Mexer no Chat montado (`ConversationTabContent.tsx` só muda se a aba Arquivos precisar de contêiner; o bloco `hidden` do Chat fica como está).
- Alterar edge functions. Se o encaminhar (D1) exigir ajuste na edge de envio, é PR separada com deploy por `deploy-functions.yml` + aprovação (merge não deploya edge).
- Trocar o visualizador por outro componente; é ajuste do `MediaPreviewDialog` existente.

---

## 7. As 50 etapas

### Fase 0 — Diagnóstico ao vivo e decisões (sem código de produto)

**01. Confirmar ao vivo os quatro achados de código.** Com o contato Esonic (56 arquivos) em produção: (a) excluir uma mensagem própria e verificar se o item volta após o refetch (G3); (b) contar no painel Network quantas chamadas `.../storage/v1/object/sign/...` uma abertura da aba dispara (G5); (c) clicar Encaminhar, escolher um destino e confirmar que nada chega ao destino (G1); (d) copiar link e abrir numa aba anônima (G4). Registrar os quatro resultados em `docs/design/evidence/arquivos-chat-2026-10/diagnostico.md`. **Aceite:** os quatro itens com resultado observado, não deduzido; se algum não reproduzir, a etapa correspondente deste plano é marcada como "não aplicável" antes de qualquer PR.

**02. Medir as larguras reais do painel central.** Playwright 1920×1080 logado, quatro combinações de laterais (sidebar expandida/colapsada × detalhes do contato aberto/fechado), lendo `getBoundingClientRect().width` do contêiner da aba Arquivos. **Aceite:** tabela da seção 3 substituída pelos números medidos; se a diferença for >24 px em qualquer linha, os limiares de capacidade da etapa 07 são recalculados antes de codar.

**03. Decisões de negócio registradas.** D1–D4 foram apresentadas e decididas em 01/10/2026 (seção 5); nenhuma etapa deste plano depende de resposta futura do Joaquim. Mudar uma dessas decisões depois exige editar a seção 5 e as etapas que a citam no mesmo commit. **Aceite:** cumprida — seção 5 sem coluna "pendente"; etapas 19, 25, 30, 32, 36–40, 42 e 49 escritas no condicional zero.

**04. Matriz de preservação funcional com `data-testid`.** Para cada ação atual (visualizar, baixar-bloqueado, encaminhar, copiar link, excluir, abrir detalhes, filtrar, buscar, ordenar) registrar: componente, handler, estado real (funciona / bloqueado / stub) e o `data-testid` que a versão nova vai expor (`files-toolbar`, `files-layout-trigger`, `files-view-grid|list|table`, `files-columns-N`, `files-select-toggle`, `files-selection-bar`, `files-item-<id>`, `files-detail`). **Aceite:** matriz em `docs/design/evidence/arquivos-chat-2026-10/matriz-preservacao.md`; os testes das etapas 46 e 49 usam só esses ids.

**05. Abrir as branches e verificar sobreposição.** Listar PRs abertas tocando `src/components/inbox/tabs/`, `src/hooks/chat/useContactMedia.ts`, `src/components/inbox/media-gallery/` (em 01/10 não havia nenhuma). Criar a branch da PR A a partir de `main` atualizada. **Aceite:** nenhuma PR aberta com arquivo em comum; se houver, parar e avisar o Joaquim (regra 3 do fluxo Git).

### Fase 1 — Fundação de estado e dados (PR A)

**06. `useFilesViewState`.** Estado único: `viewMode` (`grid|list|table`), `preferredColumns` (3|4|5|6|8) — defaults `grid` e **4** (D3), `sort` (`recent|old|biggest`), `typeFilter`, `search`. Persistir **só** `viewMode` e `preferredColumns` em `localStorage['zapp.inbox.files.view:<userId>']` como `{ v: 1, viewMode, columns }`; leitura com sanitização (valor fora do domínio → default); escrita em `try/catch`; indisponibilidade do storage não quebra a aba. Filtro, busca e ordenação ficam em memória por montagem (a aba desmonta ao sair; restaurar isso é a etapa 38). **Aceite:** teste unitário com storage inválido, storage ausente e troca de usuário no mesmo navegador; nenhuma chave `product-grid-columns`/`catalog-view-mode` lida ou escrita.

**07. `useFilesContainerColumns(ref, preferred)`.** `ResizeObserver` no contêiner do grid (não na janela). `capacity = max(1, floor((width + GAP) / (MIN_CARD + GAP)))` com `MIN_CARD = 168`, `GAP = 12`; `effective = min(preferred, capacity)`; devolve `{ effective, capacity, available: [3,4,5,6,8].map(n => ({ n, fits: n <= capacity })) }`. Debounce por `requestAnimationFrame`. **Aceite:** teste com larguras 683/959/1151/1474 devolvendo 3/5/6/8; redimensionar não altera `preferred`.

**08. `useFilesSelection(items)`.** `selectionMode: boolean`, `selectedIds: Set<string>`, `toggle`, `selectAllVisible(ids)`, `clear`, `exit()` (limpa e sai). Limpa ao sair do modo, ao trocar `contactId` e na desmontagem; **não** limpa em erro de ação. `selectedOutsideFilter = selectedIds − visibleIds` exposto para a barra contextual. **Aceite:** teste: selecionar, trocar filtro, voltar filtro → seleção intacta e contagem "fora do filtro" correta; trocar contato → vazio.

**09. `useContactMedia` honesto.** Adicionar `.eq('is_deleted', false)` (G3). Expor `displayName` (regra: `media_filename` se não for só hash/ID técnico; senão `"<Tipo> · dd/MM HH:mm"`), `extension` (da `media_filename` ou do path), `senderLabel` (`'contact'` → nome do contato; `'agent'` → "Atendente"; nunca "Você" sem coluna de autor — G15). Manter `filename` original para busca e detalhes. **Aceite:** testes do classificador com `media_filename` técnico (`3EB0E6947FC0...jpg`) e humano (`contrato.pdf`); mensagem com `is_deleted = true` não entra em `items` nem em `counts`.

**10. URLs assinadas em lote.** No hook, agrupar os itens de bucket privado por bucket e chamar `storage.from(bucket).createSignedUrls(paths, ttl)` uma vez; guardar `signedUrl` por item com `expiresAt`. `FileThumb`/visualizador consomem a URL já pronta; `useResolvedStorageUrl` continua existindo só para `refresh` individual em erro. Miniaturas com `loading="lazy"` e `decoding="async"`. **Aceite:** abrir a aba do Esonic dispara ≤ 1 request de assinatura por bucket (medido como na etapa 01b), contra ~56 hoje.

### Fase 2 — Barra de ferramentas e popover Layout (PR B)

**11. `FilesToolbar`.** Ordem: busca (`flex-1`, mínimo 220 px) → ordenação (`w-[160px]`) → grupo `[Selecionar][Layout]` com `gap-2`. Altura 36 px (`h-9`), tokens existentes (`bg-card`, `border-border`). Abaixo de 640 px de contêiner, o grupo quebra para uma segunda linha; a busca nunca encolhe abaixo do mínimo. **Aceite:** sem rolagem horizontal nas quatro larguras da etapa 02; `data-testid` da etapa 04 presentes.

**12. `FilesLayoutPopover`.** Port do `LayoutPopover` do Promo Gifts: `Popover` (Radix, já no ui), gatilho `outline` `h-9` com `Settings2` + "Layout" (`aria-label="Alterar layout"`), conteúdo `w-60`, `align="end"`, `sideOffset={8}`; título "Visualização" (`text-[11px] uppercase tracking-wider`), segmentado Grid/Lista/Tabela com `aria-pressed`; `Separator` + "Colunas" só quando `viewMode === 'grid'`. Sem `Tooltip` aninhado em `PopoverTrigger` (a composição do Promo Gifts quebra o foco; usar `title`). **Aceite:** teste: clicar "Lista" muda `viewMode` do hook e esconde "Colunas"; o estado do popover é o mesmo do conteúdo (nenhum estado interno duplicado).

**13. `FilesColumnSelector` controlado.** `role="radiogroup"` com 5 `role="radio"` (3·4·5·6·8), ícones `GridIcon` SVG portados, `aria-label="N colunas"`, navegação por setas, `aria-checked`. Opções que não cabem (`fits === false`) ficam **visíveis e `aria-disabled`**, com `title="Não cabe na largura atual (máximo N)"`. Sem `window.innerWidth`, sem `localStorage` no componente (G12). **Aceite:** com contêiner de 959 px, 6 e 8 aparecem desabilitadas; ao recolher a sidebar, 6 habilita sem reload.

**14. Cabeçalho compacto e contagem honesta.** Título "Arquivos" `text-base font-semibold` na mesma linha dos chips; subtítulo removido. Contagem: "56 arquivos" quando `items.length < 200`; "200 carregados · mais antigos não carregados" quando bate o teto (até a etapa 41 remover o teto). Chips Todos/Imagens/Vídeos/Áudios/Docs mantidos, `h-8`, com contagem `tabular-nums`. **Aceite:** altura total de cabeçalho + toolbar + chips ≤ 120 px (hoje ~150 px); teste existente "renderiza os chips com as contagens reais por tipo" continua verde.

**15. Botão Selecionar/Cancelar.** `variant` alterna `outline` → `default`; rótulo "Selecionar" → "Cancelar"; `aria-pressed`; contador em `Badge` **primária** (não `destructive`: seleção não é erro), sem animação de mola (respeitar `useReducedMotion`). `Esc` dentro da aba sai do modo seleção (sem efeito destrutivo). **Aceite:** teste: entrar → checkboxes visíveis nos três modos; `Esc` → modo sai e seleção zera.

### Fase 3 — Grid e cartão (PR C)

**16. Mapa literal de colunas.** `COLS: Record<1|2|3|4|5|6|7|8, string>` com classes literais `grid-cols-N` (Tailwind precisa das strings completas; nada de template). `effective` da etapa 07 escolhe a classe; sem breakpoints de viewport (`sm:`/`xl:`) — o contêiner decide. `gap-3`. **Aceite:** teste de snapshot da classe para `effective` 3/4/5/6/8; nenhuma classe `2xl:grid-cols-*` restante no `FilesTab`.

**17. Prévia que preserva o conteúdo.** Área de prévia `aspect-[16/10]`, `bg-muted`, imagem com `object-contain` (G: os exemplos são prints de planilha; `object-cover` corta o total da tabela). Validar `MIN_CARD = 168` visualmente: em 8 colunas (cartão ~170 px) o print "Cód./Quant./Vr./Total" ainda precisa ser reconhecível como tabela. Se não for, 8 colunas exige `MIN_CARD` maior e a etapa 07 é ajustada. **Aceite:** print lado a lado 4/6/8 colunas no relatório da etapa 50; nenhuma deformação (`object-contain` sem `w-full h-full` forçado em `img` de proporção diferente).

**18. Identificação legível.** Linha 1: `displayName` (`text-[13px] font-semibold truncate`, `title` = nome técnico completo). Linha 2: "Imagem · 1,2 MB · 24/09 17:54" (`text-xs text-muted-foreground`, um só `<p>`); tamanho ausente → omitido, nunca "0 KB". Linha 3 (remetente com avatar) só quando `effective <= 4`; acima disso fica nos detalhes. **Aceite:** altura do rodapé do cartão ≤ 64 px em ≤ 4 colunas e ≤ 44 px acima; teste com `size: null` não renderiza "0".

**19. Ações do cartão (política fechada, D2).** Três ações: **Visualizar** (olho), **Encaminhar** (ligado ao serviço real da Fase 7; até a PR G mergear, o botão fica desabilitado com `title="Disponível em breve"` — nunca um stub que fecha e diz "encaminhado") e **Mais ações**. No menu: "Baixar" aparece **desabilitado** com cadeado e texto "Bloqueado pela política de segurança" (informa antes de frustrar, em vez de botão ativo que só mostra toast); **"Copiar link" é removido** do cartão, dos detalhes e da lista/tabela; "Excluir mensagem" só para `sender === 'agent'` (mantido). Alvos 28×28 px (mínimo WCAG 2.5.8 é 24). **Aceite:** teste renderizando exatamente essas ações; `grep` por `clipboard.writeText` em `src/components/inbox/files/` vazio; nenhum botão que apenas dispara `notifyDownloadBlocked`.

**20. Estrutura semântica do cartão.** `<article data-testid="files-item-<id>">`; a prévia é um `<button aria-label="Visualizar <displayName>">` (abre o visualizador); o nome é um `<button>` que abre detalhes; no modo seleção, um `<Checkbox>` real no canto superior esquerdo e o clique na prévia alterna a seleção (um só `onClick`, com `stopPropagation` apenas no grupo de ações). `focus-visible:ring-2 ring-ring`. Nenhum `<div onClick>` restante. **Aceite:** teste: `Tab` percorre prévia → nome → ações; `Enter` na prévia abre o visualizador; `Space` no checkbox alterna sem abrir nada.

### Fase 4 — Lista e Tabela (PR D)

**21. `FilesListView`.** Linha `h-16 px-3 rounded-xl border border-border/70 bg-card` (igual `ContactListItem`), miniatura 48×48 `rounded-lg` (`FileThumb` da etapa 26), bloco de texto `min-w-0` (nome + "Imagem · 1,2 MB · 24/09 17:54 · Esonic Kao"), ações à direita (`shrink-0`), checkbox à esquerda no modo seleção. **Aceite:** 10 arquivos ocupam ≤ 700 px de altura (Grid 4 col: ~1.100 px); nomes longos truncam com `title`.

**22. Lista responsiva por contêiner.** Abaixo de 640 px: metadados vão para uma segunda linha, remetente some (continua nos detalhes), ações viram só "Visualizar" + "Mais ações". **Aceite:** teste com contêiner de 600 px; nenhuma linha quebra o alinhamento das vizinhas quando `size` ou `caption` é nulo.

**23. `FilesTableView`.** `Table` do ui + `SortableHeader` portado de `ContactsTable.tsx:55` (mesma aparência, `aria-sort`). Colunas: [Sel] · Arquivo (miniatura 32 px + displayName) · Tipo · Tamanho · Data · Remetente · Ações. Só **Arquivo**, **Tamanho** e **Data** são ordenáveis, e mapeiam no mesmo `sort` do hook (Data desc = "Mais recentes"; Tamanho desc = "Maiores"; Arquivo = ordenação alfabética nova, adicionada ao `SortMode`). Colunas não ordenáveis não têm botão. **Aceite:** clicar "Data" alterna o `Select` de ordenação para o valor correspondente e vice-versa; a sequência de ids é a mesma nos três modos (teste de invariante).

**24. Tabela no espaço do chat.** `table-fixed` com prioridades: < 720 px de contêiner esconde Remetente e Tamanho; < 560 px esconde Tipo (todos continuam nos detalhes). `overflow-x` só dentro da tabela, nunca no painel; a preferência "Tabela" nunca é trocada por "Lista" automaticamente. **Aceite:** com sidebar expandida + contato aberto + painel de detalhes (683 px), a tabela mostra Sel · Arquivo · Data · Ações sem rolagem horizontal do ZAPP.

**25. `FilesContent` único.** Recebe `items` (já filtrados e ordenados), `selection`, `actions` (`onPreview`, `onOpenDetails`, `onForward`, `onDelete`) e `viewMode`; escolhe o renderer; skeleton por modo (6 cartões / 6 linhas / 6 `TableRow`). Formatação de data/tamanho vem só de `fileDisplay.ts` (uma função `formatMeta(item)`), sem cópia nos renderers. **Aceite:** `grep` por `formatSmartDate|toFixed` em `src/components/inbox/files/` retorna só `fileDisplay.ts`; teste de paridade: mesma ação, mesmo handler nos três modos.

### Fase 5 — Miniaturas, mídia e visualizador (PR E)

**26. `FileThumb` compartilhado.** Props `item`, `size` (`card|row|cell`). Estados: `loading` (skeleton), `ready`, `no-preview` (ícone por tipo), `error` (ícone + `title="Prévia indisponível"`). Em `error`, 1 `refresh` automático (o cooldown de 5 s já existe no hook) e depois placeholder estável — sem loop de `onError`. **Aceite:** teste com URL que falha: exatamente 1 chamada de `refresh`; depois do `refresh` bem-sucedido, a imagem volta.

**27. Vídeo sem pôster inventado.** Tile com `<video preload="metadata" muted playsInline>` montado **só quando visível** (`IntersectionObserver` com `rootMargin: 200px`), ícone Play sobreposto, duração via `loadedmetadata` quando o navegador entregar. Fora da viewport: ícone de vídeo + rótulo. Nenhuma URL de pôster derivada de `media_meta` (G14). **Aceite:** com o filtro "Vídeos" do Esonic (2 itens), as duas prévias mostram primeiro frame ou ícone, nunca "imagem quebrada"; nenhum `<video>` montado fora da viewport.

**28. Áudio compacto.** Tile com ícone `AudioLines`, rótulo "Áudio", duração só se `media_meta.seconds` (ou campo equivalente confirmado no `schema-catalog.json`) existir; sem onda fictícia; reprodução no visualizador (etapa 30), reusando `useMediaElementVolume`. No Grid, o tile de áudio usa a mesma `aspect-[16/10]` para não quebrar a linha. **Aceite:** teste com `meta: null` não renderiza duração; áudio distinguível de vídeo pelo ícone, não só pela cor.

**29. Documento por extensão.** Ícone por família (`pdf`, `xls/xlsx/csv`, `doc/docx`, `ppt/pptx`, `zip/rar`, genérico) + `Badge` com a extensão em maiúsculas; sem prévia de conteúdo. **Aceite:** `contrato.pdf` → ícone PDF + "PDF"; extensão desconhecida → genérico sem badge; nada que prometa visualização nativa.

**30. Visualizador único e navegável.** Manter `MediaPreviewDialog`; título = `displayName` (nome técnico no `DialogDescription` para leitor de tela); setas ← → e botões "Anterior/Próximo" percorrem a coleção filtrada atual; foco devolvido ao gatilho ao fechar; `controlsList="nodownload"` também no `<audio>`; **botão "abrir em nova aba" removido** (D2 fechada) e o de download do cabeçalho também; `max-h-[80vh]`. **Aceite:** teste: abrir o 2º de 3 itens, `→` vai ao 3º, `←` volta; fechar devolve foco ao botão que abriu.

### Fase 6 — Detalhes, seleção em lote e exclusão (PR F)

**31. Detalhes sem roubar coluna.** Lado a lado (260 px) **só** quando a largura do contêiner ≥ 1100 px (sidebar colapsada); abaixo disso, `Sheet` (`ui/sheet`) à direita, sobreposta, com o mesmo conteúdo (prévia, `displayName`, nome técnico, tipo, tamanho, data completa, remetente, legenda, ações). Nunca substitui o painel cadastral do contato. **Aceite:** com 959 px, abrir detalhes não muda `effective` do grid; com 1474 px, abre lado a lado e o grid cai de 8 para 6.

**32. Barra contextual de seleção.** Aparece no topo da área de arquivos quando `selectionMode`: "N selecionados" (`aria-live="polite"`), "Selecionar todos (M visíveis)", "Limpar", "Cancelar" e "Encaminhar N" (desabilitado até a PR G mergear, com o mesmo `title` da etapa 19). Sem ZIP, sem excluir em massa. **Aceite:** teste: texto da barra bate com `selectedIds.size`; nenhuma ação sem handler real.

**33. "Selecionar todos" com alcance explícito.** Seleciona os ids de `filtered` (carregados e correspondentes ao filtro atual); checkbox geral com `indeterminate` quando parcial; ao trocar filtro, a barra mostra "k selecionados fora do filtro". **Aceite:** teste: 56 itens, filtro Vídeos, "Selecionar todos" → 2; voltar a Todos → "2 selecionados"; selecionar todos de novo → 56.

**34. Ciclo de vida da seleção.** Sobrevive a troca de modo, ordenação e rolagem; zera ao trocar contato (`key={contactId}` no `FilesTab`), ao sair da aba (desmontagem) e ao cancelar; não zera quando uma ação falha (o operador precisa tentar de novo). Nunca persistida em storage. **Aceite:** teste: ação que rejeita mantém a seleção; `localStorage` não recebe ids.

**35. Exclusão com diálogo e efeito fiel.** `AlertDialog` no lugar de `window.confirm`. Texto a confirmar na etapa 01a com o efeito real (`is_deleted = true` + `content = '[Mensagem apagada]'`, visível só para o próprio ZAPP, não apaga no WhatsApp do cliente). Centralizar em `useFilesActions.deleteMessage(item)`: `update` → remover da seleção → invalidar `contactMediaKey` e `conversationTabCountsKey`. **Aceite:** teste com `update` rejeitado: toast de erro, item continua na lista e na seleção; com sucesso: item some sem refetch devolver (depende da etapa 09).

### Fase 7 — Encaminhar de verdade (PR G; D1 decidido: sim, com limite)

**36. `forwardMediaMessages(items, targets)`.** Serviço em `src/hooks/chat/useForwardMedia.ts` reutilizando o caminho de envio de mídia já existente em `src/components/inbox/useFileUploadLogic.ts:160-171` (envia `mediaUrl` como locator + `messageType`; **sem** re-upload do arquivo). Um envio por (arquivo × destino), sequencial, com `Promise.allSettled` por lote. **Aceite:** teste unitário com o cliente mockado: 2 arquivos × 2 destinos = 4 envios na ordem esperada; nenhuma leitura de `storage` para re-upload.

**37. Diálogo honesto.** `ForwardMessageDialog.onForward` passa a devolver `Promise<ForwardResult>`; o hook `useForwardMessage` (que já tem `isSending`) só fecha e mostra "Encaminhado para N destinos" após a resolução; falhas parciais listadas por destino com "Tentar novamente só os que falharam". **Aceite:** teste: 1 destino rejeita → diálogo continua aberto, toast de falha parcial, botão de retry reenvia apenas o destino que falhou.

**38. Lote a partir da seleção.** "Encaminhar N" da barra contextual abre o mesmo diálogo com os N itens; progresso "3/7 enviados" (`aria-live`); reexecutar após falha parcial não repete os já enviados (controle por `(itemId, targetId)` concluído). **Aceite:** teste: 7 envios, 2 falham, retry dispara exatamente 2.

**39. Limites de proteção.** Máximo 10 destinos × 10 arquivos por operação (100 envios); acima disso o botão fica desabilitado com o motivo; confirmação explícita a partir de 20 envios ("Vai enviar 40 mensagens para 4 contatos. Continuar?"). Valores revisáveis pelo Joaquim. **Aceite:** teste dos dois limiares.

**40. Fonte única do stub do chat.** Documentar que `handleForwardToTargets` do chat (`useChatPanelHandlers.ts:125`) é o mesmo bug e deve apontar para o mesmo serviço — mas é escopo do chat, não desta aba: entra em "Próximos passos", não nesta PR, salvo ordem do Joaquim. **Aceite:** item registrado no relatório da etapa 50; nenhuma mudança em `useChatPanelHandlers.ts` nesta PR sem ordem.

### Fase 8 — Além dos 200 arquivos, contagens e atualização (PR H)

**41. Paginação real.** `useInfiniteQuery` com cursor `(created_at, id)` e páginas de 60; "Carregar mais" ao fim + carga automática quando o sentinela entra na viewport do `Panel` (que é o contêiner de rolagem real, `ConversationTabContent.tsx:34`). Posição de rolagem e seleção preservadas entre páginas. **Aceite:** fixture com 201 itens: o 201º aparece após a 4ª página; `filtered` continua uma só lista; teste do sentinela.

**42. Contagens de uma fonte só.** (D4 autorizou a migration.) Chips passam a usar contagem por tipo direto do banco (5 consultas `select('id', { count: 'exact', head: true })` com `is_deleted = false` em paralelo; sem DDL). O `files_total` do RPC `get_conversation_tab_counts` precisa excluir `is_deleted` → **migration** pelo fluxo da seção 1 do `CLAUDE.md` (arquivo → PR → merge → registro no ledger; versão reservada via `reserve_migration_version`). Essa parte da PR H fica **aberta para o Joaquim** (regra 8). **Aceite:** chip "Todos" = badge da aba para o Esonic e para um contato com >200 mídias; `supabase-usage-guard.mjs` com `novas: 0`.

**43. Busca e ordenação com alcance declarado.** Enquanto houver páginas não carregadas, a área mostra "Buscando entre os N carregados · Carregar tudo"; "Maiores" coloca tamanho desconhecido no fim (não como 0) e desempata por data e id. **Aceite:** teste de ordenação com `size: null` no fim; teste de invariante de sequência nos três modos mantido.

**44. Estados distintos.** Carregando inicial (skeleton do modo), vazio real ("Nenhum arquivo nesta conversa"), filtro/busca sem resultado ("Nada corresponde a 'x' · Limpar busca", com os chips ainda visíveis), erro de consulta ("Não foi possível carregar · Tentar novamente", sem apagar a lista anterior), carregando mais (skeleton no fim). **Aceite:** 5 testes, um por estado; o teste atual "mostra o empty state honesto" vira o estado "vazio real" e um novo cobre "sem resultado".

**45. Atualização ao vivo.** Onde o chat já recebe a mensagem nova por realtime (assinatura existente no Chat montado), invalidar `contactMediaKey(contactId)` quando a mensagem tiver `media_url`. Sem assinatura nova. **Aceite:** teste: evento com `media_url` invalida a query; sem `media_url` não invalida.

### Fase 9 — Qualidade, acessibilidade e homologação (acompanha as PRs)

**46. Testes unitários por PR.** Stub global de `ResizeObserver` e `IntersectionObserver` no setup do Vitest (hoje só em `volumeControlMocks.ts`). Cobertura mínima: capacidade (07), sanitização de prefs (06), seleção (08, 33, 34), popover/colunas desabilitadas (12, 13), paridade de sequência (23, 43), estados (44), encaminhar (36–39). Os 6 testes atuais de `FilesTab.test.tsx` continuam passando (ajustar só o do empty state, etapa 44). **Aceite:** `npm run test -- files` verde; PR não abre com teste vermelho.

**47. Teclado e ARIA (checklist executado, não prometido).** `Tab`: busca → ordenação → Selecionar → Layout → chips → itens; popover: `Esc` fecha e devolve foco ao gatilho; radiogroup de colunas com setas; `aria-sort` na tabela; `aria-live` na barra de seleção; `Esc` nunca exclui nem envia. Executar com Playwright (`page.keyboard`) nas três visualizações. **Aceite:** fluxo "localizar → selecionar 2 → abrir detalhes → fechar" concluído só por teclado, gravado em `evidence/`.

**48. Contraste, alvos e movimento.** Medir com Playwright (`getComputedStyle`) nos dois temas e no alto contraste: texto normal ≥ 4,5:1, texto de metadados ≥ 4,5:1, foco visível ≥ 3:1; nenhum `bg-black` literal (usar `bg-inbox-panel` se um painel precisar escurecer — lição de 25/09); `prefers-reduced-motion` desliga transições do popover e do contador. **Aceite:** tabela de contraste no relatório; zero valores abaixo do mínimo.

**49. E2E logado.** (D4 autorizou a fixture.) Spec `e2e/files-tab.spec.ts` no `e2e-logado.yml`, usando o contato E2E seedado (`04dff4dc-c6b1-4283-ac22-bd8639804759`). Pré-requisito: **1 mensagem de mídia pública** seedada para esse contato (DML, não DDL; mesmo padrão dos fixtures do Talk X; não remover depois). Cenários: abrir aba, trocar para Lista e Tabela, entrar em seleção e selecionar 1, abrir e fechar detalhes, abrir visualizador. **Aceite:** spec verde em `chromium-authenticated`; fixture documentada em `e2e/README.md` e `e2e/fixtures/`.

**50. Homologação visual e entrega reversível.** Playwright 1920×1080 nas quatro combinações de laterais × três modos × colunas 4/6/8 (quando couber), light e dark; comparação com os prints enviados pelo Joaquim; relatório `docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md` com o que foi verificado de verdade (request real, teste, print) e o que ficou pendente. Deploy confirmado por request à URL de produção após cada merge. Reversão = `revert` da PR correspondente (sem feature flag: cada PR é pequena e independente). **Aceite:** relatório publicado; nenhuma afirmação de "em produção" sem a request correspondente registrada.

---

## 8. Próximos passos (fora deste plano)

1. Ligar `handleForwardToTargets` do chat ao serviço da etapa 36 — hoje "encaminhar" no chat também não envia nada · `src/components/inbox/chat/useChatPanelHandlers.ts`
2. Unificar o seletor de visualização de Contatos (`ContactViewSwitcher`) com o popover de Arquivos num componente só — evita dois padrões de "Layout" no produto · `src/components/contacts/`, `src/components/inbox/files/`
3. Aplicar a mesma política de mídia (D2) ao `MediaPreview` das bolhas do chat, que hoje abre a URL assinada em nova aba (`window.open`, linha 68) — a aba Arquivos fechada não adianta se o chat deixa aberto · `src/components/inbox/MediaPreview.tsx`
