#!/usr/bin/env bash
# ============================================================================
# Sincronizar Zapp Web V2: levar TODAS as branches locais para o GitHub.
#
# NÃO É PARA AGENTE EXECUTAR. `git push` é bloqueado por guarda para perfis de
# agente (HERMES-GUARD: git push direto é proibido). Rode VOCÊ ou o Claude.
#
# Uso:
#   DRY=1 ./push-branches.sh     # padrão: só MOSTRA (não envia nada)
#   DRY=0 ./push-branches.sh     # executa de verdade
#
# Nunca usa --force. Branch que o remoto rejeitar é registrada como CONFLITO e
# pulada — nada é sobrescrito.
#
# Cobre os 5 repositórios: a cópia de referência tem ~4.126 branches, mas 670
# branches só existem no checkout de nível 1, 669 no t_682cc676_v2 e 69 em
# n142/retomar. Empurrar só a referência perderia ~700 branches em silêncio.
#
# Medido em 17/10/2026: os 14 workflows só disparam `push` em `branches: [main]`
# (ci, e2e-logado, talkx-status-regen, types-sync, deploy-functions). Empurrar
# branch de trabalho NÃO dispara CI e NÃO consome minutos de Actions.
#
# É retomável: branch que já existe no remoto é pulada, então interromper e
# rodar de novo continua de onde parou.
# ============================================================================
set -u

BASE=/home/joaquim_ataides/backups-sync-2026-10-17
LOG=$BASE/push-log-$(date +%Y%m%d-%H%M%S).txt
DRY=${DRY:-1}

REF=/home/joaquim_ataides/projetos/Zapp_Web_V2
W=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2
REPOS=(
  "$REF"
  "$W"
  "$W/t_682cc676_v2"
  "$W/n142-banco-leitura-reacoes-espelho-ci-26101418239f52"
  "$W/retomar-automation-suggest-reply-t-e494c228"
)

echo "Log de execucao real: $LOG"
if [ "$DRY" = "1" ]; then echo "MODO: SIMULACAO (nada e enviado)"; else echo "MODO: EXECUCAO REAL"; fi
echo

g_total=0; g_falta=0; g_ok=0; g_igual=0; g_conflito=0; g_falhou=0

for repo in "${REPOS[@]}"; do
  [ -e "$repo/.git" ] || { echo "PULADO (nao existe): $repo"; continue; }
  url=$(git -C "$repo" config --get remote.origin.url 2>/dev/null || echo "")
  if [ -z "$url" ]; then echo "PULADO (sem remote origin): $repo"; continue; fi

  # Traz as refs do remoto antes de decidir o que falta (senao o "ja existe" e palpite).
  git -C "$repo" fetch origin --prune --quiet 2>/dev/null

  total=0; falta=0; ok=0; igual=0; conflito=0; falhou=0; mostrados=0
  while IFS= read -r b; do
    [ -z "$b" ] && continue
    total=$((total+1))
    if git -C "$repo" rev-parse -q --verify "refs/remotes/origin/$b" >/dev/null 2>&1; then
      igual=$((igual+1))
      continue
    fi
    falta=$((falta+1))
    if [ "$DRY" = "1" ]; then
      if [ "$mostrados" -lt 3 ]; then echo "  [$(basename "$repo")] SIMULACAO: git push origin $b"; mostrados=$((mostrados+1)); fi
      continue
    fi
    saida=$(git -C "$repo" push origin "refs/heads/$b:refs/heads/$b" 2>&1); code=$?
    printf '%s | %s | %s | %s\n' "$(date -Is)" "$repo" "$b" "$(printf '%s' "$saida" | tail -2 | tr '\n' ' ')" >> "$LOG"
    if [ $code -eq 0 ]; then ok=$((ok+1))
    elif printf '%s' "$saida" | grep -qiE "non-fast-forward|rejected|fetch first"; then conflito=$((conflito+1)); echo "CONFLITO (nao sobrescrevi): $b"
    else falhou=$((falhou+1)); echo "FALHOU: $b"
    fi
  done < <(git -C "$repo" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null)

  echo "$(basename "$repo"): branches=$total | sem equivalente no remoto=$falta | enviadas=$ok | ja no remoto=$igual | conflito=$conflito | falha=$falhou"
  g_total=$((g_total+total)); g_falta=$((g_falta+falta)); g_ok=$((g_ok+ok))
  g_igual=$((g_igual+igual)); g_conflito=$((g_conflito+conflito)); g_falhou=$((g_falhou+falhou))
done

echo "-----------------------------------------------------------------"
echo "TOTAL branches locais : $g_total"
echo "a enviar (nunca foram): $g_falta"
echo "enviadas agora        : $g_ok"
echo "ja existiam no remoto : $g_igual"
echo "conflito (puladas)    : $g_conflito"
echo "falha (puladas)       : $g_falhou"
echo "-----------------------------------------------------------------"
if [ "$DRY" = "0" ]; then echo "Reconfira o total de refs no GitHub e veja o log para os CONFLITO."; fi
