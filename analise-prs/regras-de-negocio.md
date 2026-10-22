# Regras de Negócio — Análise de PRs (2026-10-22)

## Critérios de bloqueio imediato

1. **Toca `.github/workflows/`**: qualquer PR que adicione, remova ou modifique arquivos em `.github/workflows/` é **BLOQUEADO** automaticamente, independente do conteúdo. A sessão não tem autorização para alterar o CI/CD do repositório.

2. **CI obrigatório com falha não justificada**: Se os checks obrigatórios da main falham no HEAD do PR por motivo diferente dos já falhando na `main` em si, o PR não pode ser mergeado.

3. **DDL destrutivo**: PRs com migrações contendo `DROP`, `DELETE`, `UPDATE` em massa, `RENAME`, ou `ALTER TYPE` nunca são mergeados por agente.

4. **SINGU write**: qualquer PR que escreva no sistema SINGU é vetado — esse sistema é somente-leitura para este repositório.

## Critérios de AGUARDAR_CI

Um PR entra nesta categoria quando:
- Não toca `.github/workflows/`
- Não tem DDL destrutivo
- Os checks obrigatórios falham **mas a falha também existe no HEAD da main** (falha pré-existente, não regressão do PR)
- O conteúdo do PR é válido e a regra de negócio está correta

## Critérios de merge

Todos devem ser verdadeiros:
1. Válido (regra de negócio correta)
2. Não implementado na main
3. Sem conflitos de merge
4. Zero falhas novas vs. baseline da main
5. Nenhum código recente revertido
6. Completo (não stub)
7. Alta confiança
8. CI verde nos 6 checks obrigatórios: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests (Playwright)`

## Observações desta análise

- **26 de 30 PRs (87%)** tocam `.github/workflows/` — bloqueio imediato.
- **4 PRs são candidatos reais** (#2149, #2152, #2185, #2186).
- **Falha pré-existente na main**: em 2026-10-22, o HEAD `5a4632c` já falha em `🧪 Unit Tests (1/3), (2/3), (3/3)` e `Contrato DB offline`. Todos os 4 candidatos exibem exatamente as mesmas falhas — não há regressão introduzida por nenhum deles.
- **Resultado**: zero merges executados. Os 4 candidatos aguardam a main voltar ao verde.
