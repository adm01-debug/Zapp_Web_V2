#!/bin/bash
# Gate byte a byte: para cada branch, quais arquivos ela INTRODUZ que nao existem
# em lugar nenhum da main (nem no mesmo caminho, nem em outro).
set -u
cd "$(git rev-parse --show-toplevel)"
OUT="${OUT:-$(mktemp -d -t recuperacao-XXXXXX)}"
mkdir -p "$OUT"
echo "OUT=$OUT"

# indice de TODOS os blobs da main, para pegar arquivo movido de lugar
git ls-tree -r origin/main | awk '{print $3}' | sort -u > "$OUT/main-blobs.txt"

: > "$OUT/resumo.tsv"
: > "$OUT/unicos.tsv"

# `refname:short` de `refs/remotes/origin/HEAD` encurta para o nome nu `origin` em clones
# que tenham esse alias, e `origin` escaparia de um filtro escrito so com `origin/...`:
# a main entraria no resumo como branch extra de zero arquivo. Achado da Devin na PR #3192;
# neste clone nao ha `origin/HEAD`, mas o filtro cobre o caso de qualquer forma.
for br in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin | grep -vE '^origin$|^origin/(HEAD|main|contexto)$'); do
  mb=$(git merge-base origin/main "$br" 2>/dev/null) || { echo -e "$br\tERRO\t-\t-\t-" >> "$OUT/resumo.tsv"; continue; }
  tip=$(git rev-parse "$br")
  # Arquivos adicionados/modificados pela branch desde o ponto de bifurcacao.
  #
  # Caso especial: se a branch JA foi incorporada por merge, ela e ancestral da main e o
  # ponto de bifurcacao e o proprio tip -- `git diff $mb $br` sai vazio. Se a main removeu
  # aquele trabalho depois, ele ficaria invisivel para o gate. Nesse caso compara-se a
  # arvore da branch direto com a da main. Achado do Codex na PR #3192; nenhuma das 222
  # branches desta medicao cai nele (nenhuma e ancestral da main), e a guarda fica para
  # execucao futura.
  if [ "$tip" = "$mb" ]; then
    mapfile -t files < <(git diff --name-only --diff-filter=AMR origin/main "$br" 2>/dev/null)
  else
    mapfile -t files < <(git diff --name-only --diff-filter=AMR "$mb" "$br" 2>/dev/null)
  fi
  n=${#files[@]}
  same=0; moved=0; uniq=0
  for f in "${files[@]}"; do
    [ -z "$f" ] && continue
    bb=$(git rev-parse "$br:$f" 2>/dev/null) || { uniq=$((uniq+1)); echo -e "$br\t$f\tSEM-BLOB" >> "$OUT/unicos.tsv"; continue; }
    mbh=$(git rev-parse "origin/main:$f" 2>/dev/null || echo "")
    if [ "$bb" = "$mbh" ]; then same=$((same+1)); continue; fi
    if grep -qxF "$bb" "$OUT/main-blobs.txt"; then moved=$((moved+1)); continue; fi
    uniq=$((uniq+1)); echo -e "$br\t$f\t$bb" >> "$OUT/unicos.tsv"
  done
  echo -e "$br\t$tip\t$n\t$same\t$moved\t$uniq" >> "$OUT/resumo.tsv"
done
echo "FIM"
