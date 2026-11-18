# CI Baseline — main HEAD `17976eb8b877809ba089660f1fb5b86835573c2d`

Gerado em: 2026-10-24T00:06Z

## TypeCheck

**Resultado:** PASS (exit 0)
Comando: `tsc --noEmit`
Nenhum erro de tipo.

## Unit Tests — falhas pré-existentes no main (NÃO são regressões de PR)

| Arquivo | Teste | Falha |
|---|---|---|
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | `com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid` | expected `grid-cols-4` to contain `grid-cols-5` |
| `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx` | `com 1474 px abre lado a lado (260 px) e o grid cai de 8 para 6` | expected `grid-cols-4` to contain `grid-cols-8` |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.movimento-reduzido.test.tsx` | (linha 122) `waitFor bubble` | `[data-testid="bubble"]` não encontrado |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx` | `suporta troca da lista de mensagens (nova mensagem chega) sem loop` | `[data-testid="bubble"]` não encontrado |

Total de arquivos com falha: 3 (FilesTab.fase6 + ChatMessagesArea.movimento-reduzido + ChatMessagesArea.loop)
Total de testes com falha: 4

## Required checks na branch protection (via API GitHub)

| Check | Status main | É required? |
|---|---|---|
| `🏗️ Build` | SKIPPED (unit-tests falham → build pulado via `needs:`) | **SIM** (skipped=OK) |
| `🔎 TypeCheck` | SUCCESS | **SIM** |
| `🧪 Unit Tests` | FAILURE (4 testes acima) | NÃO |
| `🔒 Security Audit` | SUCCESS | NÃO |
| `Contrato DB offline` | FAILURE (DROP ROLE pg_monitor PG17) | NÃO |
| `🎭 E2E Tests` | NÃO RODA (só push main) | NÃO |

**Conclusão:** Uma PR pode ser mergeada se `TypeCheck=success` e `Build=skipped` (sem erros de tipo). 
Falhas em Unit Tests, Security, DB offline e E2E NÃO bloqueiam merge.

## Referência de regressão

Uma PR introduz regressão se, após merge de teste local, o TypeCheck passar de 0 erros para N>0 erros,
ou se ela adicionar falhas novas em arquivos de teste além dos 3 listados acima.
