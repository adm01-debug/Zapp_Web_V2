# Relatório de CI — Correção de Workflows com Falha

**Data:** 2026-10-25  
**Branch de correção:** `claude_05/festive-carson-ub43wu`  
**PR:** [#2246](https://github.com/adm01-debug/Zapp_Web_V2/pull/2246)  
**Commit do fix (TypeCheck TS1005):** `1426ac66a84c46626fb95b1d48bd84b1ae86d979`  
**Sessão:** https://claude.ai/code/session_01XQg8vscDFaYdzdNS5632BA

---

## 1. Inventário de Workflows com Falha (última execução na `main`)

Fonte: `https://github.com/adm01-debug/Zapp_Web_V2/actions?query=is%3Afailure`

| Workflow | Último run falhando | Check / Step | Causa raiz |
|---|---|---|---|
| `ci.yml` — **🧪 Unit Tests** | execução em `main` antes do fix | `useTeamChatNotifications.nome-e-clique.test.tsx` (4 falhas) + `command-palette.a11y.test.tsx` (9 falhas) | Ver Seções 2 e 3 abaixo |
| `e2e-talkx.yml` — **E2E Talk X** | run 40186201003 (SHA `590862c32b`) | `🖼️ Régua visual Talk X` | Regressão visual — artefato `regua-visual-talkx.zip` |
| `types-sync.yml` — **Types Sync** | roda na `main` em schedule | Gate 1 — `typecheck-ratchet.mjs` detecta novos erros TS | Drift de schema do banco |

---

## 2. Baseline Local (verificado antes de qualquer alteração)

Confirmado via saída do pré-push hook / script CI local (`scripts/ci/typecheck-ratchet.mjs`, `lint-ratchet.mjs`):

| Verificação | Resultado |
|---|---|
| TypeCheck ratchet | baseline=93, atual=75, removidas=18, **novas=0** ✅ |
| Lint ratchet | baseline=819, atual=819, removidas=0, **novas=0** ✅ |
| `bun run build` | ✅ exit 0 (21s) |
| `bun install --frozen-lockfile` | ✅ exit 0 |

---

## 3. Fix 1 — Unit Tests: `useTeamChatNotifications`

**Arquivo:** `src/hooks/chat/useTeamChatNotifications.ts`

**Causa raiz:** O hook chamava `usePushNotifications().showNotification(...)` (API baseada em Service Worker) para emitir notificações de chat interno. Os testes interceptavam chamadas diretas `new Notification(...)` via `FakeNotification` simulando a API nativa do browser. A divergência fazia os 4 testes de `useTeamChatNotifications.nome-e-clique.test.tsx` falharem completamente.

**Fix aplicado:**
- Removida a dependência de `usePushNotifications` e a ref `showNotificationRef`
- Substituído por chamada direta a `showBrowserNotification` de `@/utils/notificationSounds` (usa `new Notification(...)` diretamente — sem Service Worker)
- `useLayoutEffect` simplificado para deps `[notifSettings, isQuietHours]` (sem `showNotification`)
- `useEffect` de assinatura do canal com deps `[profile]` (sem `permission`)

**Resultado local:** `useTeamChatNotifications.nome-e-clique.test.tsx` → **6/6 PASSED** ✅

---

## 4. Fix 2 — Unit Tests: `command-palette.a11y.test.tsx`

**Arquivo:** `src/components/ui/command-palette.tsx`

**Causa raiz 1 — scrollIntoView:** jsdom não implementa `scrollIntoView` — o método existe como `undefined`. `element?.scrollIntoView({ block: 'nearest' })` lançava `TypeError: ... is not a function` porque `?.` antes de `()` só guarda `null`/`undefined` no objeto, não método ausente. Causava crash em mount nos testes 2, 4, 5, 6, 7, 8.

**Fix:** Trocado para `element?.scrollIntoView?.({ block: 'nearest' })` — segundo `?.` guarda contra método `undefined` antes de invocar.

**Causa raiz 2 — ARIA combobox/listbox ausente:** Os testes verificavam `role="combobox"`, `aria-controls="cmd-palette-list"`, `aria-activedescendant`, `role="listbox"`, `role="option"` e `aria-selected` que não existiam no componente.

**Fix:** Adicionados os atributos ARIA completos:
- Input: `role="combobox"`, `aria-label`, `aria-expanded="true"`, `aria-autocomplete="list"`, `aria-controls="cmd-palette-list"`, `aria-activedescendant`
- Botão limpar: `aria-label="Limpar busca"`
- Live region: `role="status" aria-live="polite"` no rodapé
- Container listbox: `id="cmd-palette-list" role="listbox" aria-label`
- Cada item: `id="cmd-option-{id}" role="option" aria-selected={idx === selectedIndex}`

**Resultado local:** `command-palette.a11y.test.tsx` → **9/9 PASSED** ✅

---

## 5. Fix 3 — TypeCheck TS1005: `useTalkXSegments.ts:193` (commit `1426ac66`)

**Arquivo:** `src/hooks/integrations/useTalkXSegments.ts`

**Causa raiz:** Commit `86c9f5c` introduziu regex `/[\\"]/ g` com espaço antes do flag `g`.
O TypeScript interpreta o espaço como separador de expressão e emite `TS1005: ',' expected`
na coluna 53 da linha 193, bloqueando toda a compilação.

**Fix aplicado (linha 193):**
```diff
- const quoted = (v: string) => `"${v.replace(/[\\"]/ g, (c) => (c === '\\' ? '\\\\' : '\\"'))}"`;
+ const quoted = (v: string) => `"${v.replace(/[\\"]/g, (c) => (c === '\\' ? '\\\\' : '\\"'))}"`;
```

**Resultado:** `🔎 TypeCheck` → ✅ `success` confirmado no CI commit `1426ac66`.

---

## 6. Pendências Humanas (PENDENCIAS.md)

| # | Bloqueador | Ação necessária |
|---|---|---|
| 1 | E2E Talk X visual — artefato `regua-visual-talkx.zip` do run 40186201003 | Baixar artefato, identificar `captura-NN.png` ausente/< 1 KB, reproduzir e corrigir o componente |
| 2 | types-sync Gate 1 — drift de schema TS | Inspecionar erros do `types.ts` regenerado vs banco oficial, ajustar consumidores |
| 3 | DB Guard TC-009 (PR #2219) | Verificar resultado do run mais recente daquele PR |
| 4 | DB Guard TC-009 (PR #2246) — `function public.request_department_access(unknown) does not exist` | DDL — verificar assinatura da função em produção; requer aprovação do Joaquim |
| 5 | Unit Tests shard 1/3 — `useTalkXSegments.test.ts:347,371,384,398` | Implementar bridge Singu (`p_contact_ids`) ou marcar `real_sector`/`real_uf` com `comingSoon: true` — decisão de produto |
| 6 | Unit Tests shard 2/3 — `data-testid="bubble"` não encontrado em `ChatMessagesArea` | Adicionar testid ao elemento correto no componente ou atualizar seletores dos testes |
| 7 | Unit Tests shard 3/3 — `useTeamChatNotifications.canal-estavel.test.tsx:154,176` | Verificar condição de disparo de notificação no canal estável; mock não chamado |

---

## 7. Status CI Final — Commit `1426ac66`

Todos os checks verificados contra o commit `1426ac66a84c46626fb95b1d48bd84b1ae86d979` (HEAD do PR #2246).  
**Pré-existência confirmada:** run `40122006424` na `main` (commit `2d97c44`, 2026-10-24) com falhas idênticas nos 3 shards.

| Check | Status | Observação |
|---|---|---|
| `🔎 TypeCheck` | ✅ **success** | Fix da sessão — regex TS1005 corrigido |
| `🔒 Security Audit` | ✅ **success** | — |
| `🧩 Node CI Scripts` | ✅ **success** | — |
| `🧬 Mutação do mapa` | ✅ **success** | não bloqueante |
| `Replay local das migrations` | ✅ **success** | — |
| `🧪 Unit Tests (1/3)` | ❌ **failure** | pré-existente na `main` — `useTalkXSegments.test.ts:347,371,384,398` |
| `🧪 Unit Tests (2/3)` | ❌ **failure** | pré-existente na `main` — `data-testid="bubble"` não encontrado |
| `🧪 Unit Tests (3/3)` | ❌ **failure** | pré-existente na `main` — `canal-estavel.test.tsx:154,176` |
| `🏗️ Build` | ⏭️ skipped | depende de Unit Tests |
| `Contrato DB offline` | ❌ **failure** | DDL — requer aprovação Joaquim (`producao-ddl`) |
| `🎭 E2E Tests (Playwright)` | ⏳ in_progress / desconhecido | — |
| `🎭 Talk X visual` | ❌ **failure** | pré-existente — captura de tela faltando |
| `✅ CI Gate` | ❌ **failure** | upstream failures acima |

---

## 7. Zero Regressões — Confirmação

- TypeCheck: **novas=0** (baseline=93, após=75 — 18 erros pré-existentes removidos pelo diff, nenhum introduzido)
- Lint: **novas=0** (baseline=819, após=819)
- Nenhum teste foi enfraquecido, desabilitado ou alterado para forçar aprovação
- Nenhuma regra de lint/TS foi relaxada
- Nenhuma mudança de comportamento da aplicação fora do previsto no fix

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XQg8vscDFaYdzdNS5632BA
