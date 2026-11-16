# scripts/recuperacao-branches

Mede, byte a byte, o que cada branch remota tem que a `main` não tem. A leitura do resultado está
em `analise-prs/RECUPERACAO-TOTAL-261116.md`.

Existe para sustentar uma regra do dono: **nenhuma branch ou PR é fechada sem prova de que o
trabalho dela já está na `main`, ou de que ficou obsoleto**. Trabalho parcial de outro agente é
terminado, não descartado.

## Ordem

```
export OUT=$(mktemp -d)
git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'
bash    scripts/recuperacao-branches/01-gate-blob.sh
python3 scripts/recuperacao-branches/02-contencao-linha.py
```

`OUT` é onde ficam as duas saídas. A etapa 1 cria um diretório temporário se `OUT` não vier
definido; a etapa 2 exige a variável, para não haver dúvida sobre qual medição ela está lendo.
Nada é escrito dentro do repositório.

## O que cada etapa prova

1. **`01-gate-blob.sh`** — para cada branch, os arquivos que ela introduz desde o ponto de
   bifurcação. Classifica em: mesmo caminho e mesmo blob; mesmo blob em **outro** caminho da
   `main` (pega arquivo movido, que a comparação por caminho não pega); e o resto.
   Saída: `$OUT/resumo.tsv` (uma linha por branch, com o SHA do tip) e `$OUT/unicos.tsv`.
2. **`02-contencao-linha.py`** — no resto, separa `NOVO` (arquivo que não existe na `main` em
   caminho nenhum) de `PARCIAL` (a `main` tem o arquivo, mas falta alguma linha significativa da
   versão da branch, ≥ 8 caracteres após trim). Saída: `$OUT/linhas.tsv`, com as colunas
   `branch`, `arquivo`, `categoria`, `linhas ausentes`, `linhas totais`.

## Recortes de cada bloco do inventário

```
# A1 - migrations novas
awk -F'\t' '$3=="NOVO" && $2 ~ /^supabase\/migrations/' "$OUT/linhas.tsv"

# A2 - codigo de aplicacao, edge e E2E novos
awk -F'\t' '$3=="NOVO" && ($2 ~ /^src\// || $2 ~ /^e2e\// || $2 ~ /^supabase\/(functions|tests)/)' "$OUT/linhas.tsv"

# A3 - automacao nova
awk -F'\t' '$3=="NOVO" && ($2 ~ /^scripts\// || $2 ~ /^\.github\/workflows/)' "$OUT/linhas.tsv"

# C - fila de adjudicacao, do maior para o menor
awk -F'\t' '$3=="PARCIAL" && ($2 ~ /^src\// || $2 ~ /^e2e\// || $2 ~ /^supabase\//) && $4>50 {print $4"\t"$5"\t"$2"\t"$1}' "$OUT/linhas.tsv" | sort -rn

# hash de blob de um item, para prova byte a byte
git rev-parse <branch>:<arquivo>
```

## Limites, para não ler mais do que está provado

- A contenção por linha é **conservadora**: ela prova que a `main` contém as linhas, não que o
  comportamento é o mesmo. Linha reindentada ou renomeada conta como ausente.
- `NOVO` significa "este arquivo não está na `main`". **Não** significa que a funcionalidade
  falta: ela pode ter chegado por outro arquivo, com outro nome. Esse veredito é manual, item a
  item.
- Artefato gerado (`supabase/schema-manifest.json`, `scripts/ci/eslint-baseline.json`) aparece com
  centenas de linhas ausentes e é ruído: a `main` tem a versão regerada depois.
