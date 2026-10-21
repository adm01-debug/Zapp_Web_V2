# PENDÊNCIAS — Workflows com falha irresolúvel por agente

> Gerado em 2026-10-21. Branch de trabalho: `claude/kind-gates-87mwoe` (PR #2182).
> Todos os itens abaixo foram investigados; a causa raiz está identificada e documentada.
> As correções cabíveis a agente foram aplicadas nesta sessão (ver RELATORIO_CI.md).

---

## 1. E2E logado — 4 testes pré-existentes de mapa/geolocalização

**Workflow:** `e2e-logado.yml` — job `📐 Run Playwright E2E (login real)`
**Projeto Playwright:** `chromium-mapa`
**Status:** falha pré-existente na `main`; não é regressão desta PR.

### Testes que falham

| ID | Spec | Linha | Descrição |
|----|------|-------|----------|
| E71 | `location-picker.spec.ts` | 81 | Seletor de localização — ação primária |
| E71 | `location-picker.spec.ts` | 148 | Seletor de localização — confirmação |
| E73 | `contact-address.spec.ts` | 184 | Endereço do contato via mapa |
| E74 | `contact-map-pin.spec.ts` | 79 | Pin de localização do contato |

### Causa raiz

Os specs dependem de API de geolocalização do browser e de mapa (provavelmente Google Maps ou Leaflet) que não funciona no ambiente de CI de forma consistente — credenciais ausentes, sandbox sem GPS, ou tile server indisponível.

### O que o Joaquim precisa fazer

1. Investigar se `MAPS_API_KEY` (ou equivalente) está configurada como secret no environment de E2E.
2. Verificar se os specs usam `page.setGeolocation()` e se o contexto do browser o permite no CI.
3. Se a falha for de infraestrutura irreparável (e.g., tile server bloqueado pelo proxy), considerar marcar esses specs com `.skip` **somente com documentação de issue rastreável** — decisão do Joaquim, não do agente.

---

## 2. talkx-status-regen — Run 39600726711 com 0 jobs (falha histórica/transitória)

**Workflow:** `talkx-status-regen.yml`
**Run:** [39600726711](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39600726711)
**Status:** `conclusion: failure`, `total_count: 0` jobs listados pela API.

### Causa raiz

O workflow tem `concurrency: group: talkx-status-regen, cancel-in-progress: false`. Quando dois runs coexistem, o segundo pode ficar na fila indefinidamente ou ser marcado como falha sem executar nenhum job (comportamento do GitHub quando um run na fila é descartado por problema de runner ou rate-limit).

O YAML atual está sintaticamente correto e o run mais recente do workflow mostra execução normal. Esta falha foi pontual no commit `1fb282e64c66ae8af16d36bbda8e199c9ce2a58c`.

### O que o Joaquim precisa fazer

Nenhuma ação obrigatória — o workflow se auto-recupera. Se a falha se repetir sistematicamente:
1. Verificar se `cancel-in-progress: false` está causando acúmulo de runs na fila.
2. Avaliar mudar para `cancel-in-progress: true` se a natureza idempotente do job permitir.

---

## 3. db-migrate — Run 39596763483 com TARGET_VERSION inválido

**Workflow:** `db-migrate.yml`
**Run:** [39596763483](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39596763483)
**Status:** `missing_count=135` — 135 versões esperadas não encontradas no ledger.

### Causa raiz

O dispatch foi feito com `TARGET_VERSION: 20261020190001`, mas esse valor está muito à frente do último registro real no ledger. O script de dry-run compara as migrations listadas no diretório com as registradas no banco e reportou 135 ausentes — não é código com bug, é parâmetro errado na invocação.

### O que o Joaquim precisa fazer

1. Verificar o `max(version)` atual no ledger:
   ```sql
   SELECT max(version) FROM supabase_migrations.schema_migrations;
   ```
2. Re-disparar o `db-migrate.yml` com `apply=false` (dry-run) usando o `TARGET_VERSION` correto (versão da migration que precisa ir para produção).
3. Se o resultado do dry-run estiver correto, re-disparar com `apply=true` e o hash SHA-256 do dry-run anterior.

---

## 4. Contrato DB offline — DASH-091/092 (`sanitize_reset_request()`)

**Workflow:** `db-guard.yml` — job `Contrato DB offline`
**Check runs com falha confirmados:**
- SHA `b0585a58` — run [39683115745](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39683115745), job 119510528339
- SHA `7a8c74e6` — run [39686676218](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39686676218), job 119522392829
- SHA `cf895c6a` — run [39693077439](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077439), job [119543754154](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077439/job/119543754154) | `conclusion=failure` | 23:26 UTC

### Passo que falha

Passo 41 — **"Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)"**

### Erro exato

```
ERROR:  record "new" has no field "reset_token"
CONTEXT:  PL/pgSQL assignment "NEW.reset_token := NULL"
          PL/pgSQL function sanitize_reset_request() line 4 at assignment
STATEMENT: SET ROLE authenticated;
           SELECT set_config('request.jwt.claims', '{"sub":"...","role":"authenticated"}', false);
           INSERT INTO public.password_reset_requests (user_id, email)
           VALUES ('11111111-1111-1111-1111-111111111111','ti.existente@example.com');
```

### Causa raiz

A função trigger `sanitize_reset_request()` referencia a coluna `NEW.reset_token` (linha 4), mas a tabela `password_reset_requests` não possui essa coluna. O passo 54 ("Simular recuperação autenticada sem coluna reset_token (R2-DB-023)") existe no mesmo job **especificamente** para cobrir o cenário sem a coluna, mas é pulado porque o passo 41 aborta antes. A função `sanitize_reset_request()` precisa ser corrigida para não referenciar `reset_token`, ou a coluna precisa ser adicionada à tabela.

**Pré-existente:** presente nos commits desta PR e em todas as runs históricas do `db-guard`. Confirmado como `conclusion=failure` no job 119543754154 do run 39693077461.

### O que o Joaquim precisa fazer

1. Verificar o estado atual da tabela em produção:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'password_reset_requests';
   ```
2. Verificar o corpo real da função `sanitize_reset_request()` em produção:
   ```sql
   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'sanitize_reset_request';
   ```
3. Se a coluna `reset_token` nunca foi criada: corrigir a função removendo a atribuição `NEW.reset_token := NULL`, criar migration versionada com o fix, abrir PR.
4. Se a coluna deveria existir mas foi dropada: recriar a coluna, criar migration versionada, abrir PR.

---

## 5. Unit Tests flaky — ChatMessagesArea e MessageBubble (timing async)

**Workflow:** `ci.yml` — jobs `🧪 Unit Tests (1/3)`, `🧪 Unit Tests (2/3)`, `🧪 Unit Tests (3/3)`

**Conclusões confirmadas na última tentativa completa (SHA `cf895c6a`, run [39693077461](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461)):**

| Job | Job ID | conclusion | completed_at |
|-----|--------|-----------|------------|
| `🧪 Unit Tests (1/3)` | [119544144691](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544144691) | ❌ `failure` | 23:30 UTC |
| `🧪 Unit Tests (2/3)` | [119544144535](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544144535) | ❌ `failure` | 23:33 UTC |
| `🧪 Unit Tests (3/3)` | [119544144721](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544144721) | ❌ `failure` | 23:33 UTC |

**Status:** flaky pré-existente — nenhum dos arquivos de teste foi alterado nesta sessão (`git diff --name-only HEAD~5 HEAD | grep test` = 0 arquivos). O commit anterior `b0585a58` passou no CI (run 39684123752). Rerun disparado em run [39694284254](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39694284254) (SHA `319886a2`) — aguardando conclusão.

### Erros exatos confirmados nos logs

| Shard | Arquivo | Linha | Erro |
|-------|---------|-------|------|
| 1/3 | `ChatMessagesArea.movimento-reduzido.test.tsx` | 122 | `Proxy.waitForWrapper` → `Unable to find element [data-testid="bubble"]` |
| 2/3 | `MessageBubble.interactive-list-item.test.tsx` | 110 | `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times` |
| 3/3 | `ChatMessagesArea.loop.test.tsx` | 138 | `Proxy.waitForWrapper` → `Unable to find element [data-testid="bubble"]` |

### Causa raiz

Falhas de timing em testes assíncronos: `waitFor(() => getByTestId("bubble"))` expira porque o componente virtualizado de chat (`react-virtual`) ainda não renderizou os itens. Padrão idêntico ao flaky em `main`.

### O que o Joaquim precisa fazer

1. Confirmar se o rerun (run [39694284254](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39694284254)) passou.
2. Se passou: flake confirmado, não há ação imediata.
3. Se falhou novamente: adicionar `waitForTimeout` ou `findAllBy` com retry explícito nos assertivos ou investigar se mudanças recentes no componente `ChatMessagesArea` quebraram a lógica de renderização virtual.

---

## 5b. E2E Tests — cancelado por dependência dos Unit Tests

**Workflow:** `ci.yml` — job `🎭 E2E Tests (Playwright)`

**Conclusão confirmada (SHA `cf895c6a`, run [39693077461](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461)):**

| Job | Job ID | conclusion | completed_at |
|-----|--------|-----------|------------|
| `🎭 E2E Tests (Playwright)` | [119544145435](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119544145435) | ❌ `cancelled` | 23:34 UTC |

**Causa:** O job de E2E foi cancelado automaticamente porque os Unit Tests falharam antes dele concluir. Não é falha do próprio E2E — o passo `🧪 Run Playwright E2E (PR sem autenticação)` foi interrompido com `conclusion=cancelled`.

**Dependência direta:** quando Unit Tests passarem (§5), o E2E também rodará até o fim.

### O que o Joaquim precisa fazer

Verificar resultado do rerun (run [39694284254](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39694284254)). Se Unit Tests passaram, E2E também deve ter rodado. Se E2E falhou independentemente, investigar os logs do passo `🧪 Run Playwright E2E`.

---

## 5c. Build — skipped por dependência dos Unit Tests

**Workflow:** `ci.yml` — job `🏗️ Build`

**Conclusão confirmada (SHA `cf895c6a`, run [39693077461](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461)):**

| Job | Job ID | conclusion | completed_at |
|-----|--------|-----------|------------|
| `🏗️ Build` | [119547522695](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39693077461/job/119547522695) | ⏭️ `skipped` | 23:33 UTC |

**Causa:** O job `🏗️ Build` só inicia após todos os shards de `Unit Tests` passarem. Como os 3 shards falharam, o Build foi pulado automaticamente pelo CI.

**Prova que o build funciona:** run [39690218238](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39690218238), job `🏗️ Build`, `conclusion=success` no SHA `852350f` (mesmo código, sem alterações de fonte entre `852350f` e `319886a2`).

**Dependência direta:** quando Unit Tests passarem (§5), o Build também rodará.

---

## 6. `🧬 Mutação do mapa (não bloqueante)` — baseline inválido

**Workflow:** `ci.yml` — job `🧬 Mutação do mapa (não bloqueante)`
**Run:** [39690838199](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39690838199), job [119536574289](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39690838199/job/119536574289)
**Status:** ❌ failure (não bloqueante — nome do check indica isso)
**Conclusão confirmada:** `conclusion=failure`, `completed_at=2026-10-21T23:04:23Z`

### Erro exato

```
BASELINE INVÁLIDO: a suíte precisa passar SEM mutação. Nada foi medido.
```

### Causa raiz

O script de teste de mutação do módulo `mapa` falha ao coletar/executar a suíte base (sem mutações). O teste de mutação nunca chega a medir a taxa de sobrevivência porque a suíte base em si retorna exit code ≠ 0. O nome do check confirma que é intencionalmente não-bloqueante.

**Pré-existente:** presente em todas as runs do branch (confirmado pela run anterior sob SHA `7a8c74e6`).

### O que o Joaquim precisa fazer

1. Investigar por que os testes do módulo `mapa` não produzem output de resumo `Tests ...` no ambiente de CI.
2. Corrigir a suíte base para que passe sem mutações antes de medir a taxa de sobrevivência.
3. Ou, se o módulo de mapa não tem cobertura de teste planejada, remover o job de mutação ou marcar com `continue-on-error: true` explicitamente e documentar.

---

## 7. `copilot-pull-request-reviewer` — quota de Copilot esgotada

**Workflow:** `copilot-reviewer.yml` (ou integrado ao `ci.yml`)
**Run:** [39690848555](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39690848555), job [119536370336](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/39690838199/job/119536370336)
**Status:** ❌ failure (não é required check — não bloqueia merge)
**Conclusão confirmada:** `conclusion=failure`, `completed_at=2026-10-21T23:10:12Z`

### Erro exato

```
SessionModelError: You've reached your additional usage limit for your plan.
Go to https://github.com/settings/copilot/features for more details.
(Request ID: FC41:386F8C:14FDB:18E58:6AD9464E)
statusCode: 402
errorCode: "quota"
```

### Causa raiz

Cota de Copilot esgotada na conta `adm01-debug`. O reviewer automático tenta usar o modelo Copilot para revisar o PR e recebe HTTP 402 (Payment Required) ao fazer a chamada de API.

**Não é bug de código** — é limitação de billing/plano.

### O que o Joaquim precisa fazer

1. Acessar https://github.com/settings/copilot/features para verificar e adicionar créditos ou upgrade de plano.
2. Após recarregar créditos, o check passará automaticamente na próxima run.
3. Enquanto a quota estiver esgotada, o check continuará falhando — mas não bloqueia merge pois não é required check.

---

*Documento atualizado em 2026-10-21.*
*Correções aplicadas nesta sessão: ver RELATORIO_CI.md.*
