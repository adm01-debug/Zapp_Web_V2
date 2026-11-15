# Dossiê — claude/fix-e2e-talkx-ajuda-ctrlk-261113-1629 (PR #3040)

**Tip** `ea59665e2` · **merge-base** `cb6576b2a` · 1 commit, 1 arquivo (`e2e/talkx.spec.ts`, +7 linhas).

## Propósito
Estabilizar o E2E `talkx.spec.ts:108` ("Cmd/Ctrl+K inside the help focuses the search and does not open the palette"), que oscilava no WebKit. A branch adicionava pré-condições antes do `Control+k`: esperar o heading "Ajuda do Talk X", esperar `busca` **já focada** (autofoco) e dar `blur()`.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `e2e/talkx.spec.ts` | ABSENT_APPLIES_CLEAN (5 linhas ausentes) | **OBSOLETA** — a causa real da instabilidade foi corrigida na `main` no código-fonte, sem tocar no teste; e a pré-condição `toBeFocused()` desta branch falharia. | (1) `git log cb6576b2a..origin/main -- src/components/talkx/help/ e2e/talkx.spec.ts` → `91c63ff8c fix(talkx): Ctrl+K na Ajuda não abre mais a paleta de comandos por cima (#3078)` (2026-11-14). O corpo do commit diz: "Era a origem do `talkx.spec.ts:108` instável" e "Nenhum teste foi alterado". Correção: `src/hooks/ui/ctrlKLocal.ts` (novo), `useGlobalKeyboardShortcuts.ts` cede o K quando há `data-ctrl-k-local`, `TalkXHelpCenter.tsx:180` raiz recebe `data-ctrl-k-local=""`. (2) Teste na main continua idêntico ao merge-base: `origin/main:e2e/talkx.spec.ts:108-117`. (3) Pré-condição da branch é inválida: `origin/main:src/components/talkx/help/TalkXHelpCenter.tsx:96-98` `focusSearch = useCallback(() => searchRef.current?.focus(), [])`; `:135-138` `useEffect(() => { if (!route.article) focusSearch(); }, [focusSearch, route.article])` — não depende de `docs`; o `<input ref={searchRef}>` só existe quando `docs` está carregado (`:208`, `:217`, `:234`). Logo o autofoco roda com `searchRef.current === null` e não repete após o carregamento → `await expect(busca).toBeFocused()` antes do atalho estouraria o timeout, como alegou o comentário de fechamento (confirmado no código). |

## Veredito
**OBSOLETA** (confiança alta). A necessidade (teste estável) foi coberta pela PR #3078 atacando a causa raiz (dois listeners de captura na janela; o registry global abria a paleta). O hunk da branch não entrou e não deve entrar: sua pré-condição `toBeFocused()` depende de um autofoco que não ocorre após o carregamento lazy dos docs.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Observação lateral (fora do escopo desta branch, não é lacuna)
O autofoco da busca da Ajuda (`TalkXHelpCenter.tsx:135-138`) na primeira abertura só funciona se `docs` já estiver disponível de forma síncrona; com carregamento assíncrono o efeito roda antes do input existir. Se isso incomoda o usuário na prática, é um fix separado (adicionar `docs` às deps ou `autoFocus` no input) — NÃO VERIFICADO em navegador.

## Hunk da branch (referência; não portar)
```diff
@@ -110,6 +110,13 @@ test.describe('Talk X module', () => {
     const busca = page.getByPlaceholder('O que você precisa de ajuda hoje?');
     await expect(busca).toBeVisible();
+    // Mesma corrida do WebKit do teste abaixo: a Ajuda (lazy) registra o ouvinte de
+    // captura do Ctrl+K ao montar. Esperar o título e o foco automático da busca
+    // garante que os efeitos de montagem rodaram; o blur faz o foco após o atalho
+    // provar o comportamento, não o autofoco.
+    await expect(page.getByRole('heading', { name: 'Ajuda do Talk X' })).toBeVisible();
+    await expect(busca).toBeFocused();
+    await busca.blur();
```

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA.** `apagar_branch_seguro = true`. Tentei refutar hunk por hunk (são só 3 comandos efetivos + 4 linhas de comentário, 1 arquivo, 1 commit `ea59665e2`) e nenhum sobrevive com valor ≥ médio.

**1. O diff completo é exatamente o do dossiê** — `git diff cb6576b2a origin/main...` não: `git diff cb6576b2a origin/claude/fix-e2e-talkx-ajuda-ctrlk-261113-1629` devolve 1 hunk em `e2e/talkx.spec.ts` (+7/-0). Não há segundo arquivo escondido.

**2. `await expect(page.getByRole('heading', { name: 'Ajuda do Talk X' })).toBeVisible()` — redundante, valor nulo.** O teste na main já tem `await expect(busca).toBeVisible()` (`origin/main:e2e/talkx.spec.ts:111-112`), e `busca` é precondição **mais forte** que o heading: o heading renderiza sempre (`origin/main:src/components/talkx/help/TalkXHelpCenter.tsx:193`, dentro do `<header>` fixo), enquanto o `<input placeholder="O que você precisa de ajuda hoje?">` só existe no bloco `{docs && !activeArticle && (…)}` (`:215-237`). Esperar `busca` visível já prova montagem **e** docs carregados; o heading não acrescenta nada.

**3. `await expect(busca).toBeFocused()` — inválido, estouraria o timeout. Confirmado linha a linha na main:**
- `focusSearch = useCallback(() => { searchRef.current?.focus(); }, [])` — `origin/main:…/TalkXHelpCenter.tsx:96-98` (deps `[]`, referência estável).
- `useEffect(() => { if (!route.article) focusSearch(); }, [focusSearch, route.article])` — `:136-138`. **`docs` não está nas deps.**
- `useTalkXHelpDocs` é assíncrono: `useState<TalkXHelpDoc[] | null>(null)` + `loadTalkXHelpDocs().then(setDocs)` — `:46-64`. Logo, na montagem `docs === null`, o input não existe, `searchRef.current === null`, o `?.focus()` é no-op; quando `docs` chega, o efeito **não roda de novo** (nem `focusSearch` nem `route.article` mudaram, e `route.article` segue `undefined` em `?view=talkx&screen=help`). O autofoco nunca acontece nessa rota. A pré-condição da branch falharia — exatamente o que o comentário de fechamento da PR #3040 alegou.

**4. `await busca.blur()` — único candidato a valor residual, e ele é zero.** Em tese tornaria a asserção final mais honesta (provar que o atalho focou, não o autofoco). Mas, pelo item 3, o input **nunca está focado** antes do `Control+k`, então `blur()` é no-op e o `toBeFocused()` final já prova só o atalho. Valor: nulo, não baixo.

**5. A substituição alegada cobre a necessidade — abri os arquivos da main:**
- `91c63ff8cff64f9edf87658b134497c05a378c73`, `Sat Nov 14 06:48:07 2026 -0300`, `fix(talkx): Ctrl+K na Ajuda não abre mais a paleta de comandos por cima (#3078)`. Corpo: *"Era a origem do `talkx.spec.ts:108` instável"* / *"Nenhum teste foi alterado nem afrouxado"*.
- `origin/main:src/hooks/ui/ctrlKLocal.ts` existe (`git ls-tree -r --name-only origin/main`).
- `origin/main:src/hooks/ui/useGlobalKeyboardShortcuts.ts:8` importa `CTRL_K_LOCAL_ATTRIBUTE`; `:163-171` o `global-search` cede quando `document.querySelector('[data-ctrl-k-local]')` acha a tela.
- `origin/main:…/TalkXHelpCenter.tsx:180` a raiz tem `data-ctrl-k-local=""`.
- `origin/main:src/components/talkx/help/__tests__/TalkXHelpCenter.ctrlKGlobal.test.tsx` existe e cobre a corrida (monta o registry antes da Ajuda).
A causa raiz (dois listeners de captura na janela, `stopPropagation` não barra o mesmo alvo/fase) foi atacada no código-fonte. Esperas no teste nunca teriam corrigido isso — no máximo mascarado.

**6. Checagens de "foi removido de propósito" e de encaixe:** `git log -S'toBeFocused' --oneline origin/main -- e2e/talkx.spec.ts` → só `ecfdb26ff` (2026-10-09), nada de revert/remoção do hunk; o teste na main segue idêntico ao merge-base (`:108-117`), ou seja o hunk nunca entrou e ninguém o desfez.

**Não verificado:** se o E2E `talkx.spec.ts:108` está de fato estável na CI pós-#3078 (não rodei a suíte). Irrelevante para o veredito: mesmo se ainda oscilasse, este hunk não é o remédio — item 3 o invalida e item 2 o torna redundante.
