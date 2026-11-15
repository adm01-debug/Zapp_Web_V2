# Dossiê — claude__fix-team-chat-deeplink-261108-1932 (PR #2818)

**Ref:** `origin/claude/fix-team-chat-deeplink-261108-1932` · tip `eb15216f` · merge-base `e942c672` (2026-11-13)

## Propósito
Deep-link `?cid=<uuid>` no Chat da Equipe (vindo da notificação): abre a conversa, limpa o `?cid=` da URL,
recarrega a lista uma vez se a conversa não estiver no cache, descarta o pedido se ela continuar ausente
sem tirar o usuário da conversa aberta. Commits úteis: `0eb602d2`, `0985d072`, `ca90d5c0`, `c8c604c7`,
`82d8535f`, `8b666deb` (restante são merges de `main`).

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `src/components/team-chat/TeamChatView.tsx` | BOTH_CHANGED / CONFLICT, 3 linhas "faltando" | **INCORPORADA e estendida.** `git diff <branch> origin/main -- <arquivo>` mostra só 3 hunks: a main troca `isLoading: conversationsLoading` por `isLoading, isPending` + `const conversationsLoading = isLoading; const deepLinkAguardaLista = isLoading \|\| !!isPending;` e usa `deepLinkAguardaLista` nas duas condições (`deepLinkAusente`, `deepLinkedId`). Todo o resto (readCidParam, stripCidParam, pickedId/deepLinkCid/recarga, listener `zapp:navigate`, refetch único, descarte) é byte-idêntico. | `origin/main:src/components/team-chat/TeamChatView.tsx` L28-40, L82-83, L94 · commit `f32855df6` "chore: pacote 2 — … Team Chat ?cid= …" (#3046) |
| `src/components/team-chat/__tests__/TeamChatView.deeplink-react-query.test.tsx` | BOTH_CHANGED / CONFLICT, 4 linhas "faltando" | **INCORPORADA e estendida.** Os 2 testes da branch estão na main textualmente; a main adiciona `h.perfil` (espelha `enabled: !!profile`), `data-loading` no mock da lista, helper `rerenderArvore` e 2 testes novos (cid antes do perfil carregar; perfil que nunca carrega não prende a lista). As 4 linhas "faltando" são só as versões antigas das linhas que a main reescreveu ao estender. | `git diff <branch> origin/main -- <arquivo>` (+38/−? só adições/ajustes) · commit `f32855df6` |
| `src/components/team-chat/__tests__/TeamChatView.deeplink.test.tsx` | IDENTICAL_TO_MAIN | na main | PRESENT_BYTE |
| `src/hooks/chat/__tests__/useTeamChatNotifications.nome-e-clique.test.tsx` | IDENTICAL_TO_MAIN | na main | PRESENT_BYTE |
| `src/hooks/chat/useTeamChatNotifications.ts` | IDENTICAL_TO_MAIN | na main | PRESENT_BYTE |
| `src/hooks/system/useNavigationHistory.ts` | IDENTICAL_TO_MAIN | na main | PRESENT_BYTE |

## Veredito
**INCORPORADA** (confiança alta). A main contém 100% do comportamento da branch e vai além: corrige o caso
de query desabilitada (`enabled: !!profile`) em que `isLoading=false` sem busca feita faria o deep-link ser
descartado contra uma lista vazia. As 7 "linhas em lacuna" são as linhas antigas substituídas por essa
melhoria — nada a portar.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA. `apagar_branch_seguro = true` confirmado.** Os 6 achados (24 linhas) são
iterações da própria branch sobre o mesmo bloco de deep-link: cada versão foi substituída por outra
igual-ou-melhor no commit seguinte, e a versão final está na `origin/main`. Nenhum commit "de correção"
removeu proteção — o único caso em que uma remoção parece suspeita (`setPickedId(null)`) é exatamente o
conteúdo do fix.

Cadeia de commits (`e942c672..eb15216f`, sem merges), toda sobre `src/components/team-chat/TeamChatView.tsx`:
`0eb602d20` (efeito com `setSelectedId`) → `0985d072c` (aplica uma vez + `replaceState` + `navTick`) →
`ca90d5c04` (estado derivado, `readCidParam`/`stripCidParam`, exigido pelo lint
`react-hooks/set-state-in-effect`) → `c8c604c7e` (descarte quando ausente, strip no handler e na montagem) →
`82d8535fe` (recarrega a lista uma vez antes de descartar) → `8b666deba` (deep-link pendente não apaga a
conversa aberta; cid repetido recarrega de novo).

| Achado | Removido por | Intenção sobrevive? | Evidência |
|---|---|---|---|
| `0eb602d20` — efeito `if (conversationsLoading \|\| conversations.length === 0) return; … setSelectedId(cid)` (6 ln) | `0985d072c` | Sim, reescrito | `git show 0985d072c -- src/components/team-chat/TeamChatView.tsx`: o hunk substitui o efeito por versão que aplica uma vez e limpa a URL. O guarda `length === 0` fica obsoleto: na main a lista vazia cai no caminho `deepLinkAusente` → recarga única → descarte (`origin/main:…/TeamChatView.tsx` L80-93) |
| `0985d072c` — `navTick` + efeito com `url.searchParams.get('cid')` (5 ln) | `ca90d5c04` | Sim, reescrito | `git show ca90d5c04`: `navTick` sai, o handler de `zapp:navigate` passa a ler o cid direto (`readCidParam`) e a seleção vira estado derivado. Motivo declarado no commit: lint `react-hooks/set-state-in-effect`. `readCidParam`/`stripCidParam` estão em `origin/main:…/TeamChatView.tsx` L13-25 |
| `0985d072c` — mocks do teste (`isLoading: false`, `TeamChatPanel` simples, `TeamMemberDetails: () => null`) (3 ln) | `c8c604c7e` | Sim, estendidos | `git show c8c604c7e -- …/__tests__/TeamChatView.deeplink.test.tsx`: mock ganha `carregando`, `onToggleDetails` e `TeamMemberDetails` com `data-testid="detalhes"` — necessários para os testes novos. Main: `isLoading: carregando, refetch` (L15) |
| `ca90d5c04` — `setPickedId(null)`, efeito `if (deepLinkCid) stripCidParam()`, `deepLinkedId`, `selectedId = pickedId ?? deepLinkedId` (6 ln) | `c8c604c7e` + `8b666deba` | Sim — a remoção **é** o fix | `strip` virou `useEffect(…, [])` incondicional (main L72-74); `setPickedId(null)` foi removido de propósito: limpava a seleção antes de saber se o cid existia e apagava a conversa aberta quando o pedido era descartado (`git show 8b666deba`, corpo do commit). Main inverte para `selectedId = deepLinkedId ?? pickedId` (L99-105) |
| `c8c604c7e` — `deepLinkMissing` e `deepLinkedId = !conversationsLoading && !deepLinkMissing …` (2 ln) | `82d8535fe` | Sim, estendido | `git show 82d8535fe`: `deepLinkAusente` + estado `recarga` + refetch único; `deepLinkMissing` continua existindo, agora só após a recarga confirmar a ausência. Main L80-95 |
| `c8c604c7e` — teste `'lista carregada SEM a conversa do deep-link descarta o pedido…'` e mock sem `refetch` (2 ln) | `82d8535fe` | Sim, virou **dois** testes | `git show 82d8535fe -- …/TeamChatView.deeplink.test.tsx`: o teste único foi dividido em `'conversa recém-criada que ainda não está na lista: recarrega a lista uma vez e abre'` e `'se a recarga confirmar que a conversa não existe, descarta…'`, ambos presentes em `origin/main:…/TeamChatView.deeplink.test.tsx` L125 e L135 (grep de `it(`) |

Cobertura na main: os 9 testes do arquivo `TeamChatView.deeplink.test.tsx` incluem os sucessores de todo
teste removido na branch; nenhum caso de teste foi perdido. Nada a recuperar.

## Verificação adversarial

**Concordo com a triagem: INCORPORADA, `apagar_branch_seguro = true`.** Tentei refutar e não achei um único
hunk de valor na branch que a `origin/main` não contenha. A branch é subconjunto estrito da main.

Provas que levantei por conta própria (git somente leitura):

1. **Checagem linha a linha de TODAS as adições da branch contra a main.** Para cada um dos 6 arquivos,
   extraí as linhas `+` de `git diff e942c672 eb15216f -- <arquivo>` e procurei cada uma (trim) no arquivo
   correspondente de `origin/main`. Resultado: só 7 linhas ausentes, exatamente as 7 do
   `counts.lines_branch_has_main_lacks` — e todas são a **versão antiga** de linhas que a main reescreveu:
   - `TeamChatView.tsx`: `isLoading: conversationsLoading,`, `!conversationsLoading && !!deepLinkCid …`,
     `const deepLinkedId = !conversationsLoading && !deepLinkAusente …`
   - teste react-query: assinatura antiga do mock `TeamConversationList`, `<div>`, `return render(`,
     `</QueryClientProvider>,`
   Nenhuma delas carrega comportamento que a main não tenha.

2. **4 de 6 arquivos são byte-idênticos** (blob SHA igual nos dois lados):
   `TeamChatView.deeplink.test.tsx` `f0aaba1b`, `useTeamChatNotifications.nome-e-clique.test.tsx` `303a8d6e`,
   `useTeamChatNotifications.ts` `5900f40f`, `useNavigationHistory.ts` `f8fe1b24`.

3. **`TeamChatView.tsx`: `git diff <branch> origin/main` tem só 3 hunks**, todos da main para cima —
   `isLoading`/`isPending` → `deepLinkAguardaLista` e seu uso em `deepLinkAusente` e `deepLinkedId`.
   `readCidParam`/`stripCidParam` (main L13-25), `pickedId`, listener `zapp:navigate`, estado `recarga`,
   refetch único e descarte: idênticos.

4. **A melhoria da main é real, não troca de um bug por outro.**
   `src/hooks/team-chat/useTeamConversations.ts:105` tem `enabled: !!profile`; logo, sem perfil
   `isLoading=false` sem busca alguma, e a regra da branch (`!conversationsLoading`) descartaria o
   deep-link contra lista vazia. A main segura só o deep-link com `isPending` e mantém
   `conversationsLoading = isLoading` para a UI — a lista não fica presa em "carregando".

5. **Nenhum caso de teste perdido.** Os 2 `it(` da branch no teste react-query estão na main (L96 e L109,
   títulos idênticos) e a main acrescenta 2 (`?cid=` antes do perfil carregar; perfil que nunca carrega).
   `TeamChatView.deeplink.test.tsx` é o mesmo blob.

6. **Onde entrou na main:** `cb6576b2a` (#3035) e `f32855df6` (#3046) — `git log origin/main --
   src/components/team-chat/__tests__/TeamChatView.deeplink-react-query.test.tsx`. O tip `eb15216f`
   não é ancestral de `origin/main` (conteúdo reaplicado nesses pacotes, não merge direto) — por isso o
   `CONFLICT` mecânico, que aqui é ruído.

Lacunas adicionais encontradas: nenhuma.
