Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê
Nenhum arquivo de código alterado. O cartão valida o comportamento red→green do teste de mutação do worker do Multiplix (`scripts/db-audit/multiplix-send-mutation.py`). A prova usa um snapshot da branch base (`git archive bee9bb3b0`) para rodar o script sem editar `index.test.ts` no checkout principal.

## Prova
- vermelho antes: `python3 scripts/db-audit/multiplix-send-mutation.py` (snapshot base, sem gaps M*) → `11/15 mortos; 4 sobreviventes (M08, M13, M16, M25); EXIT_CODE=1`
- verde depois: `python3 scripts/db-audit/multiplix-send-mutation.py` (mesmo snapshot, com gaps M*) → `15/15 mortos; EXIT_CODE=0`

## O que NÃO fiz e por quê
- O job `offline-contract` do `db-guard.yml` não foi entregue neste cartão. O cartão é sobre provar o comportamento red→green do teste de mutação; o job `offline-contract` já existe no workflow e não faz parte do escopo.
- Não toquei em nenhum arquivo de produção do worker; o teste de gap foi removido temporariamente apenas de um snapshot da branch base (`.tmp/wt-base/`), nunca do checkout principal.