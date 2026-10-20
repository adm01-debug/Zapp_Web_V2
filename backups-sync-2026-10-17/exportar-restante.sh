#!/usr/bin/env bash
# Captura o trabalho NAO COMMITADO de cada workspace sujo, em patch (seguro, idempotente).
# Roda em PRIMEIRO PLANO: bash exportar-restante.sh
# Idempotente: pula quem ja tem diff.patch (os 5 piores) ou diff.patch.gz.
#
# ATENCAO (bug corrigido em 2026-10-17): worktrees tem .git como ARQUIVO, nao pasta.
# O teste era [ -d "$ws/.git" ] e por isso 3.298 worktrees eram pulados em silencio.
# Agora e [ -e "$ws/.git" ].
F=/tmp/inventario-sujo.txt
BASE=/home/joaquim_ataides/backups-sync-2026-10-17/trabalho-nao-commitado
LOG=$BASE/export.log
mkdir -p "$BASE"
echo "inicio $(date -Is)" >> "$LOG"
n_ok=0; n_pulado=0
while IFS= read -r line; do
  case "$line" in SUJO*) ;; *) continue;; esac
  ws=$(printf '%s' "$line" | cut -d'|' -f2 | xargs)
  [ -e "$ws/.git" ] || { echo "SEM_GIT | $ws" >> "$LOG"; continue; }
  n=$(basename "$ws")
  if [ -f "$BASE/$n/diff.patch" ] || [ -f "$BASE/$n/diff.patch.gz" ]; then n_pulado=$((n_pulado+1)); continue; fi
  mkdir -p "$BASE/$n"
  git -C "$ws" status --porcelain </dev/null > "$BASE/$n/status.txt" 2>/dev/null
  git -C "$ws" diff HEAD </dev/null 2>/dev/null | gzip -1 > "$BASE/$n/diff.patch.gz"
  git -C "$ws" ls-files --others --exclude-standard </dev/null > "$BASE/$n/untracked.txt" 2>/dev/null
  n_ok=$((n_ok+1))
  echo "$n | sujos=$(wc -l < "$BASE/$n/status.txt") | nao_rastreados=$(wc -l < "$BASE/$n/untracked.txt") | patch=$(du -h "$BASE/$n/diff.patch.gz" 2>/dev/null | cut -f1)" >> "$LOG"
done < "$F"
echo "exportados_nesta_rodada=$n_ok pulados_ja_feitos=$n_pulado" >> "$LOG"
echo "backup_total=$(du -sh /home/joaquim_ataides/backups-sync-2026-10-17 2>/dev/null | cut -f1) espaco_livre=$(df -h / | tail -1 | awk '{print $4}')" >> "$LOG"
echo "FIM $(date -Is)" >> "$LOG"
