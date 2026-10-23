#!/bin/sh
# Conflict check for TOP 30 branches
# Output: conflict_counts.tsv with branch TAB conflict_lines

REPO_DIR="/home/user/Zapp_Web_V2"
OUT="$REPO_DIR/inventario/conflict_counts.tsv"
printf 'BRANCH\tCONFLICT_MARKERS\n' > "$OUT"

cd "$REPO_DIR"

while IFS= read -r branch; do
  MB=$(timeout 15 git merge-base main "origin/$branch" 2>/dev/null | tr -d '\n')
  if [ -z "$MB" ]; then
    printf '%s\t%s\n' "$branch" "ERR_NO_MERGEBASE" >> "$OUT"
    continue
  fi
  # count conflict markers in merge-tree output
  CNT=$(timeout 60 git merge-tree "$MB" main "origin/$branch" 2>/dev/null | grep -c '^+<<<<<<' || echo "0")
  printf '%s\t%s\n' "$branch" "$CNT" >> "$OUT"
  echo "  $branch => $CNT conflicts"
done < "$REPO_DIR/inventario/top30.txt"

echo "Done: $OUT"
