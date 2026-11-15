# Dossiê — claude__fix-evolution-go-gaps-d6-261019-1548 (PR #2113)

**Branch:** `origin/claude/fix-evolution-go-gaps-d6-261019-1548` · tip `5615e53d9` · merge-base `ee2947491` (2026-10-18) · 3 commits, 3 arquivos (+8/−130).

## Propósito
"GO_GAPS D6": a Evolution GO não tem `/instance/setPresence`, `/chat/findChats` nem `/chat/findMessages`
(status@broadcast). A branch **apaga** as 3 rotas da edge `evolution-api` (`set-presence`, `find-chats`,
`find-status-messages`) e remove os chamadores no front: `useEvolutionInstance.setPresence` e toda a
leitura/filtragem de stories em `useWhatsAppStatus` (`contactName`, `buildPhoneNeedles`, `matchesPhone`,
`extractStatusRecords`, filtro por telefone/pushName).

## Arquivo × achado × evidência

| Arquivo | O que a branch faz | Estado na `main` | Achado |
|---|---|---|---|
| `supabase/functions/evolution-api/index.ts` | remove `set-presence`, `find-chats`, `find-status-messages` | As 3 rotas existem com guarda de flavor: `set-presence` L1136-1140 (`goActionNotSupported`), `find-chats` L1338-1342 (`goActionNotSupported`), `find-status-messages` L1348-1355 (`goHistoryNotSupported`). Comentários L1134-1135 e L1336-1337 dizem "Restaurada (#2054, decisão do dono)". Commits: `c543c6ade` (#2054, 2026-10-28) apagou; `cb6576b2a` (#3035, 2026-11-13) restaurou com guarda. | **OBSOLETA** — main escolheu manter rota + `notSupported` explícito em vez de apagar |
| `src/hooks/evolution/useEvolutionInstance.ts` | remove `setPresence` | `setPresence` em L43-44 e exportado em L60; tem tela consumidora `src/components/connections/InstancePresenceTab.tsx` L14-28 (aba "Presença" do InstanceSettingsDialog, trata `notSupported` como aviso) e testes `InstancePresenceTab.test.tsx`, `useEvolutionApi.test.ts:254`, `useEvolutionApi.payloads.test.ts:170` | **OBSOLETA** — remover quebraria UI e testes atuais |
| `src/hooks/integrations/useWhatsAppStatus.ts` | remove leitura de stories, `contactName` e helpers; mantém `send-chat-presence 'paused'` | Main mantém stories (L249 chama `find-status-messages`; `buildPhoneNeedles` L77, `extractStatusRecords` L109, `contactName` L62/205/217/232/267) e acrescenta memória por instância `statusIndisponivelPorInstancia` (L124-137) que trata `notSupported`/403/404 sem erro no console. Main **removeu de propósito** o `send-chat-presence 'paused'` ao contato (comentário L242-245), que a branch ainda mantinha. Teste `src/hooks/__tests__/useWhatsAppStatus.test.ts:113,243-274` exige a chamada a `find-status-messages`. | **OBSOLETA** — abordagem superada e parcialmente contrária à main |

Guarda de contrato na main: `src/hooks/evolution/__tests__/rotas-chamadas-existem.test.ts` (L1-16, L36) falha se
qualquer ação chamada pelo front sumir do roteador — exatamente o que #2054 causou e esta branch repetiria
(`find-chats` ainda é chamado por `useEvolutionApi.ts:50` / `DeviceChatsPanel.tsx`).

## Veredito
**OBSOLETA** (confiança alta). A necessidade (não bater em rota inexistente na GO) está coberta na main por
`goActionNotSupported`/`goHistoryNotSupported` + tratamento no front, mantendo as telas na Evolution v2.
Nenhuma lacuna a recuperar. `apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma. (Nada da branch faz sentido portar: cada remoção contraria código vivo com UI e teste na main.)

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA. `apagar_branch_seguro = true`.** Tentei refutar e não achei um único hunk
de valor ≥ médio fora da main.

Método: `git diff ee294749175799481deb9fc69e1d31fac6675f3e origin/claude/fix-evolution-go-gaps-d6-261019-1548`
lido inteiro (3 arquivos, +8/−130).

1. **O diff é deleção pura.** As únicas 8 linhas adicionadas são resíduo de remoção, não trabalho novo:
   - `useEvolutionInstance.ts:49` → a mesma linha de export sem `setPresence` (o `missing_sample` do JSON é
     artefato de deleção, não lacuna);
   - `useWhatsAppStatus.ts` → `return { instanceName: null };` / `return { instanceName: connection?.instance_id ?? null };`
     (encolhimento do `ContactConnectionInfo` depois de tirar `contactName`), `await Promise.allSettled([`,
     `setStatusMessages([]);` e o comentário "Status messages (stories) are not supported by Evolution GO".
   - `supabase/functions/evolution-api/index.ts` → `added: 0`. Zero linhas novas, confirmado no diff.
   Portanto não existe hunk portável: a branch só apaga.

2. **A substituição alegada cobre a necessidade, verificada no arquivo da main:**
   - `origin/main:supabase/functions/evolution-api/index.ts` L1134-1140 — `set-presence` com
     `if (isGoFlavor) return goActionNotSupported('set-presence', corsHeaders);` e comentário "Restaurada (#2054)";
   - L1336-1342 — `find-chats` "Restaurada (#2054, decisão do dono)" + `goActionNotSupported`;
   - L1347-1355 — `find-status-messages` + `goHistoryNotSupported`, com o comentário explicando que o #2054
     tirou a rota "por engano — esta TEM chamador" e a Edge passou a responder 404 a cada abertura do painel.
   Ou seja: a main não ignora o GO_GAPS D6; resolve-o com `notSupported` explícito, que é estritamente
   melhor que apagar (preserva a v2 e devolve erro semântico no GO).

3. **As deleções quebrariam código vivo na main** (`git grep … origin/main`):
   - `setPresence`: `useEvolutionInstance.ts:43-44,60`, consumido em `InstancePresenceTab.tsx:21,28` e exigido
     por `useEvolutionApi.test.ts:48,254-257`, `useEvolutionApi.payloads.test.ts:170`,
     `InstancePresenceTab.test.tsx:19,24` (este último já testa o caminho `notSupported: true`);
   - `find-chats`: `DeviceChatsPanel.tsx:12`, `rotasPendentesUi.test.tsx:49,61,65`;
   - `find-status-messages`: `useWhatsAppStatus.ts:249`, `useWhatsAppStatus.test.ts:113,243,254,274`;
   - guarda de contrato `rotas-chamadas-existem.test.ts:4,36,81,102-107` falharia.

4. **A main está à frente da branch no mesmo arquivo.** `useWhatsAppStatus.ts` da main tem a memória
   `statusIndisponivelPorInstancia` (≈L124-137) com `STATUS_HTTP_PERMANENTES = {401,403,404,405,501}` +
   `notSupported`, que silencia o 404 no console sem perder stories na v2 — o problema que a branch
   resolvia apagando a feature. E a main removeu de propósito o `send-chat-presence 'paused'` ao contato
   (comentário ≈L242-247: "o cliente recebia um sinal de presença sem o atendente estar digitando"), que
   esta branch **mantinha**. Mergear a branch regrediria esse ponto.

5. **Cronologia confirmada** — `git log -S'find-status-messages' origin/main -- supabase/functions/evolution-api/index.ts`:
   `c543c6ade` (#2054, 2026-10-28) apagou; `cb6576b2a` (#3035, 2026-11-13) restaurou com guarda. A branch
   (tip `5615e53d9`, 2026-10-19) é anterior às duas e perdeu a discussão.

Nenhuma lacuna adicional. Nada a recuperar.
