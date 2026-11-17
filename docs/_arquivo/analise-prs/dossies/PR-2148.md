# Dossiê PR #2148

**Título:** test(e2e): a11y FAB e cabeçalho — spec Playwright + fixtures de mapa
**Branch:** `claude/test-e2e-a11y-fab-cabecalho-261021`
**Head SHA:** verificar via API
**Base SHA:** verificar via API
**Criado em:** 2026-10-21
**Draft:** Não | **auto_merge:** não configurado | **mergeable_state:** dirty

---

## Veredito

**BLOQUEADO_CONFLITO**

PR está com conflitos ativos (mergeable_state: dirty) e sem auto_merge. Depende de PR2135 (layout do FAB) que foi fechada sem merge.

## Análise com evidência de diff (lido em 2026-10-30)

**Arquivos alterados:** 3 arquivos (2 novos + 1 modificado)

### Diff lido — trechos-chave

**`e2e/a11y-fab-cabecalho.spec.ts`** (NOVO, 161 linhas):
```typescript
// Spec de acessibilidade para FAB e cabeçalho
test('FAB tem área de toque adequada (44x44px mínimo)', async ({ page }) => { ... });
test('Cabeçalho do contato tem contraste WCAG AA', async ({ page }) => { ... });
// 4-5 testes de acessibilidade cobrindo touch area do FAB e contraste do cabeçalho
```

**`e2e/fixtures/mapa-mocks.ts`** (modificado):
```typescript
// Adiciona BOOT_FAKE constant
export const BOOT_FAKE = { ... };

// Adiciona rotas mockadas:
// /rest/v1/rpc/app_bootstrap → retorna BOOT_FAKE
// /auth/v1/health → retorna { status: 'ok' }
```

**`playwright.config.ts`** (modificado):
```typescript
// Adiciona 'fab-cabecalho' ao regex de testMatch do projeto chromium-a11y
testMatch: /a11y.*|fab-cabecalho.*/,
```

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **CONDICIONALMENTE** — spec válido para testar acessibilidade do FAB; mas PR2135 (que implementa o FAB testado) foi fechada sem merge |
| 2 | Traz regressão? | **NÃO** — apenas testes E2E e fixtures; nenhum código de produção modificado |
| 3 | Já está em main? | **NÃO** — mergeable_state dirty; PR não mergeada |
| 4 | Regra de negócio correta? | **SIM** — testes de acessibilidade (área de toque 44×44px, contraste WCAG AA) são corretos e necessários |

## Dependência

PR2135 (fix do FAB e layout) foi fechada sem merge — o código que esta PR testa pode não existir em main. Verificar se os componentes testados (FAB com `::after` pseudo-element) já estão em main por outra via antes de prosseguir.

## Bloqueio

1. `mergeable_state: dirty` — conflitos com main
2. Sem auto_merge configurado
3. Dependência em PR2135 (fechada sem merge)

## Ação necessária

1. Verificar se PR2135 ou equivalente chegou à main por outra via
2. Resolver conflitos com main
3. Configurar auto_merge ou fazer merge manual após CI verde
