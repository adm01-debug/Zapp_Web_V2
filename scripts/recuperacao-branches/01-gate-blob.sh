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
  # Branch JA incorporada por merge: ela e ancestral da main, o ponto de bifurcacao e o
  # proprio tip e `git diff $mb $br` sai vazio. Dois achados da PR #3192 se cruzam aqui:
  #
  # - Codex: se a main removeu aquele trabalho depois, ele fica invisivel para o gate.
  # - Devin: comparar as arvores inteiras (`git diff origin/main $br`) NAO resolve, porque
  #   passa a atribuir a esta branch arquivo que ela nunca tocou e que a main mudou depois.
  #
  # Sem o ponto de bifurcacao original nao da para separar um do outro, e as duas saidas
  # erradas sao inaceitaveis: uma esconde trabalho, a outra inventa trabalho. Entao a
  # branch e marcada INCONCLUSIVA e vai para adjudicacao manual, nunca sai da fila em
  # silencio. Medido em 16/11/2026: nenhuma das 222 branches cai neste caso.
  if [ "$tip" = "$mb" ]; then
    echo -e "$br\t$tip\tINCONCLUSIVA-ANCESTRAL\t-\t-\t-" >> "$OUT/resumo.tsv"
    continue
  fi
  # arquivos adicionados/modificados pela branch desde o ponto de bifurcacao
  mapfile -t files < <(git diff --name-only --diff-filter=AMR "$mb" "$br" 2>/dev/null)
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
