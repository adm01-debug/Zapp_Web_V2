# Dossiê — claude__feat-talkx-x053-breadcrumb-261102-1130 (PR #2558)

**Branch:** `origin/claude/feat-talkx-x053-breadcrumb-261102-1130` · tip `21be44c6` · merge-base `1252bb5a` (2026-11-01) · 1 commit:
`21be44c62 feat(talkx): breadcrumb clicável no monitor substitui botão solto (X053)`

**Propósito:** na tela de monitor do Talk X, trocar o botão solto "Voltar à campanhas" por um item clicável ("Campanhas") na trilha `ModuleBreadcrumb`, adicionando a prop `onItemClick` à primitiva.

## Veredito: INCORPORADA (confiança alta)

A mesma funcionalidade entrou na `main` em `81a8cd979` (2026-11-08, PR #2793 "fix(talkx): corrige erros TypeScript X054 — ModuleBreadcrumb onItemClick + action optional chaining"), em forma ligeiramente melhor (botão da trilha ganha `aria-label="Voltar à campanhas"` e as classes `h-9 hover:bg-muted/50`, mantendo o teste antigo válido).

| Arquivo | Achado | Evidência na `main` |
|---|---|---|
| `src/components/talkx/kit/primitives.tsx` | **Já na main**, com `onItemClick?: (index:number)=>void` e botão para itens não-finais | `primitives.tsx:46` assinatura; `:53-59` `{onItemClick && i < items.length - 1 ? <button type="button" onClick={() => onItemClick(i)} aria-label={i === items.length - 2 ? \`Voltar à ${item.toLowerCase()}\` : undefined} className="h-9 px-2 ... hover:bg-muted/50 hover:text-foreground truncate transition-colors">` ; `:61` o `<span>` que a linha_check apontou como "removed_still_in_main" é o ramo `else` do mesmo ternário — não é lacuna. Commit: `81a8cd979` (`git log -S'onItemClick'`). |
| `src/components/talkx/TalkXView.tsx` | **Já na main**: botão solto removido, trilha clicável | `TalkXView.tsx:532-535` comentário X053 idêntico ao da branch + `<ModuleBreadcrumb items={['Talk X','Campanhas', monitorCampaign?.name ?? 'Monitor']} onItemClick={(i) => { if (i === 1) backToList(); }} />`; `ArrowLeft` e a string `Voltar à campanhas` não existem mais no arquivo (`grep` vazio). O `</button>` apontado como "still_in_main" é de outro botão do arquivo. |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx` | **Obsoleta na forma; cobertura equivalente na main** | Main manteve o teste antigo (`:313-320`) que busca `button {name:/Voltar à campanhas/}` e checa `h-9` + `hover:bg-muted/50` — na main esse botão agora É o item da trilha (aria-label em `primitives.tsx:57`, classes em `:58`), logo o teste cobre o mesmo elemento. O teste da branch (`getByRole('button',{name:'Campanhas'})`) **falharia** na main, porque o nome acessível do botão passou a ser "Voltar à campanhas" (aria-label sobrepõe o texto). Única asserção sem equivalente: o clique remover `screen=monitor` da URL (ver lacuna abaixo). |

NÃO VERIFICADO por execução: vitest não rodou (sem `node_modules` no clone; `npx vitest` falhou com EOVERRIDE do npm). A prova acima é estática (linhas citadas).

## Lacuna residual (valor baixo, tipo test)

Asserção de comportamento que a main não tem: clicar em "Campanhas" na trilha do monitor volta à lista (URL perde `screen=monitor`). O código já faz isso (`TalkXView.tsx:535`), só não há teste do clique.

Para portar, acrescentar ao teste existente em `src/components/talkx/__tests__/TalkXView.route.test.tsx:313-320` (sem trocar o nome acessível — na main é "Voltar à campanhas"):

```ts
    fireEvent.click(back);
    await waitFor(() => expect(window.location.search).not.toContain('screen=monitor'));
```

Hunk original da branch (referência; o seletor `{ name: 'Campanhas' }` NÃO funciona na main):

```diff
-import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
+import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
@@
-  it('renderiza o botão Voltar à campanhas com classes válidas na tela de monitor', async () => {
+  it('a trilha do monitor tem "Campanhas" clicável que volta à lista (X053)', async () => {
     window.history.replaceState(null, '', '/?view=talkx&campaign=draft_1&screen=monitor');
     render(<TalkXView />);
-    const back = await screen.findByRole('button', { name: /Voltar à campanhas/ });
-    expect(back).toHaveClass('h-9');
-    expect(back).toHaveClass('hover:bg-muted/50');
+    const nav = await screen.findByRole('navigation', { name: 'Trilha de navegação' });
+    const campanhasBtn = within(nav).getByRole('button', { name: 'Campanhas' });
+    expect(campanhasBtn).toBeInTheDocument();
+    fireEvent.click(campanhasBtn);
+    await waitFor(() => expect(window.location.search).not.toContain('screen=monitor'));
   });
```

## Apagar branch: SEGURO
Todo o código útil está na main; o único resíduo (2 linhas de asserção) está colado acima.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar hunk por hunk; nada de valor ≥ médio ficou fora da main.

Diff verificado: `git diff 1252bb5a41123ba4d49efd84d0f91604bff6c87c origin/claude/feat-talkx-x053-breadcrumb-261102-1130` — 3 arquivos.

1. `src/components/talkx/TalkXView.tsx` — **idêntico na main**, comentário incluído.
   - branch: `<ModuleBreadcrumb items={['Talk X', 'Campanhas', monitorCampaign?.name ?? 'Monitor']} onItemClick={(i) => { if (i === 1) backToList(); }} />`
   - main: `git show origin/main:src/components/talkx/TalkXView.tsx` linha **535** — mesma linha, mesmo comentário `{/* X053: trilha clicável — o item "Campanhas" (índice 1) navega de volta à lista. */}` (linha 533).
   - O botão solto `Voltar à campanhas` com `<ArrowLeft />` foi removido da main também: `grep -n ArrowLeft` em `origin/main:src/components/talkx/TalkXView.tsx` → **zero ocorrências**, e o import da linha 4 já está sem `ArrowLeft`. O `removed_still_in_main: 1` do JSON (`</button>`) é falso positivo: `</button>` existe na main em outros lugares, não naquele bloco. Bloco da main (linhas 529-544) não tem botão algum ao lado da trilha.

2. `src/components/talkx/kit/primitives.tsx` — main é **superconjunto** do que a branch propõe.
   - main `ModuleBreadcrumb({ items, className, onItemClick })` com `{onItemClick && i < items.length - 1 ? (<button type="button" onClick={() => onItemClick(i)} aria-label={i === items.length - 2 ? \`Voltar à ${item.toLowerCase()}\` : undefined} className="h-9 px-2 inline-flex items-center rounded-lg hover:bg-muted/50 hover:text-foreground truncate transition-colors">{item}</button>) : (<span …>)}`.
   - A branch entrega só `className="truncate hover:text-foreground transition-colors"`, sem `aria-label`, sem `h-9`, sem `hover:bg-muted/50`, sem área de clique (`px-2 inline-flex items-center rounded-lg`). As 3 linhas de `missing_sample` são a **versão pior** da mesma mudança, não funcionalidade ausente.
   - Entrou por `81a8cd979 fix(talkx): corrige erros TypeScript X054 — ModuleBreadcrumb onItemClick + action optional chaining (#2793)` (`git log --oneline origin/main -3 -- src/components/talkx/kit/primitives.tsx`).

3. `src/components/talkx/__tests__/TalkXView.route.test.tsx` — **única diferença real**, valor baixo e não aplicável como está.
   - main linhas 312-320 mantêm `it('renderiza o botão Voltar à campanhas com classes válidas na tela de monitor')` com `findByRole('button', { name: /Voltar à campanhas/ })` + `toHaveClass('h-9')` + `toHaveClass('hover:bg-muted/50')` — cobre render, nome acessível e classes.
   - a branch troca esse teste por um que clica e checa que a URL perde `screen=monitor`. Essa asserção de clique não existe na main (`grep -n "fireEvent.click" `… no bloco do monitor → ausente).
   - Mas o teste da branch **falharia na main**: o botão da main tem `aria-label="Voltar à campanhas"`, que sobrepõe o texto, logo `getByRole('button', { name: 'Campanhas' })` não casa. Teria de ser reescrito.
   - Comportamento em si já está na main e é o mesmo código (`onItemClick` → `backToList`, TalkXView.tsx:535). Lacuna = 1 asserção de teste, valor **baixo**, abaixo do limiar de médio. Registrada como lacuna adicional, não como motivo para PERDIDA_PARCIAL.

Nenhum sinal de remoção proposital adversa: o commit que trouxe o recurso para a main é um `fix` que o melhora, não um revert.

**Apagar branch: SEGURO.**
