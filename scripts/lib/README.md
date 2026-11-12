# scripts/lib

Biblioteca compartilhada de segurança de processo.

`seguranca-processo.mjs` exporta:
- `resolverExecutavel(cmd)` — resolve binário no PATH sem shell
- `estaDentro(raiz, caminho)` — verifica contenção de path (imune a symlink escape)
- `resolverCaminhoPermitido(caminho, rotulo, raizes?)` — valida e resolve caminho
- `RAIZ_REPO`, `RAIZES_PERMITIDAS` — constantes de raiz do repositório

Importado por `scripts/catalog/validate-plan.mjs` e pelos guards de CI.
