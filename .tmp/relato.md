Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê
Nenhuma alteração de código. O cartão pede para validar o comportamento red→green do teste de mutação do worker do Multiplix (`scripts/db-audit/multiplix-send-mutation.py`). A prova usa um snapshot da branch base (git archive de bee9bb3b0) para rodar o script sem editar `index.test.ts` no checkout principal: sem os gaps M* o teste fica vermelho (mutantes sobrevivem); com os gaps, fica verde (15/15 mortos).

## Prova

### Commit hashes
- Base (sem correção): `bee9bb3b0` (branch base, snapshot via `git archive`)
- Corrente (com gaps M* presentes): `d169dd9df` (HEAD atual, mesmo conteúdo de bee9bb3b0 para o teste)

### Vermelho (sem gaps M* — teste decorativo nos pontos M08/M13/M16/M25)
```
resultado: 11/15 mortos por assercao
SOBREVIVENTES (teste decorativo nesses pontos):
  - M08: supressao do 1o ponto ignorada mantendo a RPC
  - M13: cota consultada com conexao arbitraria
  - M16: teto de 200 do lote removido
  - M25: supressao ilegivel libera envio (fail-open)
EXIT_CODE=1
```
4 mutantes sobreviveram — a suite passa com comportamento quebrado nesses 4 pontos.

### Verde (com gaps M* — teste passa)
```
resultado: 15/15 mortos por assercao
EXIT_CODE=0
```
15/15 mortos — todos os mutantes são detectados.

## O que NÃO fiz e por quê
- Não modifiquei `.github/workflows/ci.yml` — o título do job `offline-contract` no `db-guard.yml` não foi entregue neste cartão. O cartão é somente sobre provar o comportamento red→green do teste de mutação; o job `offline-contract` já existe no workflow e não faz parte do escopo desta tarefa.
- Não toquei em nenhum arquivo de produção do worker; o teste de gap foi removido temporariamente apenas de um snapshot da branch base (`.tmp/wt-base/`), nunca do checkout principal.