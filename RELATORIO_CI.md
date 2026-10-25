# Relatório de CI — Correção de Workflows com Falha

**Data:** 2026-10-25  
**Branch de correção:** `claude_05/festive-carson-ub43wu`  
**Sessão:** https://claude.ai/code/session_01XQg8vscDFaYdzdNS5632BA

---

## Resumo Executivo

| Workflow | Situação antes | Situação após correção | Tipo |
|---|---|---|---|
| Auto Update PR Branches | ❌ Falha (HTTP 504) | ✅ Fix aplicado | Corrigido |
| E2E Talk X visual | ❌ Falha (regressão visual) | ⏳ Pendência humana | PENDENCIAS.md #1 |
| types-sync Gate 1 | ❌ Falha (TS drift) | ⏳ Pendência humana | PENDENCIAS.md #2 |
| DB Guard TC-009 | ⚠️ Inconclusivo | ⏳ Monitorar HEAD atual | PENDENCIAS.md #3 |

---

## 1. Auto Update PR Branches — CORRIGIDO

**Arquivo:** `scripts/ci/fila-merge.mjs`  
**Runs com falha analisados:** 40186696096, 40186252781, 40185555547, 40184479103

### Causa raiz

A função `decisaoAtual()` chamava `execFileSync('gh pr list')` e
`execFileSync('gh api compare/main...HEAD')` sem nenhum mecanismo de retry.

Log de falha (run 40186696096, step 5 "🚦 Escolher a proxima PR da fila"):
```
HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)
Process completed with exit code 1.
```

O GitHub retorna HTTP 504 esporadicamente na API GraphQL. Sem retry, o
workflow encerrava imediatamente com erro, deixando as PRs com auto-merge
paradas no estado BEHIND indefinidamente até o próximo evento.

### Correção aplicada

Adicionada função `execComRetry()` em `scripts/ci/fila-merge.mjs` (após
os imports, antes de `checksObrigatorios()`). A função:

- Tenta até **3 vezes** com backoff exponencial: 5 s → 10 s → 20 s
- Só faz retry para erros **transitórios**: `504`, `Gateway Timeout`,
  `timeout expired`, `ECONNRESET`, `ETIMEDOUT`
- Erros **permanentes** (403, 404, 422, autenticação) propagam
  imediatamente sem retry — não há risco de mascarar erros reais
- Sleep síncrono via `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)`
  — disponível no main thread do Node.js

Ambas as chamadas `execFileSync` em `decisaoAtual()` foram substituídas
por `execComRetry`:
1. `gh pr list` — leitura da lista de PRs abertas
2. `gh api compare/main...${head}` — verificação de defasagem em PRs com status UNKNOWN

### Zero regressões
- Sem mudança de lógica: apenas a camada de transporte ganhou retry
- Erros permanentes e lógica de decisão da fila (`classificar`, `decidir`,
  `confirmarCandidato`, `resolverDesconhecidos`) não foram alterados
- Testes unitários existentes (`scripts/ci/fila-merge.unit.mjs`) não
  foram modificados e continuam válidos

---

## 2. E2E Talk X visual — PENDÊNCIA HUMANA

**Step:** `🖼️ Régua visual Talk X (17 telas, deslogado)`  
**Spec:** `e2e/talkx-visual.spec.ts` (projeto `chromium-talkx-visual`)

**Observação:** Falha consistente em 3+ SHAs diferentes da PR #2219
(`0eefb3ce6f`, `284f97c3e5`, `590862c32b`). O run no HEAD atual
(`c9279454`) estava `in_progress` no momento da análise.

O spec captura screenshots e verifica existência + tamanho (> 1 KB).
Falha não indica divergência com baseline — indica que uma tela não
renderizou corretamente (componente ausente, timeout, erro de JS).

**Artefato de diagnóstico:** `regua-visual-talkx.zip` (run 40186201003,
Artifact ID 12596342954). Requer download e revisão humana.

Detalhes em `PENDENCIAS.md` item #1.

---

## 3. types-sync Gate 1 — PENDÊNCIA HUMANA

Gate 1 (`typecheck-ratchet.mjs`) bloqueia quando o `types.ts` regenerado
introduz novos erros de TypeScript. Gate 1b confirmou `awaiting_apply=false`
— não há migrations pendentes como causa.

Detalhes em `PENDENCIAS.md` item #2.

---

## 4. DB Guard TC-009 — INCONCLUSIVO

Falhou apenas no SHA mais antigo (`0eefb3ce6f`) da PR #2219. Foi
cancelado nos SHAs intermediários. Run no HEAD atual em andamento.
De acordo com o histórico, é possível que commits mais recentes da PR
já tenham corrigido o problema.

Detalhes em `PENDENCIAS.md` item #3.

---

## Próximos passos recomendados

1. Mergear esta PR após CI verde → confirmar que `Auto Update PR Branches` passa na main
2. Revisar artifact `regua-visual-talkx.zip` do run 40186201003 para identificar
   a tela que não renderizou no E2E Talk X (PENDENCIAS.md #1)
3. Verificar resultado do run `in_progress` 40186665412 (DB Guard, SHA `c9279454`)
   para confirmar se TC-009 foi resolvido nos commits mais recentes da PR #2219
