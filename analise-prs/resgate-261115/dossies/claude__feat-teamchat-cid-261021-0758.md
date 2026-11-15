# Dossiê — claude__feat-teamchat-cid-261021-0758 (PR #2146)

**Propósito:** `TeamChatView` lê `?cid=<conversationId>` da URL (`?view=team-chat&cid=`) e seleciona a conversa — lado receptor do deep-link da notificação do chat da equipe (E90). 1 commit real (`9723899ed`) + 7 merges de `main`. PR #2146 fechada em 2026-11-01 sem merge ("conteúdo absorvido pela main").

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência na `main` |
|---|---|---|---|
| `src/components/team-chat/TeamChatView.tsx` | BOTH_CHANGED / CONFLICT (28 linhas ausentes) | **INCORPORADA por reescrita mais completa.** A main tem `readCidParam()` (l.13-16), `stripCidParam()` (l.18-25), listener `zapp:navigate` (l.52-70), seleção só quando o cid existe na lista (l.80-101), espera a lista carregar (`isPending`, l.40), refetch único para conversa recém-criada (l.84-91), e `setShowDetails(false)` ao resolver (l.99). Cobre tudo que a branch fazia e corrige os 4 achados do Qodo na PR (refresh desfazendo seleção, cid pendurado na URL, cid estranho, etc.). | `git show origin/main:src/components/team-chat/TeamChatView.tsx` l.13-107; chegou em `cb6576b2a` (#3035) e `f32855df6` (#3046, "Team Chat ?cid=") |
| `src/components/team-chat/__tests__/TeamChatView.cid.test.tsx` | NEW_FILE_ABSENT_IN_MAIN (70 linhas) | **INCORPORADA por testes equivalentes/superiores.** Os 4 cenários (cid válido ao montar; cid inexistente → vazio; sem cid → vazio; `zapp:navigate` sem remontar) estão em `TeamChatView.deeplink.test.tsx` (10 `it`) e `TeamChatView.deeplink-react-query.test.tsx` (4 `it`). | `git show origin/main:src/components/team-chat/__tests__/TeamChatView.deeplink.test.tsx` l.59-85 ("seleciona a conversa do ?cid=", "nova notificação com a tela aberta troca…", "cid que não pertence ao usuário é ignorado") |

**Lado emissor (não tocado pela branch, mas necessário para a feature funcionar):** na main `useTeamChatNotifications.ts` l.243 e l.274 chamam `navigateToView('team-chat', { cid })`, e `useNavigationHistory.ts` l.202 sanitiza `cid` como UUID. Ponta a ponta fechada.

## Única diferença residual
A branch também escutava `popstate` (back/forward). A main escuta só `zapp:navigate` e **remove `cid` da URL ao consumir** (`stripCidParam`, `replaceState`), logo nenhuma entrada de histórico guarda `cid` — `popstate` nunca traria um cid. Valor: nenhum (design da main torna o listener redundante). Não recuperar.

## Veredito
**INCORPORADA** (confiança alta). Nada a portar. `apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA procurando qualquer hunk útil do `git diff 3617a2a origin/claude/feat-teamchat-cid-261021-0758` ausente na main. Nada de valor ≥ médio sobrou. **Concordo: INCORPORADA, branch segura para apagar.**

Checagens feitas (git somente leitura):

1. `TeamChatView.tsx` — o diff da branch acrescenta 1 helper (`readTeamChatCidFromUrl`) + 1 `useEffect` (38 linhas). A main (`git show origin/main:src/components/team-chat/TeamChatView.tsx`) tem: `readCidParam()` l.13-16, `stripCidParam()` l.18-25, listener `zapp:navigate` l.52-70, strip na montagem l.72-74, espera da lista (`deepLinkAguardaLista`, l.38) l.36-40, recarga única para conversa recém-criada l.76-93, descarte definitivo l.94-95, `setPickedId`/`setShowDetails(false)` l.97-101 e `setSelectedId` que zera o deep-link l.103-107. Superconjunto funcional do hunk da branch, incluindo o `setShowDetails(false)`.
2. Teste novo da branch (`TeamChatView.cid.test.tsx`, 4 `it`: cid válido ao montar / cid inexistente / sem cid / `zapp:navigate` sem remontar) — todos os 4 cenários existem na main em `TeamChatView.deeplink.test.tsx` (10 `it`, l.59-147) e `TeamChatView.deeplink-react-query.test.tsx` (4 `it`, l.96-141). Nenhum cenário exclusivo da branch.
3. Único hunk candidato a lacuna: o listener de `popstate`. Confirmei que é morto na main — `useNavigationHistory.ts` l.185/187 grava a URL com `cid` via `pushState`/`replaceState`, e a `TeamChatView` da main apaga o `cid` daquela mesma entrada com `replaceState` (`stripCidParam`, l.18-25) na montagem e em cada `zapp:navigate`; logo nenhuma entrada de histórico guarda `cid` e um back/forward nunca entrega um cid a consumir. Valor: nulo.
4. Segundo candidato: `?.trim()` e `try/catch` no leitor da branch (main não apara nem protege). Irrelevante — o emissor sanitiza: `useNavigationHistory.ts` l.202 `cid: value => (UUID_PARAM_RE.test(value) ? value : null)`, então cid com espaço nunca chega pela notificação; por URL digitada, a main descarta após a recarga única (teste l.135 e react-query l.96). `new URL(window.location.href)` não lança em navegador.
5. Ponta a ponta na main: emissor em `useTeamChatNotifications.ts` l.243 e l.274 (`navigateToView('team-chat', { cid })`). Feature fechada, sem dependência da branch.

Nenhuma lacuna adicional. Veredito final: **INCORPORADA**; `apagar_branch_seguro = true`.
