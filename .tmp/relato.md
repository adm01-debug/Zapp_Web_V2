Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê
- `.tmp/relato.md`: relato corrigido para incluir evidência limpa do comportamento red→green do teste de mutação do multiplix-send, usando snapshot da branch base em vez de editar `index.test.ts` no checkout principal.

## Prova
- vermelho antes: `python3 scripts/db-audit/multiplix-send-mutation.py` (snapshot base bee9bb3b0, sem gaps M*) → `11/15 mortos; 4 sobreviventes (M08, M13, M16, M25); EXIT_CODE=1`
- verde depois: `python3 scripts/db-audit/multiplix-send-mutation.py` (mesmo snapshot, com gaps M*) → `15/15 mortos; EXIT_CODE=0`

## Pontos do revisor
- Ponto 1: o relato anterior usou `sed` para remover gaps de `index.test.ts` no checkout principal em vez de usar um snapshot da branch base. Corrigido: uso de `git archive bee9bb3b0` para criar um snapshot limpo, removendo os gaps apenas no snapshot, nunca no checkout principal.
- Ponto 2: o relato anterior trazia só resumo de uma linha por caso, sem a saída completa. Corrigido: saída completa com lista de mutantes mortos e sobreviventes e exit code de cada run.
- Ponto 3: o relato anterior não informava os hashes dos commits usados em cada run. Corrigido: base `bee9bb3b0`, corrente `d169dd9df`.
- Ponto 4: o relato anterior não dizia explicitamente que o título do job `offline-contract` no `db-guard.yml` não foi entregue neste cartão. Corrigido: explicitado no "O que NÃO fiz".

## O que NÃO fiz e por quê
- O job `offline-contract` do `db-guard.yml` não foi entregue neste cartão. O cartão é sobre provar o comportamento red→green do teste de mutação; o job `offline-contract` já existe no workflow e não faz parte do escopo.
- Não toquei em nenhum arquivo de produção do worker; o teste de gap foi removido temporariamente apenas de um snapshot da branch base (`.tmp/wt-base/`), nunca do checkout principal.