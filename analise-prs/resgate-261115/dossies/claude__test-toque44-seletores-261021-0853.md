# Dossiê — claude__test-toque44-seletores-261021-0853 (PR #2152)

**Ref:** `origin/claude/test-toque44-seletores-261021-0853` · tip `b19f9107` · merge-base `bac62ba9` · 1 commit útil (`3eca13073 test(e2e): spec de toque 44px volta ao verde com seletores do app real`) + 1 merge de main.

## Propósito
Fazer `e2e/a11y-toque-44px.spec.ts` voltar ao verde: (1) seletor do botão fechar do dialog `'Close'` → `'Fechar'`; (2) mock `mapa-mocks.ts` passa a responder a RPC `app_bootstrap` com matriz de permissões não-vazia (PK-20) e a sonda `/auth/v1/health`; (3) comentário do `abrirDialogo` reescrito.

## Arquivo × achado × evidência

| Arquivo | Hunk da branch | Achado | Evidência na main (`origin/main`) |
|---|---|---|---|
| `e2e/a11y-toque-44px.spec.ts` | `'Close'` → `'Fechar'` (3 ocorrências) | **JÁ NA MAIN** | linhas 228, 279, 284 usam `{ name: 'Fechar' }`; introduzido por `82e22bbb8` (2026-10-28, "Corrige E2E de Inbox, mapa, Contatos, Email e Talk X") — `git log -S"name: 'Fechar'"` |
| `e2e/a11y-toque-44px.spec.ts` | comentário em `abrirDialogo` (3 linhas, cita `a11y-fab-cabecalho.spec.ts`) | **NÃO NA MAIN** — só texto de comentário | main linhas 136-137 mantêm o comentário antigo ("O FAB é `fixed z-20`…"). Zero efeito em execução. `e2e/a11y-fab-cabecalho.spec.ts` existe na main (`git ls-tree`), então o comentário seria válido, mas é cosmético. |
| `e2e/fixtures/mapa-mocks.ts` | `const BOOT_FAKE = {…}` + `page.route(/app_bootstrap/)` | **JÁ NA MAIN, em forma superior** | main linhas 47-62 definem `BOOT_FAKE` (mesmos campos; `user_settings: { onboarding_completed: true }` em vez de `null`, data `2026-10-15`); linha 110 registra `app_bootstrap` depois do catch-all; linhas 82-95 ainda parametrizam `role`/`onboardingCompleted`. Commit `82e22bbb8`. |
| `e2e/fixtures/mapa-mocks.ts` | `page.route(/\/auth\/v1\/health/)` | **JÁ NA MAIN** | main linha 122 (`// A sonda de conectividade usa no-cors…`). Commit `82e22bbb8`. |

As 9 linhas "missing_in_main" do line_check em `mapa-mocks.ts` são apenas diferenças de texto (comentários, `user_settings: null` vs objeto, `fetched_at` diferente, `profile` literal vs `PERFIL_FAKE.id`); o comportamento é idêntico ou melhor na main.

## Veredito
**INCORPORADA** (confiança alta). Todo o comportamento da branch está em `origin/main` via `82e22bbb8`, numa versão mais completa (mock parametrizado por role/onboarding). A única diferença residual é um comentário de 3 linhas em `abrirDialogo` — valor `nenhum`.

`apagar_branch_seguro = true`.

## Lacunas a recuperar
Nenhuma funcional. Se alguém quiser o comentário atualizado (opcional, cosmético), em `e2e/a11y-toque-44px.spec.ts` linhas 136-137:

```diff
-  // O FAB é `fixed z-20` e no celular os cards da lista passam por cima dele no hit-test,
-  // então ele é acionado pelo teclado (o que também prova que ele é alcançável por foco).
+  // Acionado pelo teclado: prova que o FAB é alcançável por foco. O toque direto
+  // está provado em a11y-fab-cabecalho.spec.ts (medição: o centro do FAB sempre
+  // recebe o hit-test; o portal z-20 no body vence os cards).
```

## Verificação adversarial

**Parecer: CONCORDO com a triagem — INCORPORADA, `apagar_branch_seguro = true`.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da main.

Escopo real da branch (conferido, não confiando no JSON): `git diff --stat bac62ba9 origin/claude/test-toque44-seletores-261021-0853` = 2 arquivos, 29+/5-, só `e2e/`. Commits: `3eca13073` (útil) + `b19f9107d` (merge de main). Sem `src/`, edge, migration ou workflow.

Hunk por hunk:

1. `'Close'` → `'Fechar'` (3 ocorrências) — **na main**. `git grep -n "name: 'Close'\|name: 'Fechar'" origin/main -- e2e/a11y-toque-44px.spec.ts` devolve só `Fechar` nas linhas 228, 279 e 284; zero `Close`. Proveniência: `git log -S"name: 'Fechar'" origin/main -- e2e/a11y-toque-44px.spec.ts` → `82e22bbb8` (2026-10-28), e `git merge-base --is-ancestor 82e22bbb8 origin/main` confirma que é ancestral.
2. `BOOT_FAKE` + `page.route(/app_bootstrap/)` — **na main, em versão superior**. `origin/main:e2e/fixtures/mapa-mocks.ts` linhas 47-62 definem `BOOT_FAKE` com o mesmo `role_permissions` não-vazio (`perm-multiplix`/`multiplix.dispatch.create`), e a linha 110 registra `app_bootstrap` depois do catch-all de RPC (mesma ordem, mesmo efeito). A main ainda vai além: `mockAppShell` recebe `{ role, onboardingCompleted }` (linhas 82-95) e monta o bootstrap por role — `role !== 'admin'` zera `role_permissions`. A branch é um subconjunto rígido disso.
3. `page.route(/\/auth\/v1\/health/)` — **na main**, linha 122, mesmo handler (`json(route, {})`). Mesmo commit `82e22bbb8` (`git log -S"app_bootstrap" origin/main -- e2e/fixtures/mapa-mocks.ts`).
4. Comentário do `abrirDialogo` (3 linhas, cita `a11y-fab-cabecalho.spec.ts`) — **não na main**: `origin/main:e2e/a11y-toque-44px.spec.ts` linhas 136-137 mantêm o texto antigo. Único resíduo. É comentário: zero efeito em execução, nenhuma asserção, nenhum seletor. Valor **nenhum** — não sustenta PERDIDA_PARCIAL.

Diferenças residuais de `mapa-mocks.ts` que o `line_check` marcou como "missing_in_main" são só texto/dados equivalentes ou piores na branch: `user_settings: null` (branch) vs `{ onboarding_completed: true }` parametrizado (main) — a versão da branch deixaria o guarda de onboarding sem resposta útil; `fetched_at: '2026-09-15'` vs `'2026-10-15'` — irrelevante; `profile: { id: '0000…0001', name: 'Visual E2E' }` literal vs `{ id: PERFIL_FAKE.id, name: PERFIL_FAKE.name }` — mesmos valores.

Também conferi o lado inverso (`removed_still_in_main: 2`): são exatamente as 2 linhas do comentário antigo que a branch substituiu — nada de comportamento foi apagado da main.

Nada a resgatar. Veredito mantido.
