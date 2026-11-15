# Dossiê — claude/fix-testes-unitarios-minimo-251025-1230 (PR #2249)

**Veredito: INCORPORADA** (confiança alta) · apagar branch: **seguro**

## Propósito
2 commits (1edc676f0, c1952c450) sobre merge-base 2d97c44cf: destravar testes unitários (tooltip do
HighContrastToggle, mock de canal em TalkXA11yNomePapel, nome acessível nos selects do editor de template)
e dois fixes de runtime: logout esvazia fila offline; canal de notificações do chat de equipe com tópico
único e preferências por ref (HZ5-09). 5 arquivos, +33/-11.

Tudo chegou à `main` pelo commit **e1f2ee4dd** (2026-10-27, `fix(test): destrava o CI Gate da main
(136 → 0 arquivos vermelhos)`) — `git log -S` aponta esse commit como origem das 5 mudanças.
A pré-classificação CONFLICT vem só de texto diferente com a mesma intenção.

## Arquivo × achado × evidência (origin/main)

| Arquivo | Branch queria | Na main | Evidência |
|---|---|---|---|
| `src/components/talkx/TalkXTemplateEditor.tsx` | `Label htmlFor` + `SelectTrigger id` em Categoria/Status (`tpl-categoria`, `tpl-status`) | Mesma ligação, ids `talkx-template-categoria` / `talkx-template-status` | main:630-632 e 637-639 |
| `src/components/talkx/__tests__/TalkXA11yNomePapel.test.tsx` | mock `channel()` encadeável (`on` devolve o próprio objeto) | `channel: () => { const ch = {}; ch.on = () => ch; ch.subscribe = () => ch; return ch; }` | main:123 |
| `src/components/theme/__tests__/HighContrastToggle.test.tsx` | mocks de viewport + rect pequeno para a dica sair à direita | Mesmo teste (`data-side` = `right`) resolvido com rect zerado via `getBoundingClientRect` mockado | main:77-89 |
| `src/hooks/auth/useAuth.tsx` | `await offlineSendQueue.clear()` no SIGNED_OUT | `esvaziarFilaDeEnvioOffline()` (try/catch) chamado no SIGNED_OUT e no `signOut` (SEC-FRONTEND-04) — superset | main:12, 25-32, 173-175, 248 |
| `src/hooks/chat/useTeamChatNotifications.ts` | `uniqueRealtimeTopic('team-chat-notifications')`, prefs por ref, deps só `profileId` | `uniqueRealtimeTopic` (main:9, 161); `notifSettingsRef`/`isQuietHoursRef` lidos no listener (main:144-149, 207-208); deps `[profile]` (main:254, comentário HZ5-09). `permission/showNotification` saíram do hook — main usa `Notification` direta (main:218) | — |

## Lacunas a recuperar
Nenhuma. As 11 linhas "missing" em `useTeamChatNotifications.ts` são `profileId` vs `profile.id` e a forma
do ref (um `prefsRef` vs dois refs) — comportamento idêntico; `showNotification/permission` não existem
mais na main por decisão posterior (notificação direta via `Notification`).

## Banco / edges / workflows
Não há.

## Verificação adversarial

Veredito verificado: **INCORPORADA** (concordo com a triagem). Branch pode ser apagada.

Tentei refutar hunk por hunk o `git diff 2d97c44cf origin/claude/fix-testes-unitarios-minimo-251025-1230` (5 arquivos, +33/-11). Nenhum hunk de valor ≥ médio ficou fora da `main` (`dac285f62`).

1. `src/components/talkx/TalkXTemplateEditor.tsx` — branch pôs `htmlFor`/`id` = `tpl-categoria`/`tpl-status`. `origin/main:src/components/talkx/TalkXTemplateEditor.tsx:630,632,637,639` tem o mesmo par `Label htmlFor` + `SelectTrigger id` com os ids `talkx-template-categoria`/`talkx-template-status`. O teste que a branch queria destravar existe na main e é o juiz: `origin/main:src/components/talkx/__tests__/TalkXA11yNomePapel.test.tsx:313,328-329` (`getByRole('combobox', { name: 'Categoria' })` / `'Status'`). O `missing_sample` do JSON é diferença de texto (nome do id), não de função.
2. `TalkXA11yNomePapel.test.tsx` — mock de canal encadeável está em `origin/main:...:123` (`const ch: Record<string, unknown> = {}; ch.on = () => ch; ch.subscribe = () => ch;`), equivalente ao da branch.
3. `HighContrastToggle.test.tsx` — o mesmo teste `data-side=right` está em `origin/main:src/components/theme/__tests__/HighContrastToggle.test.tsx:77-89`, resolvido com `getBoundingClientRect` zerado em vez de viewport+rect pequenos. O `mockRestore` explícito da branch não é lacuna: `origin/main:...:53-54` tem `afterEach(() => vi.restoreAllMocks())`.
4. `src/hooks/auth/useAuth.tsx` — a main é superset: `origin/main:src/hooks/auth/useAuth.tsx:12` (import), `:26-28` (`esvaziarFilaDeEnvioOffline` → `offlineSendQueue.clear()`), chamada no `SIGNED_OUT` (`:175`) **e** no `signOut` (`:249`), caminho que a branch não cobria. Coerente com `line_check.missing_in_main: 0` do JSON.
5. `src/hooks/chat/useTeamChatNotifications.ts` — `uniqueRealtimeTopic('team-chat-notifications')` em `origin/main:...:9,161`; preferências por ref (HZ5-09) em `:144-149` e `:207-208`.

Execução: `npx vitest run src/components/theme/__tests__/HighContrastToggle.test.tsx src/components/talkx/__tests__/TalkXA11yNomePapel.test.tsx` → 2 arquivos, 15 testes, 0 falhas. Os 5 arquivos do item são idênticos entre `HEAD` (346c62601) e `origin/main` (`git diff --stat origin/main HEAD -- <os 5>` vazio), então a execução vale como prova do conteúdo da main.

Origem na main confirmada: `e1f2ee4dd` "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)" é ancestral de `origin/main`.

Diferença residual (valor BAIXO, não muda o veredito): a branch trocava as deps do efeito para `[profileId]`; a main mantém `[profile]` com decisão explícita em comentário (`origin/main:src/hooks/chat/useTeamChatNotifications.ts:254`). Efeito prático: se o objeto `profile` for recriado com o mesmo id (ex.: `refreshProfile`), a main recria o canal — inofensivo desde que `uniqueRealtimeTopic` está no lugar (era isso que derrubava a tela). Não justifica resgatar a branch.
