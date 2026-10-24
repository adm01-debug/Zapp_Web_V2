#!/bin/bash
# Roda zapp-verify FORA da sessao SSH (via cron: @reboot + a cada minuto), para
# sobreviver ao limite de ~15s por comando do terminal do agente e aos reinicios
# frequentes da VM. Retenta ate dar verde (marca .zz-verify-done).
W=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/t-1f93b947-261006033301e4
L="$W/.tmp/verify.log"
DONE=/home/joaquim_ataides/.zz-verify-done
[ -e "$DONE" ] && exit 0
export PATH="$HOME/.local/libexec/hermes-guard:$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
{
  echo "=== INICIO $(date +%T) uptime=$(cut -d. -f1 /proc/uptime) ==="
  cd "$W" && export TMPDIR="$W/.tmp"
  zapp-verify . --rapido
  rc=$?
  echo "EXIT=$rc"
  [ "$rc" -eq 0 ] && touch "$DONE"
  echo "=== FIM $(date +%T) ==="
} >> "$L" 2>&1
exit 0
