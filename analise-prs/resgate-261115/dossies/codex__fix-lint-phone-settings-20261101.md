# Dossiê — codex__fix-lint-phone-settings-20261101 (PR #2464)

Branch `origin/codex/fix-lint-phone-settings-20261101` · tip `b46eabe4` · merge-base `1252bb5a` (2026-11-01) · triagem anterior: JA_NA_MAIN.

## Propósito
Corrigir lint/typecheck: atributo JSX `aria-label` duplicado no botão "dispensar" de `QueueAlertsDisplay.tsx` e ajuste no teste `useInboxFilters.type-url.test.tsx`. Commits: `e90cc1575 fix(ui): remove lint novo no telefone e nas configuracoes`, `36760d7e7 fix(types): corrige erros de JSX e filtro da inbox`, `e0ce20a3d` (resolução de conflito: phone-input/useUserSettings já na main), `b46eabe42` (merge main). Diff útil contra o merge-base: 2 arquivos, +3/-4.

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | INCORPORADA (byte-idêntico à main) | JSON `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` |
| `src/components/queues/QueueAlertsDisplay.tsx` | INCORPORADA por outra via: a main removeu o `aria-label` duplicado no commit `2ebe682c1` (2026-11-08, `fix(typecheck): remove contratos obsoletos da inbox`), mantendo só `` aria-label={`Dispensar alerta ${alertLabels[alert.type]}`} `` (main:93; `git grep -c aria-label` = 1). Lint resolvido. Única diferença: a branch unia os dois textos (`da fila ${alert.queueName}: ${alertLabels[alert.type]}`); a main ficou sem o nome da fila no label. | `git show 1252bb5a:…QueueAlertsDisplay.tsx` linhas 91 e 94 = dois `aria-label`; `git show 2ebe682c1 -- …` remove a linha 91; `git grep -n aria-label origin/main -- src/components/queues/QueueAlertsDisplay.tsx` → só linha 93 |

## Veredito
**INCORPORADA** (confiança alta). O objetivo da branch (eliminar o atributo duplicado que quebrava lint/typecheck) está na main desde `2ebe682c1`. Resíduo: texto do `aria-label` sem o nome da fila — cosmético/a11y, valor baixo, opcional.

## Lacuna residual (opcional, valor baixo)
`src/components/queues/QueueAlertsDisplay.tsx` linha 93 (main). Se quiser o label mais descritivo para leitores de tela quando há alertas de várias filas:
```diff
-                  aria-label={`Dispensar alerta ${alertLabels[alert.type]}`}
+                  aria-label={`Dispensar alerta da fila ${alert.queueName}: ${alertLabels[alert.type]}`}
```
Nada de banco, edge ou workflow. Branch pode ser apagada.

## Reexame de commits intermediários

Parecer: **REFATORACAO_INTERNA** — apagar a branch continua seguro.

Cadeia de commits (`git log --oneline --no-merges 1252bb5a..origin/codex/fix-lint-phone-settings-20261101`):
`e90cc1575` → `36760d7e7` → `e0ce20a3d` (+ merge `b46eabe42`).

Quem removeu: `e0ce20a3d fix: resolve conflito com main — phone-input e useUserSettings já corrigidos na main`
(autor adm01-debug, 2026-11-01 18:16). Não é um commit que promete correção e desfaz proteção: é resolução de
conflito que **adotou a versão da main** nos dois arquivos.

Prova de que nada se perde — os dois arquivos são **byte-idênticos** em `e0ce20a3d`, na ponta da branch e na `origin/main`:
```
git diff e0ce20a3d:src/components/ui/phone-input.tsx   origin/main:src/components/ui/phone-input.tsx    → vazio
git diff e0ce20a3d:src/hooks/system/useUserSettings.ts origin/main:src/hooks/system/useUserSettings.ts  → vazio
git diff origin/codex/fix-lint-phone-settings-20261101:<ambos> origin/main:<ambos>                      → vazio
```

### Achado 1 — `src/components/ui/phone-input.tsx` (2 linhas, add em `e90cc1575`)
Intenção de `e90cc1575`: tirar o efeito colateral que rodava **durante o render** (mutação de refs no corpo do
componente), embrulhando-o em `useEffect` + import de `useEffect`.
A main faz o mesmo com `useLayoutEffect` (main:1 `import { useCallback, useLayoutEffect, useMemo, useRef }`;
main:46-52 `useLayoutEffect(() => { if (currentRaw !== lastEmittedRawRef.current) { … } });`). Implementação
equivalente — e sincronizada antes do paint, o que é mais correto para um ref que o `onChange` seguinte lê.
Nenhuma validação, guarda, teste ou estado perdido. Valor a recuperar: **nenhum**.

### Achado 2 — `src/hooks/system/useUserSettings.ts` (2 linhas, add em `e90cc1575`)
Intenção de `e90cc1575`: calar o `react-hooks/exhaustive-deps` trocando `[user?.id, …]` por `[user, …]` nas
deps de `saveSettings` e `saveAppearanceSettings`.
A main resolve o mesmo lint pela via melhor: extrai `const userId = user?.id` (main:193) e usa `[userId, settings]`
(main:246) e `[userId, isLoading, isError, settings.theme, settings.language, settings.compact_mode]` (main:307),
com `if (!userId)` (main:196, 249) e `user_id: userId` (main:208, 273) — mantém a callback estável quando só o
objeto `user` é recriado, o que `[user, …]` não garantia. Valor a recuperar: **nenhum**.

### Observação (não é perda da branch)
No mesmo `e0ce20a3d`, ao adotar a main, caíram vários comentários explicativos de `useUserSettings.ts` e
`phone-input.tsx` ("Bug Qodo", "Bug H", por que `browser_notifications_enabled` não entra no upsert, etc.).
Esses comentários **não eram da branch**: vinham do merge-base `1252bb5a` e foram retirados na própria `main`.
Não há nada a resgatar desta branch por causa disso; se o dono quiser os comentários de volta, é trabalho sobre
a main, fora deste item.

## Verificação adversarial

Parecer: **CONCORDO — INCORPORADA** (confiança alta). Apagar a branch é seguro. Tentei refutar e não achei
nenhum hunk de valor ≥ médio fora da main.

Universo fechado da branch = 4 arquivos (`git show --name-only` de `e90cc1575`, `36760d7e7`, `e0ce20a3d`;
`b46eabe42` é merge da main). Comparados um a um, ponta da branch × `origin/main`:

| Arquivo | `git diff <ref>:<f> origin/main:<f>` |
|---|---|
| `src/components/ui/phone-input.tsx` | vazio (byte-idêntico) |
| `src/hooks/system/useUserSettings.ts` | vazio (byte-idêntico) |
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | vazio (byte-idêntico) |
| `src/components/queues/QueueAlertsDisplay.tsx` | 1 linha (o `aria-label`) |

`git diff 1252bb5a origin/codex/fix-lint-phone-settings-20261101` = 2 arquivos, +3/−4; nada de banco, edge
ou workflow (confirma `counts` do JSON).

**Prova de que a main cobriu o mesmo objetivo, pelo mesmo caminho**: `2ebe682c1`
("fix(typecheck): remove contratos obsoletos da inbox", 2026-11-08) toca exatamente os **mesmos dois
arquivos** da branch e faz as **mesmas duas correções**: remove o `aria-label` duplicado (linha 91 do
merge-base) e tira o campo `tags` das fixtures do `useInboxFilters`. `git grep -c aria-label origin/main --
src/components/queues/QueueAlertsDisplay.tsx` = 1 (main:93). Não é remoção disfarçada: a mensagem do commit
declara as duas remoções e o resultado é o lint resolvido.

**Achado novo que a triagem não registrou** — a lacuna residual não é só "baixo valor": aplicá-la **quebra
testes vigentes da main**, que fixam o texto exato do label sem o nome da fila:
- `src/components/queues/__tests__/QueueCard.a11y.test.tsx:134,149` — `name: 'Dispensar alerta contatos aguardando'`
- `src/components/queues/__tests__/QueuesView.test.tsx:170-171` — dois `getByRole` com o texto exato
- `src/components/queues/__tests__/QueuesView.metricasRpc.test.tsx:130` — `/^Dispensar alerta /`

Ou seja: o formato da main é contrato testado. Enriquecer o label com `${alert.queueName}` é trabalho sobre a
main (1 linha + 3 testes), não resgate desta branch. Isso reforça INCORPORADA em vez de PERDIDA_PARCIAL.

**Intermediários descartados em `e0ce20a3d`** (conferidos no diff de `e90cc1575`, não só no texto do dossiê):
- `phone-input.tsx`: a branch embrulhou a mutação de refs em `useEffect`; a main faz o equivalente com
  `useLayoutEffect` (main:1, main:46-50) — antes do paint, mais correto para ref lido pelo `onChange`.
- `useUserSettings.ts`: a branch trocou `[user?.id, …]` por `[user, …]`; a main extrai `const userId = user?.id`
  (main:193) e usa `[userId, …]` (main:246, main:307) — callback estável, solução melhor.
Nenhuma validação, guarda, teste ou estado perdido nos dois casos.

Evidências (comandos rodados nesta verificação): `git diff --stat 1252bb5a origin/codex/…`;
`git diff <ref>:<arquivo> origin/main:<arquivo>` nos 4 arquivos; `git show 2ebe682c1 --stat` e
`git show 2ebe682c1 -- src/components/queues/QueueAlertsDisplay.tsx`;
`git grep -c aria-label origin/main -- src/components/queues/QueueAlertsDisplay.tsx`;
`git grep -n "Dispensar alerta" origin/main -- src e2e`; `git show e90cc1575 -- <phone-input> <useUserSettings>`;
`git show origin/main:src/components/ui/phone-input.tsx | grep -n useLayoutEffect`.
