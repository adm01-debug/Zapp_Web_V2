#!/bin/sh
# Inventory script v2 for Zapp_Web_V2 branches - Read-only

REPO_DIR="/home/user/Zapp_Web_V2"
OUT_FILE="$REPO_DIR/inventario/branches_raw.tsv"
PROGRESS_FILE="$REPO_DIR/inventario/progresso.json"

cd "$REPO_DIR"

# Header
printf 'BRANCH\tPREFIX\tLAST_COMMIT\tFIRST_EXCLUSIVE_DATE\tAUTHORS\tAHEAD\tBEHIND\tMERGE_BASE\tFILES_CHANGED\tINSERTIONS\tDELETIONS\tFILES_LIST\tCOMMIT_MSGS\tWIP_COUNT\tHAS_MIGRATIONS\tMIGRATION_FILES\tCHERRY_ALL_MINUS\n' > "$OUT_FILE"

# List all remote branches except HEAD and main, strip origin/ prefix
BRANCHES=$(git branch -r | grep -v 'HEAD\|origin/main' | sed 's|.*origin/||' | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
TOTAL=$(echo "$BRANCHES" | wc -l)
COUNT=0

echo "Processing $TOTAL branches..."

# Helper: sanitize a field value (remove tabs and newlines)
sanitize() {
  printf '%s' "$1" | tr '\t\n' '  '
}

for branch in $BRANCHES; do
  COUNT=$((COUNT + 1))

  if [ $((COUNT % 10)) -eq 0 ]; then
    printf '{"processed":%d,"total":%d,"last":"%s"}\n' "$COUNT" "$TOTAL" "$branch" > "$PROGRESS_FILE"
    echo "Progress: $COUNT/$TOTAL - $branch"
  fi

  # Prefix: part before first /
  prefix=$(echo "$branch" | cut -d'/' -f1)

  # Last commit date
  LAST_COMMIT=$(timeout 15 git log -1 --format="%cI" "origin/$branch" 2>/dev/null | tr -d '\n')
  if [ -z "$LAST_COMMIT" ]; then LAST_COMMIT="ERR"; fi

  # Ahead/behind counts
  AHEAD=$(timeout 15 git rev-list --count "main..origin/$branch" 2>/dev/null | tr -d '\n')
  if [ -z "$AHEAD" ]; then AHEAD="0"; fi
  BEHIND=$(timeout 15 git rev-list --count "origin/$branch..main" 2>/dev/null | tr -d '\n')
  if [ -z "$BEHIND" ]; then BEHIND="0"; fi

  # Merge base
  MERGE_BASE=$(timeout 15 git merge-base main "origin/$branch" 2>/dev/null | tr -d '\n')
  if [ -z "$MERGE_BASE" ]; then MERGE_BASE="NONE"; fi

  # First exclusive commit date
  FIRST_EXCLUSIVE=""
  if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    FIRST_EXCLUSIVE=$(timeout 15 git log "main..origin/$branch" --format="%cI" --reverse 2>/dev/null | head -1 | tr -d '\n')
  fi

  # Authors
  AUTHORS=""
  if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    AUTHORS=$(timeout 15 git log "main..origin/$branch" --format="%an" 2>/dev/null | sort -u | tr '\n' '|' | sed 's/|$//' | tr '\t' ' ')
  fi

  # Diff stats
  FILES_CHANGED="0"
  INSERTIONS="0"
  DELETIONS="0"
  DIFF_STAT=$(timeout 30 git diff --shortstat "main...origin/$branch" 2>/dev/null | tr -d '\n')
  if [ -n "$DIFF_STAT" ]; then
    FC=$(echo "$DIFF_STAT" | grep -o '[0-9]* file' | grep -o '[0-9]*')
    INS=$(echo "$DIFF_STAT" | grep -o '[0-9]* insertion' | grep -o '[0-9]*')
    DEL=$(echo "$DIFF_STAT" | grep -o '[0-9]* deletion' | grep -o '[0-9]*')
    if [ -n "$FC" ]; then FILES_CHANGED="$FC"; fi
    if [ -n "$INS" ]; then INSERTIONS="$INS"; fi
    if [ -n "$DEL" ]; then DELETIONS="$DEL"; fi
  fi

  # Files list (max 100)
  FILES_LIST=$(timeout 30 git diff --name-only "main...origin/$branch" 2>/dev/null | head -100 | tr '\n' '|' | sed 's/|$//')

  # Commit messages (max 15)
  COMMIT_MSGS=""
  if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    COMMIT_MSGS=$(timeout 15 git log "main..origin/$branch" --format="%s" 2>/dev/null | head -15 | tr '\n\t' '  ' | tr '|' ' ')
  fi

  # WIP markers
  WIP_COUNT="0"
  if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    WC=$(timeout 30 git diff "main...origin/$branch" 2>/dev/null | grep '^+[^+]' | grep -ic 'TODO\|FIXME\|WIP\|XXX\|placeholder\|not implemented' 2>/dev/null)
    if [ -n "$WC" ]; then WIP_COUNT="$WC"; fi
  fi

  # Migrations
  HAS_MIGRATIONS="nao"
  MIG_FILES=""
  MF=$(echo "$FILES_LIST" | tr '|' '\n' | grep 'supabase/migrations/' | tr '\n' '|' | sed 's/|$//')
  if [ -n "$MF" ]; then
    HAS_MIGRATIONS="sim"
    MIG_FILES="$MF"
  fi

  # Cherry status
  CHERRY_ALL_MINUS="nao"
  if [ "$AHEAD" -eq 0 ] 2>/dev/null; then
    CHERRY_ALL_MINUS="sim"
  elif [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    CHERRY_OUT=$(timeout 30 git cherry -v main "origin/$branch" 2>/dev/null)
    PLUS_C=$(echo "$CHERRY_OUT" | grep -c '^+' || echo "0")
    MINUS_C=$(echo "$CHERRY_OUT" | grep -c '^-' || echo "0")
    if [ "$PLUS_C" -eq 0 ] && [ "$MINUS_C" -gt 0 ]; then
      CHERRY_ALL_MINUS="sim"
    fi
  fi

  # Sanitize all fields and write TSV row
  B=$(sanitize "$branch")
  P=$(sanitize "$prefix")
  LC=$(sanitize "$LAST_COMMIT")
  FE=$(sanitize "$FIRST_EXCLUSIVE")
  AU=$(sanitize "$AUTHORS")
  FL=$(sanitize "$FILES_LIST")
  CM=$(sanitize "$COMMIT_MSGS")
  MB=$(sanitize "$MERGE_BASE")
  MFR=$(sanitize "$MIG_FILES")

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$B" "$P" "$LC" "$FE" "$AU" \
    "$AHEAD" "$BEHIND" "$MB" \
    "$FILES_CHANGED" "$INSERTIONS" "$DELETIONS" \
    "$FL" "$CM" "$WIP_COUNT" \
    "$HAS_MIGRATIONS" "$MFR" "$CHERRY_ALL_MINUS" >> "$OUT_FILE"

done

printf '{"processed":%d,"total":%d,"done":true}\n' "$COUNT" "$TOTAL" > "$PROGRESS_FILE"
echo "Done! Processed $COUNT branches."
