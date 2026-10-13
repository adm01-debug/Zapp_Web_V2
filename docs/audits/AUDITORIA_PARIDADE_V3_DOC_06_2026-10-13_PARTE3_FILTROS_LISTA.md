# Paridade V3 -> V2, doc 06, recorte 3: FILTROS, LISTA E AÇÕES (2ª passada, 13/10/2026)

Leitura somente leitura. V3 = `origin/main:src/features/inbox/hooks/*` (28 arquivos do recorte, lidos inteiros). V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador`. Na V2 não existe `src/features/inbox`: o equivalente está em `src/hooks/inbox/` (useInboxFilters.ts, chipCounts.ts, useInboxBulkActions.ts, useBulkActions.ts, useInboxUIState.ts, useRealtimeInbox.ts), `src/hooks/chat/` (useChatSearch.ts, useConversationActions.ts), `src/hooks/system/useUrlFilters.ts`, `src/hooks/agents/` e `src/components/inbox/`.

Resumo: este recorte já foi muito auditado (QL1..QL11, ES1/ES2, DL1, KN1, SL3, FF1, LS2, TR1/TR2, PD-84/85/92, PH-01/12/15). Quase tudo que a V3 tem a mais já tem cartão, e vários cartões ainda estão `todo`/`ready`. Achei 0 lacunas P0, 1 verificação P1 (RPC de transferência já integrada diverge do TR1) e 6 itens P2 sem cartão. Não há cartão para persistir os filtros da lista, e dois cartões existentes têm dono ou escopo discutível (PD-92).

## 1. Tabela de comparação

| # | Item (V3) | Classificação | Evidência V3 | Evidência V2 | Cartão existente |
|---|---|---|---|---|---|
| 1 | Pipeline puro de filtros (`applyInboxFilters`) | MELHOR_NA_V2 | `inboxFilterPipeline.ts:65-332`: estado derivado de `ticketStore` local + `assigned_to` | `chipCounts.ts` + `useInboxFilters.ts`: usa `contacts.conversation_status` persistido (ADR-005), mesmos predicados para lista e contador | n/a |
| 2 | Contador da aba = tamanho da lista | MELHOR_NA_V2 | `inboxFilterPipeline.ts:354-369` (`computeInboxTabCounts`, 5 passadas) | `chipCounts.ts:207` (`countByChip`, 1 varredura) + `chipCounts.test.ts` matriz. `StatusChips.tsx:34-59` ainda recalcula com regra antiga | QL3 (todo) |
| 3 | Aba Arquivados só mostra arquivadas, ignora o resto | DECISAO (V2 mais restritiva, aceita) | `inboxFilterPipeline.ts:144-150,223,314` | chip `archived` = `conversation_status==='archived'` + fila + busca + painel (`useInboxFilters.ts:105-114`); `useInboxFilters.arquivadas.test.tsx` | achado A10 da 1ª passada do doc 07 |
| 4 | Arquivadas fora das outras abas | EQUIVALENTE | `inboxFilterPipeline.ts:149` | `isOpenActive` só open/waiting; teste "arquivadas NÃO aparecem nos demais chips" | n/a |
| 5 | Arquivar em lote (soft-delete) | LACUNA (já com cartão) | `useInboxBulkActions.ts:97-132` -> `updateStatusBulk(ids,'archived')` | `useInboxBulkActions.ts:97-132` só faz `assigned_to:null`; `useBulkActions.ts:134-139` arquiva certo | PH-01, QL1 (ready) |
| 6 | Desarquivar / reabrir na lista | LACUNA (já com cartão) | `useArchiveConversationActions.ts:25-39` (restore) | nenhum "Desarquivar" na lista | PD-72, QL4 |
| 7 | Mark-as-read em lote | LACUNA em ambas (V3 também erra) | `useInboxBulkActions.ts:46-51` marca TODAS as mensagens, incl. do agente | `useInboxBulkActions.ts:46-56` idem, sem filtro `sender='contact'` e sem UUID | PD-84 |
| 8 | Transferência em lote com contagem real | LACUNA (já com cartão); V3 melhor | `:62-100` `.select('id')`, toast de sucesso parcial | `:65-90` UPDATE sem `.select`, toast "N transferido(s)" mesmo com 0 linhas | PD-84 |
| 9 | Filtro de UUID na seleção em lote | LACUNA menor | `isValidUUID` nos 3 métodos | não filtra | PD-84/QL2 (parcial), checar cartão irmão |
| 10 | Seleção limpa quando a visão muda | LACUNA (cartão) | n/a (V3 também não limpa) | `useInboxBulkActions.ts` só guarda ids | QL2 (todo) |
| 11 | Escopo Meus/Departamento/Todos por permissão | LACUNA (cartão) | `inboxFilterPipeline.ts:107-130,164-185`; `useInboxFilters.ts:136-172`; auditoria `scope_change` | só `showAll` boolean (`useInboxFilters.ts:51`); sem `inbox.view_*` em src nem migrations | ES1 (done), ES2 (todo) |
| 12 | Escopos customizados (`inbox_custom_scopes`) | DECISAO / código morto na V3 | `inboxFilterPipeline.ts:182` só casa se `scope` for custom, mas `resolveInitialScope` só aceita `mine/department/all` (`inboxFilterPersistence.ts:94-105`) | tabela e consumo inexistentes | n/a (não portar) |
| 13 | Visibilidade por canal (`inbox.view_whatsapp/instagram/chat`) | DECISAO a pedir ao dono | `inboxFilterPipeline.ts:19-23,93-96,134-142`; só vale se as 3 permissões existirem (`useInboxFilters.ts:391-398`); config no admin `InboxScopeConfigParts.tsx:24-28` | nenhuma permissão de canal em `src` ou `supabase/migrations` (grep `inbox.view` vazio); `buscar_corpo` 'view_whatsapp' = NENHUM | nenhum (ver P2-6) |
| 14 | Fallback "mine vazio -> amplia para department/all" | DECISAO (não portar) | `inboxFilterPipeline.ts:118-130` amplia o escopo em silêncio quando o usuário não tem conversas | n/a | ES2 deve NÃO copiar |
| 15 | Aba/sub-aba/fila/tipo persistidos (localStorage + URL) | LACUNA | `inboxFilterPersistence.ts` (chave `inbox_filters_v1`), `useInboxFilters.ts:191-217,354-373` | `useInboxFilters.ts:29-41`: chip, fila e tipo em `useState`; só `type` vai para URL (cru, `:44-47,56-65`) | NENHUM (P2-1) |
| 16 | Sanitização de parâmetros da URL | LACUNA menor | `sanitizeInboxUrlParams` `:124-153`, UUID da fila, regex do tipo, limite 200 do `q` | V2: `type` aceita qualquer texto; sem fila na URL | NENHUM (P2-2, junto do 15) |
| 17 | Busca na URL (`?q=`) e persistida | DECISAO (V2 melhor) | `useInboxFilters.ts:337-352` grava busca em URL e localStorage | `useInboxFilters.ts:66-67` "Busca só em memória: telefone/nome digitado não pode ir para a URL"; `useUrlFilters.ts:25-27` limpa `?q=` legado | n/a |
| 18 | Busca da lista: acento, caixa, telefone só dígitos, e-mail, JID, última mensagem | LACUNA parcial (cartão) | `inboxFilterPipeline.ts:225-243` (sem acento: `toLowerCase` só) | `chipCounts.ts:99-114`: nome/e-mail minúsculos, `phone.includes(texto bruto)`, sem última mensagem | QL2 (todo). Nota: a V3 também NÃO ignora acento na lista; a busca sem acento só existe na busca dentro da conversa |
| 19 | Busca dentro da conversa (acento, tipo, datas, "última interação") | MELHOR_NA_V2 | `useChatSearch.ts` (263 linhas) | `hooks/chat/useChatSearch.ts`: igual + `last_interaction` mantém o início exato da sessão (regressão #322) e 19 testes | C5 (aviso sem resultado, todo) |
| 20 | `onSearchQueryChange` sem fechamento obsoleto | LACUNA menor | `useChatSearch.ts:88,95-98` guarda o callback em ref | V2 `:67-70,108,122` usa o callback direto no efeito (pode usar função antiga) | NENHUM (P2-5) |
| 21 | Busca na lista atravessa abas/sub-abas | DECISAO | `inboxFilterPipeline.ts:202-221`: com texto, ignora sub-aba | V2 limita ao chip ativo, mas `countByChip` mostra o total por chip com a busca | QL3 (estado vazio com "Ver aguardando (n)") |
| 22 | Ordenação (Recentes/Não lidas/Nome) | LACUNA (cartão) | `inboxFilterPipeline.ts:316-331`; `useConversationsFilter.ts:50-64` | ordem fixa (não lidas primeiro) `useInboxFilters.ts:148-155` | QL9 (todo) |
| 23 | Presets de filtros (local + `saved_filters` remoto, validação, 20 máx.) | LACUNA (cartão) | `inboxFilterPresets.ts`, `inboxPresetsSync.ts`, `useInboxFilters.ts:602-738` | `useSavedFilters.ts` existe só para Contatos; nada para a inbox | QL10 (ready), QL11 |
| 24 | Reset "Limpar filtros" | EQUIVALENTE | `resetInboxFilters` `:565-600` + `hasActiveInboxFilters` | `InboxFilters.tsx:106-111,144` botão "Limpar" (zera painel, showAll, tipo, fila; não o chip) | n/a |
| 25 | Fallback de aba restaurada vazia / sub-aba vazia salta para a outra | DECISAO | `useInboxFilters.ts:463-508` | chip padrão `attending` pode abrir vazio; o QL3 resolve com botões "Ver aguardando (n)" | QL3 |
| 26 | Filtro de data usa dia local | MELHOR_NA_V2 | `useInboxFilters.ts:381` `toISOString().split('T')[0]` (UTC, vira o dia à noite no Brasil) | `localDayKey` + `useInboxFilters.dia-local.test.tsx` | n/a |
| 27 | Filtro "só com falha de envio" + categorias na lista | DECISAO (coberto por tela própria) | `inboxFilterPipeline.ts:295-313,379-424` | sem filtro na lista; há tela e linha | FQ1-FQ3, LS2, FF1 |
| 28 | Contador `retryingCount` | DECISAO | `useInboxFilters.ts:515-521` | coberto pelos cartões de falha | LS2/FQ3 |
| 29 | Deep link `?contact=` / `?message=` / `?msg=` + evento + global legado + "consumido uma vez" | LACUNA parcial | `useInboxDeepLinks.ts` (67 linhas, 6 testes) | V2 só tem evento + global legado em `useRealtimeInbox.ts:70-85`; grep `get('contact')` na inbox = nada | DL1 (`?message=`, done); `?contact=` só em PD-92 (iris, catch-all); `?msg=` alias sem dono |
| 30 | Contato selecionado fora da lista (fallback) | LACUNA parcial | `useFallbackContact.ts`: resolve UUID/JID/telefone, proxy externo, contato sintético | `useRealtimeInbox.ts:94-109` só UUID, erro só em log | PH-12, PH-15 |
| 31 | Atalhos da lista (Mod+K, `/`, Alt+setas, Mod+E, Mod+Shift+T, Mod+R, Mod+F) | LACUNA (cartão) | `useInboxShortcuts.ts` (guard de auto-repeat `e.repeat`, `archiveEnabled`, `useKey` para `/`) | `RealtimeInboxView.tsx:189-199`: só Ctrl+A, Delete, Esc, `r` na seleção; sem Alt+setas, sem foco na busca | KN1, QL8 (todos todo) |
| 32 | Preferência "mostrar texto do status das mensagens" | LACUNA (cartão) | `useInboxStatusPref.ts` | `MessageStatus.tsx:14,48` aceita `showLabel` mas ninguém liga a preferência | SL3 (todo) |
| 33 | Transferência de conversa | MELHOR_NA_V2 em parte, mas ver P1-1 | `useTransferConversation.ts`: UPDATE cliente com compare-and-set, solta agente ao mandar para fila, nota, trilha, resultado success/partial/error | V2: RPC atômica `transfer_conversation` + evento (`20261005185729_transfer_conversation_rpc.sql`), chamada em `useConversationActions.ts:273` | TR1, TR2 (todo) |
| 34 | `useTicketStatus` (assumir/devolver/atribuir auto) | MELHOR_NA_V2 (status persistido) / DECISAO | `ticketStore` local + edge `ticket-router` (sticky + round-robin) | V2 usa `conversation_status`; roteamento sticky foi dispensado | T1 (done, "SEM roteador sticky"), QA1 (done) |
| 35 | Arquivar/restaurar conversa unitário | EQUIVALENTE | `useArchiveConversationActions.ts` (soft-delete `deleted_at`) | `useChatPanelHandlers.ts:534` e `useBulkActions.ts:138` gravam `conversation_status='archived'` | n/a |
| 36 | Carga/último envio por agente | MELHOR_NA_V2 | `useAgentPendingCounts.ts` (limit 2000, conta mensagens), `useAgentRecentSends.ts` (limit 200 em tabela de idempotência) | `hooks/agents/useAgentPendingCounts.ts` (conversas em espera, paginado, falha se incompleto), `useAgentRecentSends.ts` (janela de 30 dias) | n/a |
| 37 | `useWhatsAppStatus` (stories + presença) | LACUNA (cartão) | `useWhatsAppStatus.ts` (corrida por `phone`) | feature de stories ausente | QC3, QC4, PS1/PS2 |
| 38 | `useInboxDataQueries` (custom scopes + mapa de etiquetas) | N/A | etiquetas EXCLUÍDAS; escopos custom mortos | n/a | n/a |
| 39 | `useConversationsFilter` (realtime/) | N/A | 73 linhas, órfão, regra de status pelo remetente da última mensagem | n/a | n/a |
| 40 | Testes do recorte | LACUNA parcial | 10 arquivos de teste (shortcuts, deep links, bulk, pipeline, transfer 519 linhas, fallback, status pref, archive) | V2 tem chipCounts, useInboxFilters.* (5), useInboxBulkActions, useChatSearch; faltam teste de deep link, de atalhos e de transferência pelo hook | PH-15 (fallback), PD-95 (genérico) |

## 2. Lacunas reais SEM cartão

### P1
**P1-1. A RPC `transfer_conversation` já integrada diverge do TR1 e deixa o agente antigo ao mandar para fila.** (verificar antes de deixar o executor do TR1 trabalhar às cegas)
- Evidência V3: `useTransferConversation.ts:130-145` — ao transferir para fila faz `assigned_to = null` (o agente sai) e usa compare-and-set (`.eq('assigned_to', atual)`), devolvendo erro se outro agente reatribuiu entre a leitura e a escrita.
- Evidência V2: `supabase/migrations/20261005185729_transfer_conversation_rpc.sql` — `update contacts set assigned_to = coalesce(p_to_agent_id, c.assigned_to), queue_id = coalesce(p_to_queue_id, c.queue_id)`: transferir para fila MANTÉM o agente anterior; não há `p_expected_assigned_to` nem trava de linha; não atualiza `conversation_status`. O cartão TR1 (todo) descreve uma assinatura diferente (`p_target_type`, `p_target_id`, `p_expected_assigned_to`) e diz que a transferência "é um UPDATE no ChatPanel", o que já não é verdade.
- O que fazer: reescrever o corpo do TR1/TR2 (ou abrir um cartão novo) com a assinatura real, e adicionar à RPC: (a) `p_expected_assigned_to default null` + `select ... for update` e erro `reassigned_by_other`; (b) para fila, `assigned_to := null` e o estado "na fila" (`conversation_status='waiting'`, conferir o gatilho `fsm_transition`); (c) manter o evento em `conversation_events`; (d) teste de banco.
- Não consegui verificar: se o gatilho `auto_assign_to_queue_agent` (citado em `docs/FUNCTIONALITIES_INVENTORY.md:365`, ausente das migrations) reatribui sozinho quando `queue_id` muda, o que mudaria o impacto.
- Perfil: workersql (RPC) e hugo (`useConversationActions.ts:240-285`, TR2). Cartão irmão: TR1/TR2 (ambos `todo`).

### P2
**P2-1. Lembrar chip, fila e tipo de contato ao sair e voltar para a inbox.**
- V3: `inboxFilterPersistence.ts:75-91` lê/grava `inbox_filters_v1` (aba, sub-aba, fila, tipo, falhas) validando contra listas permitidas; `useInboxFilters.ts:354-373`.
- V2: `useInboxFilters.ts:29-41` mantém tudo em `useState`; ao trocar de módulo e voltar, o chip volta para `attending` e a fila some (só o tipo sobrevive, pela URL).
- Implementar: chave `zapp:inbox:filtros:<userId>` no localStorage com `try/catch`, validando chip contra `ChipTab`, fila contra UUID e tipo contra `FILTER_OPTIONS`. NÃO persistir busca (decisão de privacidade já tomada na V2, `useInboxFilters.ts:66`). Preferir estender o QL9/QL10 do mesmo arquivo para não gerar conflito.
- Perfil: hugo. Arquivos: `src/hooks/inbox/useInboxFilters.ts`, novo `src/hooks/inbox/inboxFilterPersistence.ts`, teste em `src/hooks/inbox/__tests__/`.

**P2-2. `type` da URL fora do roteador desincroniza e é aceito sem validação.**
- V2: `useInboxFilters.ts:56-65` grava `type` com `window.history.replaceState`, fora do React Router; em seguida `useUrlFilters.setFilters` (`useUrlFilters.ts:60-96`) usa `setSearchParams(prev => ...)` com o `prev` do roteador, que não conhece o `type`, e o parâmetro cai da URL (o estado continua certo; reload e link perdem o tipo). Também aceita qualquer valor (`:36-39`).
- Implementar: usar `setSearchParams` do roteador para `type` (ou mover para `useUrlFilters`), validar com `/^[a-z0-9_]{1,40}$/` como a V3 (`inboxFilterPersistence.ts:52`) e remover valor inválido da URL.
- Perfil: hugo. Arquivos: `useInboxFilters.ts`, `useUrlFilters.ts`, teste.

**P2-3. Filtro de data com só "até" não filtra nada.**
- V2: `chipCounts.ts:140-148` só aplica a data se houver `from`; o comentário diz que reproduz a lista de propósito, mas a V3 tem o mesmo defeito (`inboxFilterPipeline.ts:279`). Melhoria: tratar `to` sozinho como "até esse dia", e avisar no painel quando `from > to`.
- Perfil: hugo (regra) + iris (aviso no painel). Arquivos: `chipCounts.ts`, `InboxFilters.tsx`.

**P2-4. Busca da lista a cada tecla sem adiar.**
- V2: `useInboxFilters.ts:70-71` passa `search` direto para `countByChip` e para a lista (duas varreduras por tecla). Com 500 conversas é barato, mas com `QL5` (carregar mais) crescerá.
- Melhoria: `useDeferredValue(search)` no hook; manter o campo responsivo. Perfil: hugo. Arquivo: `useInboxFilters.ts`.

**P2-5. `onSearchQueryChange` pode usar callback antigo na busca da conversa.**
- V3: `useChatSearch.ts:88,95-98` guarda os callbacks em ref. V2: `hooks/chat/useChatSearch.ts:108,122` chama `onSearchQueryChange` direto dentro de efeitos com dependência só em `[query]`/`[isOpen]`; se o chamador recriar a função (destaque do texto), o efeito usa a versão da época.
- Implementar: ref estável como já é feito para `onHighlightChange`. Perfil: hugo. Teste em `hooks/__tests__/useChatSearch.test.ts`.

**P2-6. Permissões de visibilidade por canal (WhatsApp, Instagram, Web Chat) por papel.**
- V3: `inboxFilterPipeline.ts:19-23,93-96,134-142` oculta conversas de canal sem permissão (só quando as 3 permissões existem); tela de configuração em `src/features/admin/components/InboxScopeConfigParts.tsx:24-28`.
- V2: nenhuma permissão de canal (grep `inbox.view` em src e migrations vazio). Os canais Instagram/webchat na V2 existem só no módulo omnicanal.
- Decisão do dono necessária antes de cartão: se a V2 vai ter papéis que veem só alguns canais. Se sim: migration de permissões (workersql), regra no filtro (hugo) e tela no admin (iris). Se não: marcar como DECISAO.

### Observações sobre cartões existentes (não são lacunas novas)
- **PD-92** (P2, perfil iris) mistura trabalho de hooks (`?contact=`, persistência, ordenação, validação de destino) e de tela; boa parte virou QL2/QL8/QL9/QL10. Sugestão: reduzir o corpo ao que sobra (`?contact=<uuid>` com guarda de UUID + alias `?msg=`) e reatribuir a hugo. Hoje `?contact=` só existe como frase dentro do PD-92.
- **QL3** deve corrigir `StatusChips.tsx` (regras antigas) antes de qualquer outro cartão mexer nos chips, para os números não divergirem da lista.
- **ES2** deve NÃO copiar o ampliar-silencioso do escopo (`inboxFilterPipeline.ts:118-130`) nem os escopos custom mortos.
- **QL10/QL11** (presets): evitar três defeitos da V3: (1) `inboxPresetsSync.ts:121-125` usa `.ilike('name', nome)` sem escapar `%` e `_`, então um preset "a_b" sobrescreve "axb"; (2) sincronização local+remota por nome gera duplicata ao renomear (`mergeInboxPresets` junta por nome); (3) o achado A10 do doc (sem paginação) é falso quanto ao limite (`.limit(20)` em `:96`) mas a V3 não impõe o limite no servidor; a tabela nova deve ter CHECK/trigger de máximo por usuário (já previsto no QL10). Não guardar etiquetas.
- **PD-84/QL2**: filtrar UUID válido nos 3 métodos de lote (V3 `useInboxBulkActions.ts:46,67,106`).
- **TR1/TR2**: ver P1-1.

## 3. O que NÃO consegui verificar
- Banco real: existência e corpo de `auto_assign_to_queue_agent`, `fsm_transition` e `log_assignment_change` (citados no inventário, ausentes das migrations lidas); existência/valores de `inbox.view_department`/`inbox.view_all` em `public.permissions` (ES1 está `done`, mas a V2 lida é a cópia `.integrador` sem esse efeito); se `contacts.phone` aceita nulo para contatos de e-mail (`types.ts:2203` diz `string`).
- Runtime: nenhum teste foi executado; comportamento do `setSearchParams` funcional com `history.replaceState` externo (P2-2) vem da leitura do código e da versão do React Router, deve ser confirmado em teste.
- Estado dos cartões: ids QL* estão em `paridade-v3/ids_q.json`; QL1 e QL10 estão `ready`, os demais `todo`; TR1/TR2/FF1/LS2/SL3/KN1/ES2 `todo`; DL1/ES1/T1/QA1/PS1 `done` (mas a cópia `.integrador` pode não tê-los).
