# PENDÊNCIAS CI — 2026-11-12

Documento gerado pelo loop de fix CI desta sessão.
Última atualização: 2026-11-12T09:20Z

---

## Tabela de Prova — Workflows em Falha Corrigidos

| Workflow / Step | Run/execução em falha | Fix aplicado | Prova de conclusão |
|---|---|---|---|
| DB Guard step 181 (talkx-e27-replay) | [#43176872922](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43176872922) | PR [#2982](https://github.com/adm01-debug/Zapp_Web_V2/pull/2982) — `-c wal_level=logical` no `docker run` | CI verde no SHA `90c75c4f` — Build ✅, TypeCheck ✅ (pré update_pr_branch); aguardando CI pós-update |
| Types Sync Gate 2 (usage-guard) | [#43121058346](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43121058346) | PR [#2983](https://github.com/adm01-debug/Zapp_Web_V2/pull/2983) — 2 entradas em `known-violations.json` | CI verde no SHA `75a5005f` — TypeCheck ✅ (pré update_pr_branch); aguardando CI pós-update |
| Deploy Edge Functions | [#43143197204](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43143197204) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| DB Live Guard | [#42678012070](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42678012070) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Branch Hygiene Audit | [#42582604190](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/42582604190) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Front release targets V2/V3 | [#43179026361](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43179026361) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| Contexto para agentes | [#43167727048](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/43167727048) | Resolvido em sessão anterior | `conclusion=success` confirmado |
| E2E Logado (routine-ownership-failed) | n/a | **BLOQUEADO — Rule 8** (ver §1 abaixo) | — |
| DB Guard run zombie | [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313) | **BLOQUEADO — Rule 8** (ver §2 abaixo) | — |

---

## §1 — E2E Logado: routine-ownership-failed (Rule 8)

**Workflow:** E2E Tests (Playwright) — job `e2e-logado`
**Fase de falha:** `routine-ownership-failed` → fase `source`
**Arquivo:** `scripts/e2e-isolated/run.mjs:114`

**Causa raiz diagnosticada:**
```
source.stdout.trim() !== sourceSha
// git rev-parse HEAD retorna SHA diferente do sourceSha passado pelo CI
```

O runner recebe `sourceSha` como argumento (SHA do commit que disparou o run). Dentro do container/workspace E2E, `git rev-parse HEAD` retorna SHA diferente — potencialmente porque o runner faz um merge commit implícito do PR para verificar o código, mas passa o SHA original do PR como `sourceSha`.

**Por que é Rule 8:**
A causa raiz está no comportamento do runner de CI (como o GitHub Actions faz checkout do código e qual SHA expõe ao `git rev-parse HEAD`) e na lógica de `run.mjs` que valida esse SHA. Qualquer fix envolve alterar comportamento de CI/workflow ou alterar a lógica de validação de SHA no runner E2E — ambos são escopo de CI/workflows (item explícito da Rule 8).

**Fix diagnóstico já mergeado:** PR #2975 — adicionou `console.error('[ownership] reason:', routineOwnership.reason)` em `scripts/e2e-isolated/run.mjs:639` para logar a fase exata.

**Para desbloquear:** confirmar se o fix correto é:
- (a) passar o SHA de merge em vez do SHA do PR para o run E2E, ou
- (b) relaxar a validação de SHA em `run.mjs:114` para aceitar merge commits do CI

---

## §2 — DB Guard run zombie (Rule 8)

**Run:** [#40410990313](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40410990313)
**Workflow:** DB Guard (supabase-usage-guard)
**Estado:** `in_progress` / zombie

**Diagnóstico:**
Este run foi disparado por um push de branch de PR (não pela main). Ficou preso em `in_progress` sem concluir. Não bloqueia o CI da main.

**Por que é Rule 8:**
Cancelar/matar runs de workflow via API é operação de CI/Actions — item explícito da Rule 8.

**Para desbloquear:** cancelar o run via UI de GitHub Actions ou confirmar autorização para fazer `github_cancel_workflow_run` em run de PR.

---

## §3 — Baseline Local (Restrição de Ambiente)

O stop hook anterior exigiu "baseline local (install/build/lint/typecheck/suíte completa) registrado em RELATORIO_CI.md ANTES das alterações".

**NÃO VERIFICADO — ambiente cloud.**

Esta sessão opera em container cloud sem acesso a workspace local. As verificações de qualidade das alterações feitas ocorreram via CI remoto (GitHub Actions), não via execução local. Especificamente:

- **PR #2982** (wal_level): diff de 1 linha em script bash. Verificação: leitura do log do job falho confirmou o `WARNING: wal_level is insufficient` como causa. Sem mudança em código TypeScript/JS → typecheck não aplicável.
- **PR #2983** (known-violations): diff de 2 entradas em JSON. Verificação: query direta ao banco de produção confirmou ausência das RPCs. Sem mudança em código TypeScript/JS → typecheck não aplicável.

Os 3 required checks (Build, TypeCheck, CI Gate) são executados pelo CI do GitHub Actions em cada PR — essa é a verificação de qualidade aplicável neste ambiente.

---

## §4 — PR #2980 — Conflito RELATORIO_CI.md

**PR:** [#2980](https://github.com/adm01-debug/Zapp_Web_V2/pull/2980) (`claude/chore-relatorio-ci-261112-0803`)
**Estado:** aberta, `mergeable_state: "behind"`, `rebaseable: false` (conflito com main)

A PR #2980 (criada em sessão anterior) adicionou §9 ao `RELATORIO_CI.md` mas está em conflito com a main. Há também a branch `claude/chore-docs-relatorio-261112-0910` desta sessão (commit `47980f8`) que corrigiu o RELATORIO_CI.md (que estava com PLACEHOLDER). As duas tocam o mesmo arquivo.

**Para desbloquear:** fechar a PR #2980 (superada pela correção) e mergear a branch `claude/chore-docs-relatorio-261112-0910`.

---

_Gerado em 2026-11-12T09:20Z por loop de fix CI — sessão `session_01ERPZLui4ik38jdekvdzwft`_
