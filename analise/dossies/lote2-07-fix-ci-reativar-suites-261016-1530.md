# Dossiê — `claude/fix-ci-reativar-suites-261016-1530`

**Veredito:** PENDENTE  
**Confiança:** ALTA  
**Tip SHA:** `a7c3edaeb264d296c123a6ccefbc5b655264b39e`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/claude/fix-ci-reativar-suites-261016-1530 origin/main` → `5721e4f50` (base comum existe)
- `git diff 5721e4f50..origin/claude/fix-ci-reativar-suites-261016-1530 --stat` → 2 arquivos: `.github/workflows/ci.yml` e `scripts/ci/check-test-inventory.mjs`
- Commit único: `"ci: reativar 8 suites no job node-scripts (allowlist → runner)"`

### ci.yml — não absorvido

Main atual (`sed -n '140p' .github/workflows/ci.yml`):
```
node --test scripts/ci/*.unit.mjs
```

Branch propõe expandir para:
```
node --test \
  scripts/ci/*.unit.mjs \
  scripts/lib/*.test.mjs \
  scripts/qa/*.unit.mjs \
  scripts/talkx/*.unit.mjs \
  scripts/*.unit.mjs \
  scripts/ui-audit/*.unit.mjs
```

Conteúdo **ausente** na main.

### check-test-inventory.mjs — não absorvido

Branch remove 8 entradas da allowlist (suites removidas do CI mínimo de 16/10):
- `scripts/lib/seguranca-processo.test.mjs`
- `scripts/qa/prova-visao-classificadores.unit.mjs`
- `scripts/talkx/lado-a-lado.unit.mjs`
- `scripts/talkx/v4-status.unit.mjs`
- `scripts/team-chat-db-validate.unit.mjs`
- `scripts/ui-audit/contacts-navy-header.unit.mjs`
- `scripts/ui-audit/layout-guard.unit.mjs`
- `scripts/ui-audit/view-container-padding.unit.mjs`

`grep` confirma: todas 8 ainda presentes no allowlist da main.

## Conclusão

Branch PENDENTE — reativação de 8 suites de teste não mergeada. O CI mínimo de 16/10/2026 (decisão do Joaquim) removeu essas suites; esta branch propõe reintroduzi-las. **Não deletar sem decisão explícita.**
