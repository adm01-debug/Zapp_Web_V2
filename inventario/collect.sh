#!/bin/sh
# Inventory script for Zapp_Web_V2 branches
# Read-only: no pushes, no remote writes

REPO_DIR="/home/user/Zapp_Web_V2"
OUT_FILE="$REPO_DIR/inventario/branches_raw.tsv"
PROGRESS_FILE="$REPO_DIR/inventario/progresso.json"

cd "$REPO_DIR"

MAIN_SHA=$(git rev-parse main)
MAIN_DATE=$(git log -1 --format="%cI" main)

printf 'BRANCH\tPREFIX\tLAST_COMMIT\tFIRST_EXCLUSIVE_DATE\tAUTHORS\tAHEAD\tBEHIND\tMERGE_BASE\tFILES_CHANGED\tINSERTIONS\tDELETIONS\tFILES_LIST\tCOMMIT_MSGS\tWIP_COUNT\tHAS_MIGRATIONS\tMIGRATION_FILES\tCHERRY_ALL_MINUS\n' > "$OUT_FILE"

COUNT=0
TOTAL=$(git branch -r | grep -v 'HEAD\|origin/main' | wc -l)
echo "Processing $TOTAL branches..."

for ref in $(git branch -r | grep -v 'HEAD\|origin/main'); do
  branch=$(echo "$ref" | sed 's|  *origin/||')
  COUNT=$((COUNT + 1))

  if [ $((COUNT % 10)) -eq 0 ]; then
    printf '{"processed":%d,"total":%d,"last":"%s"}\n' "$COUNT" "$TOTAL" "$branch" > "$PROGRESS_FILE"
    echo "Progress: $COUNT/$TOTAL - $branch"
  fi

  # Prefix
  prefix=$(echo "$branch" | cut -d'/' -f1)

  # Last commit date
  LAST_COMMIT=$(timeout 10 git log -1 --format="%cI" "origin/$branch" 2>/dev/null || echo "TIMEOUT")

  # Ahead/behind
  AHEAD=$(timeout 10 git rev-list --count "main..origin/$branch" 2>/dev/null || echo "0")
  BEHIND=$(timeout 10 git rev-list --count "origin/$branch..main" 2>/dev/null || echo "0")

  # Merge base
  MERGE_BASE=$(timeout 10 git merge-base main "origin/$branch" 2>/dev/null || echo "NONE")

  # First exclusive commit date (oldest commit after merge-base)
  if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    FIRST_EXCLUSIVE=$(timeout 10 git log "main..origin/$branch" --format="%cI" --reverse 2>/dev/null | head -1)
  else
    FIRST_EXCLUSIVE=""
  fi

  # Authors
  AUTHORS=$(timeout 15 git log "main..origin/$branch" --format="%an" 2>/dev/null | sort -u | tr '\n' '|' | sed 's/|$//')

  # Diff stats
  DIFF_STAT=$(timeout 30 git diff --shortstat "main...origin/$branch" 2>/dev/null || echo "")
  FILES_CHANGED=$(echo "$DIFF_STAT" | grep -o '[0-9]* file' | grep -o '[0-9]*' || echo "0")
  INSERTIONS=$(echo "$DIFF_STAT" | grep -o '[0-9]* insertion' | grep -o '[0-9]*' || echo "0")
  DELETIONS=$(echo "$DIFF_STAT" | grep -o '[0-9]* deletion' | grep -o '[0-9]*' || echo "0")

  # Files list (max 100 files to avoid TSV overflow)
  FILES_LIST=$(timeout 30 git diff --name-only "main...origin/$branch" 2>/dev/null | head -100 | tr '\n' '|' | sed 's/|$//')

  # Commit messages (max 20)
  COMMIT_MSGS=$(timeout 15 git log "main..origin/$branch" --format="%s" 2>/dev/null | head -20 | tr '\n' '|' | sed 's/|$//' | tr '\t' ' ')

  # WIP markers count
  WIP_COUNT=$(timeout 30 git diff "main...origin/$branch" 2>/dev/null | grep '^+' | grep -v '^+++' | grep -ic 'TODO\|FIXME\|WIP\|XXX\|placeholder\|mock\|not implemented' 2>/dev/null || echo "0")

  # Migrations
  MIG_FILES=$(echo "$FILES_LIST" | tr '|' '\n' | grep 'supabase/migrations/' | tr '\n' '|' | sed 's/|$//')
  if [ -n "$MIG_FILES" ]; then
    HAS_MIGRATIONS="sim"
  else
    HAS_MIGRATIONS="nao"
    MIG_FILES=""
  fi

  # Cherry status - check if all commits are already in main
  if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
    CHERRY_OUTPUT=$(timeout 30 git cherry -v main "origin/$branch" 2>/dev/null)
    PLUS_COUNT=$(echo "$CHERRY_OUTPUT" | grep -c '^+' || echo "0")
    MINUS_COUNT=$(echo "$CHERRY_OUTPUT" | grep -c '^-' || echo "0")
    if [ "$PLUS_COUNT" -eq 0 ] && [ "$MINUS_COUNT" -gt 0 ]; then
      CHERRY_ALL_MINUS="sim"
    else
      CHERRY_ALL_MINUS="nao"
    fi
  else
    CHERRY_ALL_MINUS="sim"
  fi

  # Write to TSV (sanitize tabs and newlines)
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$branch" \
    "$prefix" \
    "$LAST_COMMIT" \
    "$FIRST_EXCLUSIVE" \
    "$AUTHORS" \
    "$AHEAD" \
    "$BEHIND" \
    "$MERGE_BASE" \
    "${FILES_CHANGED:-0}" \
    "${INSERTIONS:-0}" \
    "${DELETIONS:-0}" \
    "$FILES_LIST" \
    "$COMMIT_MSGS" \
    "${WIP_COUNT:-0}" \
    "$HAS_MIGRATIONS" \
    "$MIG_FILES" \
    "$CHERRY_ALL_MINUS" >> "$OUT_FILE"

done

printf '{"processed":%d,"total":%d,"done":true}\n' "$COUNT" "$TOTAL" > "$PROGRESS_FILE"
echo "Done! Processed $COUNT branches."
