# Validação do plano de implementação do Catálogo

```bash
node scripts/catalog/validate-plan.mjs [caminho-do-plano.md]
```

Valida `docs/catalogo/PLANO_IMPLEMENTACAO_CATALOGO_100.md` (padrão, se nenhum
caminho for passado): confere 100 etapas, 10 sub-etapas por etapa e checklist
em cada uma. O caminho do plano, quando vem de `argv`, passa por
`resolverCaminhoPermitido` (`scripts/lib/seguranca-processo.mjs`) e recusa
qualquer caminho fora da raiz do repo (jssecurity:S8707).

Exit: `0` = plano válido; `1` = plano inválido ou caminho fora da raiz.

Teste: `node --test scripts/catalog/validate-plan.test.mjs`.
