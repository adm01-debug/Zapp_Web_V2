# Relatório CI — Auditoria de Falhas (2026-10-23)

Branch de correção: `claude/magical-pasteur-iz2pgy`

---

## Baseline — última run falhando na main

| Workflow | Run ID | Falha principal |
|---|---|---|
| CI/CD Pipeline | 39986231918 | Unit Tests (3 shards) + E2E cancelado em cascata |
| DB Guard (offline) | 39986231888 | DASH-091/092: ERROR cannot drop built-in PG17 role |
| E2E logado | 39986232122 | HTTP 400 nas credenciais de teste (E2E_TEST_PASSWORD) |

---

## Diagnóstico por falha

### 1. Unit Tests — `FilesTab.fase6` (`grid-cols-4` em vez de `grid-cols-5`/`grid-cols-8`)

**Shard:** 1/3  
**Arquivo:** `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx`  
**Erro:** `expected 'grid gap-3 grid-cols-4' to contain 'grid-cols-8'`

**Causa raiz:** `src/test/setup.ts` definia `getBoundingClientRect` em `HTMLElement.prototype`. O spy dos testes usa `vi.spyOn(Element.prototype, 'getBoundingClientRect')`. `HTMLElement.prototype` é mais próximo do objeto na cadeia de protótipos que `Element.prototype` — então o mock do setup **sombrava** o spy dos testes, retornando `width: 800` sempre. `columnsCapacity(800) = 4`, quando o spy deveria passar `width: 959` → `5` ou `width: 1474` → `8`.

**Correção:** Mover o mock de `getBoundingClientRect` de `HTMLElement.prototype` para `Element.prototype` em `setup.ts`.

---

### 2. Unit Tests — `ChatMessagesArea.loop` (0 bubbles renderizados)

**Shard:** 2/3 e 3/3  
**Arquivo:** `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx`  
**Erro:** `waitFor` timeout — `getAllByTestId('bubble')` não encontra elementos

**Causa raiz:** `@tanstack/react-virtual` v3 usa `scrollElement.clientHeight` para calcular o tamanho do viewport. O JSDOM não implementa layout CSS — `clientHeight` retorna `0` independente de `style="height:600px"`. Com viewport `0`, `getVirtualItems()` devolve `[]` e nenhuma bolha é renderizada.

**Correção:** Adicionar mock global de `HTMLElement.prototype.clientHeight` (retorna `600`) e `clientWidth` (retorna `800`) em `setup.ts`.

---

### 3. DB Guard — DASH-091/092 (`ERROR: cannot drop role ... required by the database system`)

**Arquivo:** `scripts/db-audit/docker-shim`, handler `rm)`  
**Erro:**
```
ERROR: cannot drop role pg_read_all_settings because it is required by the database system
ERROR: cannot drop role pg_create_subscription because it is required by the database system
FATAL: role "root" does not exist
```

**Causa raiz:** Quando o container shim falha durante `run` (ex.: por timeout de conexão), o arquivo `$STATE/$cname.roles` fica vazio. No `rm`, `comm -23 <roles_atuais> <vazio>` mostra **todas** as roles atuais como "novas" — incluindo roles built-in do PG17 (`pg_read_all_settings`, `pg_create_subscription`, `pg_checkpoint`, etc.). O loop tenta dropá-las e PostgreSQL rejeita com `required by the database system`.

**Correção:** Adicionar `[[ "$role" == pg_* ]] && continue` no loop do handler `rm)`.

---

### 4. E2E logado — HTTP 400 nas credenciais (BLOQUEADO)

**Arquivo:** `.github/workflows/e2e-logado.yml`  
**Erro:** `teardown falhou - nao bloqueia CI: login do usuario de teste recusado (HTTP 400)`  
**Job:** `deslogado-principal`, step `📐 Run Playwright E2E (login real)`

**Causa raiz:** As credenciais do usuário de teste E2E (`E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`) estão rejeitadas com HTTP 400 pelo Supabase Auth. Possíveis causas: senha expirada/alterada, conta bloqueada por tentativas excessivas, ou usuário deletado.

**Status:** PENDENTE — requer intervenção do Joaquim. Ver `PENDENCIAS.md`.

---

## Correções aplicadas neste PR

| Arquivo | Mudança | Falha corrigida |
|---|---|---|
| `src/test/setup.ts` | `getBoundingClientRect` movido de `HTMLElement.prototype` → `Element.prototype`; adicionado mock de `clientHeight`/`clientWidth` em `HTMLElement.prototype` | Unit Tests shards 1, 2, 3 |
| `scripts/db-audit/docker-shim` | `[[ "$role" == pg_* ]] && continue` no loop `rm)` | DB Guard DASH-091/092 |

---

## Impacto esperado após merge

- ✅ `🧪 Unit Tests` (3 shards) — verde
- ✅ `Contrato DB offline` — verde
- ✅ `🏗️ Build`, `🔍 Lint & TypeCheck`, `🔒 Security Audit` — não afetados, já passavam
- ✅ `🎭 E2E Tests (Playwright)` (ci.yml) — desbloqueado (era cancelado em cascata pelos unit tests)
- ⚠️ `E2E logado` (workflow separado) — segue falhando até Joaquim corrigir as credenciais
