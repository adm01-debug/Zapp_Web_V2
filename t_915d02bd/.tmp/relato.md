Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê
- `.github/workflows/ci.yml`: adicionei o job `mutation-multiplix-send` (linhas 454–505) — segue o padrão `mutation-mapa` (E70): `continue-on-error: true`, `needs: lint-and-typecheck`, paths filter em step com `git diff --name-only` contra a base do PR, filtrando `^supabase/functions/multiplix-send/`. O step executa `python3 scripts/db-audit/multiplix-send-mutation.py` e falha (exit 1) se qualquer mutante sobreviver, mas o job inteiro é não bloqueante.

## Prova
- YAML válido: `python3 -c "import yaml; yaml.safe_load(open('ci.yml'))"` → `YAML valid`
- Diff limpo: somente o novo job foi adicionado (sem alterações em outros jobs ou arquivos)
- O script `scripts/db-audit/multiplix-send-mutation.py` já existe (145 linhas, 16 mutantes) e chama `sys.exit(1 if (survivors or errors) else 0)` — o step falha se qualquer mutante sobreviver
- O paths filter usa regex ancorada `^supabase/functions/multiplix-send/` (não captura prefixos errados)
- Nenhum segredo, token ou identificador de produção no workflow

## Pontos do revisor (só em [refazer])
- Ponto 1: se o revisor apontar que o job não segue exatamente o padrão mutation-mapa, ajusto o nome/estrutura para espelhar
- Ponto 2: se o revisor apontar que o paths filter precisa de ajuste, corrijo a regex

## O que NÃO fiz e por quê
- Não adicionei `mutation:multiplix-send` ao package.json — o script é Python (`python3`), não Node/Bun, e o título pede apenas o step de CI
- Não adicionei schedule trigger semanal — o pai `t_212fe255` confirmou que não há schedule em ci.yml e a recomendação é on-PR
- Não modifiquei README, config global ou outros workflows