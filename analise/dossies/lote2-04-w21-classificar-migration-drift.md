# Dossiê — `claude/w21-classificar-migration-drift`

**Veredito:** PENDENTE  
**Confiança:** ALTA  
**Tip SHA:** `8b401af1bb17bff3eed71f3bba4da6b21391ed96`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/claude/w21-classificar-migration-drift origin/main` → `dbabef518` (base comum existe)
- `git diff dbabef518..origin/claude/w21-classificar-migration-drift --stat` → 2 arquivos: `scripts/db-audit/check-migration-drift.mjs` e `scripts/db-audit/check-migration-drift.test.mjs`
- `grep -n "classificar\|duplicateVersions\|classifications" scripts/db-audit/check-migration-drift.mjs` → 0 matches na main
- `git show origin/claude/w21-classificar-migration-drift:scripts/db-audit/check-migration-drift.mjs | grep -c "classificar"` → múltiplas ocorrências na branch

## Conteúdo exclusivo da branch

A branch adiciona ao `check-migration-drift.mjs`:
- Flag `--classificar` (novo modo de operação)
- Classe `duplicateVersions` (detecção de versões duplicadas no ledger)
- Classe `classifications` (sistema de classificação de drift por severidade)
- 4 novas classes de análise

Nenhum desse conteúdo chegou à main.

## Conclusão

Branch PENDENTE com funcionalidade não mergeada. Requer decisão: mergear o `--classificar` ou abandonar o desenvolvimento. **Não deletar.**
