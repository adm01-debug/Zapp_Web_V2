# Database Truth — Structural Sweep — 2026-10-03

Baseline main: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`.

## Superfície
- 801 arquivos SQL em `supabase/migrations/**`.
- 7 SQL em `supabase/migrations/_superseded/`.
- 794 SQL fora de `_superseded`.
- 74 diretórios sob `supabase/functions/` contando `_shared` (aprox. 73 funções/serviços).
- 183 arquivos em `scripts/db-audit/`.
- 61 arquivos em `tests/contracts/`.

A contagem estrutural não prova quantas migrations estão aplicadas. Paridade deve vir de ledger/guards, nunca do nome do arquivo.

## _superseded
Sete migrations SQL estão explicitamente em `_superseded`. Classificação: HISTORICAL_REQUIRED / DELETE-X. Não reaplicar nem apagar durante limpeza.

## Riscos ativos
Issue #1862: db-live-guard reporta contrato vivo quebrado.
Issue #1454: types-sync falha ao propor sincronização.
PR #1863: automation/types-sync aberto.
Issue #377: auditoria de banco/RLS/ledger/paridade histórica ainda aberta.

Esses itens tornam incorreto declarar Database Truth "verde" apenas porque migrations existem no Git.

## Incidentes históricos que viram hard rules
- migrations/DDL aplicadas fora da ordem merge/deploy já causaram drift;
- colisões de versão ocorreram em vários módulos;
- há migrations históricas sem prova reconstruível;
- Telefonia e Team Chat possuem histórico especialmente sensível;
- `CREATE INDEX CONCURRENTLY`/gateway e ferramentas de apply possuem limitações documentadas no CLAUDE.md.

## Regra operacional
Antes de qualquer DDL futuro:
1. confirmar banco canônico;
2. verificar PRs concorrentes;
3. reservar/versionar conforme convenção vigente;
4. comparar arquivo ↔ ledger ↔ schema/manifest;
5. executar guards;
6. manter banco externo read-only;
7. não editar migration já aplicada;
8. registrar evidência pós-apply.

## Conclusão
A camada de banco possui infraestrutura de auditoria madura, mas também grande histórico de drift. O plano de reconciliação não deve "limpar migrations"; deve primeiro fechar/parcializar os guards e construir paridade comprovada.
