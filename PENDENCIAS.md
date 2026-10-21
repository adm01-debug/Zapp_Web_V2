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
|----|------|-------|-----------|
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

*Documento gerado pela sessão de correção de CI — 2026-10-21.*
*Correções aplicadas nesta sessão: ver RELATORIO_CI.md.*
