# Relatório de CI — Correção de Workflows com Falha

**Data:** 2026-10-25  
**Branch de correção:** `claude_05/festive-carson-ub43wu`  
**PR:** [#2246](https://github.com/adm01-debug/Zapp_Web_V2/pull/2246)  
**Sessão:** https://claude.ai/code/session_01XQg8vscDFaYdzdNS5632BA

---

## Resumo Executivo

| Workflow / Falha | Situação antes | Situação após | Tipo |
|---|---|---|---|
| Auto Update PR Branches (HTTP 504) | ❌ Falha transitória | ✅ Fix aplicado | Corrigido |
| Unit Tests — HZ5-09 canal TeamChat | ❌ Falha (canal recriado) | ✅ Fix aplicado | Corrigido |
| E2E Talk X visual | ❌ Falha (regressão visual) | ⏳ Pendência humana | PENDENCIAS.md #1 |
| types-sync Gate 1 | ❌ Falha (TS drift) | ⏳ Pendência humana | PENDENCIAS.md #2 |
| DB Guard TC-009 | ⚠️ Inconclusivo | ⏳ Monitorar HEAD atual | PENDENCIAS.md #3 |

---

## Seção 1 — Auto Update PR Branches (fila-merge.mjs)

**Causa raiz:** `execFileSync` sem retry disparava exceção imediata em qualquer erro HTTP 504 do
Gateway (timeouts transitórios da API do GitHub), encerrando o job com falha antes de tentar
atualizar qualquer PR.

**Fix aplicado (`scripts/ci/fila-merge.mjs`):**
- Adicionado helper `execComRetry(cmd, args, opts, { tentativas=3, esperas=[5s,10s,20s] })`
- Retry condicional: só retentar em erros com `504|Gateway Timeout|timeout expired|ECONNRESET|ETIMEDOUT` no stderr
- Espera síncrona via `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)`
- Ambas as chamadas `execFileSync` em `decisaoAtual()` substituídas por `execComRetry`

**Evidência:** commit `dfa808d` na branch `claude_05/festive-carson-ub43wu` contém o diff completo.

---

## Seção 2 — E2E Talk X visual (PENDENCIAS.md #1)

**Causa:** Regressão visual detectada em `e2e-talkx.yml` — o artefato `regua-visual-talkx.zip`
do run 40186201003 indica diferença visual, mas o download do artefato requer autenticação GitHub.

**Bloqueador humano:** Precisa de revisão manual do artefato de screenshots para identificar qual
componente da UI Talk X regrediu.

**Ação necessária:** Baixar artefato do run 40186201003, comparar baseline vs atual, identificar
o componente e aplicar fix visual.

---

## Seção 3 — types-sync Gate 1 (PENDENCIAS.md #2)

**Causa:** Drift de tipos TypeScript (`types.ts` desatualizado em relação ao banco).

**Bloqueador humano:** O `types-sync` requer dispatch manual do workflow + aprovação no environment
`producao-ddl` para regenerar `types.ts` a partir do banco oficial. Nenhum agente pode disparar
esse fluxo autonomamente sem aprovação humana no environment.

**Ação necessária:** Dispatch manual de `types-sync.yml` via GitHub Actions UI.

---

## Seção 4 — DB Guard TC-009 (PENDENCIAS.md #3)

**Causa:** Status inconclusivo no run 40186665412 (SHA `c9279454`) — o job pode ter falhado por
erro transitório de conexão ao banco (pooler timeout), não por drift real.

**Bloqueador humano:** Necessário re-executar `db-guard.yml` via workflow_dispatch e confirmar
que TC-009 passa limpo. Se falhar novamente, o drift precisa ser investigado no banco oficial.

**Ação necessária:** Re-dispatch de `db-guard.yml` e leitura do summary resultante.

---

## Seção 5 — Unit Tests HZ5-09 (canal TeamChat estável)

**Causa raiz:** `useTeamChatNotifications` recriava o canal Supabase a cada mudança de
volume/quiet-hours porque as funções `isQuietHours`, `showNotification` e o objeto `notifSettings`
estavam listados diretamente no array de deps do `useEffect` de assinatura. Cada render com novo
objeto/função criava nova instância de canal, quebrando o contrato do teste HZ5-09.

**Fix aplicado (`src/hooks/chat/useTeamChatNotifications.ts`):**
1. Adicionados 3 refs após `activeIdRef`: `notifSettingsRef`, `isQuietHoursRef`, `showNotificationRef`
2. Nome do canal alterado de `'team-chat-notifications'` para `` `team-chat-notifications:${profile.id}` `` (unicidade por instância)
3. Handler do canal usa os refs (`.current.soundEnabled`, `.current.soundVolume`, `.current.browserNotifications`, `isQuietHoursRef.current()`, `showNotificationRef.current(...)`)
4. Deps do `useEffect` de assinatura reduzidos de 7 itens para `[profile, permission]`

**Evidência:**
- Arquivo: `src/hooks/chat/useTeamChatNotifications.ts` (linhas 144–149 refs, linha 159 canal, linha 257 deps)
- Teste: `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx`
- Resultado local: `Test Files  1 passed (1) / Tests  7 passed (7) / Duration  1.87s`

---

## Baseline local (verificado nesta sessão)

| Verificação | Resultado |
|---|---|
| `bun install --frozen-lockfile` | ✅ exit 0 |
| `bun run build` | ✅ `built in 21.27s`, exit 0 |
| Testes HZ5-09 (`canal-estavel.test.tsx`) | ✅ 7/7 passaram |

---

## Próximos passos recomendados

1. **Mergear esta PR após CI verde** → confirmar que `Auto Update PR Branches` e `Unit Tests` passam na main
2. **Revisar artefato visual Talk X** (PENDENCIAS.md #1) — download do run 40186201003 e análise do componente regredido
3. **Dispatch manual de `types-sync.yml`** (PENDENCIAS.md #2) + **re-run de `db-guard.yml`** (PENDENCIAS.md #3)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XQg8vscDFaYdzdNS5632BA
