#!/usr/bin/env bash
# Sincroniza ~/projetos/Zapp_Web_V2 (integracao-agentes e main) com origin/main do GitHub
# sem perder nenhum trabalho local. Preparado pelo Hermes em 2026-10-19.
# Quem roda: o Joaquim, no terminal do Ubuntu (WSL). O Hermes é bloqueado (cópia de referência).
# É seguro rodar de novo: cada passo confere o estado antes de agir e pula o que já foi feito.
set -Eeuo pipefail
export LC_ALL=C GRAPHIFY_SKIP_HOOK=1

R=/home/joaquim_ataides/projetos/Zapp_Web_V2
B=/home/joaquim_ataides/backups/zapp-sync-20261019-200821
HEAD_ANTIGO=025d0258dc64d49761f03a0bc7493a1879abc067
ORFAO=6e2382a7d4b7411bbd4a0fefcdfece366d52df4d
REF_ORFAO=refs/backup/sync-20261019/orfao-6e2382a7d4
SEM_GC=(-c gc.auto=0 -c maintenance.auto=false)   # o gc automático apagaria objetos soltos antigos
P="$B/pos-sync"
mkdir -p "$P"
LOG="$B/sync-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

etapa() { printf '\n== %s ==\n' "$*"; }
ok() { printf '  OK  %s\n' "$*"; }
aviso() { printf '  AVISO  %s\n' "$*"; }
falha() {
  trap - ERR
  printf '\n  PAROU: %s\n  Nada foi perdido: o backup completo está em %s\n  Log: %s\n' "$*" "$B" "$LOG"
  exit 1
}
trap 'falha "erro inesperado na linha $LINENO (comando: $BASH_COMMAND)"' ERR

cd "$R"
status_atual() { git status --porcelain=v1 --untracked-files=all; }

# ---------------------------------------------------------------------------------------------
etapa "1/6 Conferências antes de mexer (só leitura)"
(cd "$B" && sha256sum -c --quiet SHA256SUMS) || falha "o backup não confere com SHA256SUMS"
ok "backup íntegro (sha256 de todos os arquivos, inclusive este script)"
git bundle verify -q "$B/commits-locais-nao-publicados.bundle" >/dev/null 2>&1 \
  || falha "o bundle dos commits locais não passou no git bundle verify"
ok "bundle com os 8775 commits locais não publicados verificado pelo git"
git "${SEM_GC[@]}" merge --ff-only --quiet HEAD >/dev/null 2>&1   || falha "o git deste terminal recusou um 'git merge' sem efeito (guarda do Hermes ativa neste terminal?)"
ok "git merge liberado neste terminal (teste sem efeito, antes de qualquer mudança)"
for f in index.lock HEAD.lock refs/heads/main.lock refs/heads/integracao-agentes.lock; do
  [ ! -e ".git/$f" ] || falha ".git/$f existe: há outro git rodando neste repositório"
done
for f in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
  [ ! -e ".git/$f" ] || falha ".git/$f existe: há uma operação do git em andamento"
done
[ "$(git symbolic-ref -q HEAD)" = refs/heads/integracao-agentes ] \
  || falha "o checkout não está na branch integracao-agentes"
git worktree list --porcelain > "$P/worktrees-antes.txt"
if grep -qx 'branch refs/heads/main' "$P/worktrees-antes.txt"; then
  falha "a branch main está aberta em algum worktree; não dá para avançá-la com segurança"
fi
ST="$(status_atual)"
if [ -n "$ST" ]; then
  [ "$ST" = "$(cat "$B/status-antes.txt")" ] || falha "o status mudou desde o backup (alguém mexeu no repositório)"
  [ "$(git rev-parse HEAD)" = "$HEAD_ANTIGO" ] || falha "integracao-agentes mudou desde o backup"
  cmp -s bun.lock "$B/worktree/bun.lock" || falha "bun.lock do disco difere do backup"
  cmp -s supabase/deployment-manifest.json "$B/worktree/supabase/deployment-manifest.json" \
    || falha "deployment-manifest.json do disco difere do backup"
  git show :bun.lock > "$P/index-bun.lock"
  cmp -s "$P/index-bun.lock" "$B/index/bun.lock" || falha "bun.lock do index difere do backup"
  git show :.merge_file_9Jwk9A > "$P/index-merge_file"
  cmp -s "$P/index-merge_file" "$B/index/.merge_file_9Jwk9A" || falha ".merge_file_9Jwk9A do index difere do backup"
  [ ! -e .merge_file_9Jwk9A ] || falha ".merge_file_9Jwk9A reapareceu no disco"
  ok "os 3 itens sujos são idênticos ao backup, byte a byte"
else
  ok "status já limpo (uma execução anterior chegou até a limpeza)"
fi
if [ -e .git/REBASE_HEAD ]; then
  cmp -s .git/REBASE_HEAD "$B/REBASE_HEAD.bak" || falha ".git/REBASE_HEAD difere do backup"
fi
[ -s "$B/orfao-6e2382a7d4-rascunho-do-1405.patch" ] || falha "falta o export do commit órfão"
[ "$(find "$B/stashes" -name 'stash-*.patch' -size +0 | wc -l)" -ge 10 ] || falha "faltam exports de stash"
ok "commit órfão e os 10 stashes exportados em $B"

# ---------------------------------------------------------------------------------------------
etapa "2/6 Preservação extra (só cria; não apaga nada)"
git for-each-ref --format='%(objectname) %(refname)' > "$P/refs-antes.txt"
git stash list --format='%H %gd %s' > "$P/stashes-antes.txt"
if git rev-parse -q --verify "$REF_ORFAO" >/dev/null; then
  [ "$(git rev-parse "$REF_ORFAO")" = "$ORFAO" ] || falha "$REF_ORFAO existe com outro valor"
  ok "ref de proteção do commit órfão já existia"
else
  git cat-file -e "$ORFAO^{commit}" || falha "o commit órfão $ORFAO sumiu do repositório"
  git update-ref -m "backup: rascunho do #1405 (era o REBASE_HEAD)" "$REF_ORFAO" "$ORFAO" ""
  ok "commit órfão protegido em $REF_ORFAO (o gc não pode mais apagá-lo)"
fi
ok "fotografia salva: $(wc -l < "$P/refs-antes.txt") refs, $(wc -l < "$P/stashes-antes.txt") stashes, $(grep -c '^worktree ' "$P/worktrees-antes.txt") worktrees"

# ---------------------------------------------------------------------------------------------
etapa "3/6 Buscar o GitHub e provar que é avanço simples (fast-forward)"
git "${SEM_GC[@]}" fetch --quiet origin || falha "git fetch falhou (rede ou login do GitHub)"
ALVO="$(git rev-parse refs/remotes/origin/main)"
NO_GITHUB="$(git ls-remote origin refs/heads/main | cut -f1)"
[ "$NO_GITHUB" = "$ALVO" ] || falha "alguém publicou na main durante o fetch; rode o script de novo"
ok "origin/main = $ALVO (confirmado direto no GitHub)"
for b in HEAD refs/heads/main; do
  git merge-base --is-ancestor "$b" "$ALVO" || falha "$b não é ancestral de origin/main: não seria fast-forward"
done
ok "integracao-agentes e main estão contidas em origin/main: nenhum commit local fica para trás"
git ls-tree -r --format='%(objectmode)' "$ALVO" | sort -u > "$P/modos.txt"
if grep -vqE '^100(644|755)$' "$P/modos.txt"; then
  falha "a árvore do GitHub tem symlink ou submódulo; a validação byte a byte precisa de ajuste"
fi
if [ "$(git rev-parse HEAD)" != "$ALVO" ]; then
  while IFS= read -r -d '' f; do
    if [ -e "$f" ] || [ -L "$f" ]; then falha "arquivo novo do GitHub já existe no disco: $f"; fi
    d="$(dirname "$f")"
    while [ "$d" != . ]; do
      if [ -e "$d" ] && [ ! -d "$d" ]; then falha "caminho do GitHub precisa ser pasta, mas é arquivo: $d"; fi
      d="$(dirname "$d")"
    done
  done < <(git diff --no-renames --name-only --diff-filter=A -z HEAD "$ALVO")
  ok "nenhum arquivo novo do GitHub colide com arquivo local (inclusive ignorados)"
fi

# ---------------------------------------------------------------------------------------------
etapa "4/6 Limpar os restos locais (todos já salvos no backup) e avançar as 2 branches"
if [ -n "$(status_atual)" ]; then
  git rm --cached --quiet -- .merge_file_9Jwk9A
  git restore --source=HEAD --staged --worktree -- bun.lock supabase/deployment-manifest.json
fi
[ -z "$(status_atual)" ] || falha "o status não ficou limpo após descartar os 3 itens"
ok "status limpo (o bun.lock local com react-i18next 17.0.21 está guardado em $B/worktree/bun.lock)"
if [ -e .git/REBASE_HEAD ]; then
  rm -f .git/REBASE_HEAD
  ok "REBASE_HEAD residual removido (cópia em $B/REBASE_HEAD.bak e na ref $REF_ORFAO)"
fi
if [ "$(git rev-parse HEAD)" != "$ALVO" ]; then
  git "${SEM_GC[@]}" merge --ff-only --quiet "$ALVO"
fi
ok "integracao-agentes -> $ALVO"
MAIN_ANTES="$(git rev-parse refs/heads/main)"
if [ "$MAIN_ANTES" != "$ALVO" ]; then
  git update-ref -m "sync: main fast-forward para origin/main" refs/heads/main "$ALVO" "$MAIN_ANTES"
fi
ok "main -> $ALVO"

# ---------------------------------------------------------------------------------------------
etapa "5/6 Validação final, arquivo por arquivo, byte a byte"
[ "$(git rev-parse HEAD)" = "$ALVO" ] || falha "integracao-agentes não está em origin/main"
[ "$(git rev-parse refs/heads/main)" = "$ALVO" ] || falha "main não está em origin/main"
[ "$(git rev-parse 'main@{upstream}')" = "$ALVO" ] || falha "main não bate com o upstream origin/main"
ok "as 2 branches = origin/main = GitHub"
[ -z "$(status_atual)" ] || falha "status não está limpo"
git diff --quiet "$ALVO" -- || falha "o disco difere de origin/main (git diff)"
git diff --cached --quiet "$ALVO" -- || falha "o index difere de origin/main (git diff --cached)"
ok "git status limpo; git diff contra origin/main vazio (disco e index)"

# Index: entrada por entrada (modo, hash, estágio 0, caminho) contra a árvore do GitHub.
git ls-files --stage -z | sort -z > "$P/index.z"
git ls-tree -r -z --full-tree --format='%(objectmode) %(objectname) 0%x09%(path)' "$ALVO" | sort -z > "$P/arvore.z"
cmp -s "$P/index.z" "$P/arvore.z" || falha "o index não é idêntico à árvore de origin/main"
TOTAL="$(tr -cd '\0' < "$P/arvore.z" | wc -c)"
ok "index idêntico à árvore do GitHub: $TOTAL entradas (modo + hash + caminho)"

# Disco: SHA-1 de blob calculado dos bytes crus (sem filtros do git), arquivo por arquivo, + modo.
git ls-tree -r -z --full-tree --format='%(objectmode) %(objectname) %(path)' "$ALVO" | tr '\0' '\n' > "$P/arvore.txt"
[ "$(wc -l < "$P/arvore.txt")" = "$TOTAL" ] || falha "há caminho com quebra de linha; a validação precisa de ajuste"
cut -d' ' -f3- "$P/arvore.txt" > "$P/caminhos.txt"
DIV=0
while IFS= read -r linha; do
  modo="${linha%% *}"; resto="${linha#* }"; caminho="${resto#* }"
  if [ ! -f "$caminho" ] || [ -L "$caminho" ]; then
    echo "  DIVERGÊNCIA [falta no disco ou tipo errado] $caminho"; DIV=$((DIV + 1)); continue
  fi
  if [ "$modo" = 100755 ] && [ ! -x "$caminho" ]; then echo "  DIVERGÊNCIA [deveria ser executável] $caminho"; DIV=$((DIV + 1)); fi
  if [ "$modo" = 100644 ] && [ -x "$caminho" ]; then echo "  DIVERGÊNCIA [não deveria ser executável] $caminho"; DIV=$((DIV + 1)); fi
done < "$P/arvore.txt"
[ "$DIV" = 0 ] || falha "$DIV arquivos faltando ou com modo errado"
git hash-object --no-filters --stdin-paths < "$P/caminhos.txt" > "$P/hash-disco.txt"
[ "$(wc -l < "$P/hash-disco.txt")" = "$TOTAL" ] || falha "o cálculo de hash não cobriu todos os arquivos"
paste -d' ' "$P/hash-disco.txt" "$P/arvore.txt" > "$P/comparacao.txt"
awk '$1 != $3' "$P/comparacao.txt" > "$P/divergentes.txt"
if [ -s "$P/divergentes.txt" ]; then
  cut -d' ' -f4- "$P/divergentes.txt" | sed 's/^/  BYTES DIFEREM: /'
  falha "$(wc -l < "$P/divergentes.txt") arquivos com bytes diferentes do GitHub"
fi
BYTES="$(tr '\n' '\0' < "$P/caminhos.txt" | xargs -0 stat -c %s | awk '{ s += $1 } END { print s }')"
MODOS="$(cut -d' ' -f1 "$P/arvore.txt" | sort | uniq -c | awk '{ printf "%s×%s ", $1, $2 }')"
ok "disco idêntico ao GitHub byte a byte: $TOTAL arquivos, $BYTES bytes, modos ${MODOS}— 0 divergências"

if command -v node >/dev/null 2>&1; then
  if node scripts/edge-deploy/generate-manifest.mjs --check; then
    ok "manifesto de deploy confere com o código das Edge Functions (sha256 de cada arquivo)"
  else
    aviso "o manifesto de deploy do próprio GitHub está desatualizado (não é efeito desta sincronização)"
  fi
else
  aviso "node não está no PATH; conferência do manifesto pulada (a validação byte a byte já cobre)"
fi

# Zero perda: nada além das 2 branches, de origin/* e da ref de proteção foi tocado por este script.
git for-each-ref --format='%(objectname) %(refname)' > "$P/refs-depois.txt"
FILTRO=' refs/(heads/(main|integracao-agentes)|remotes/|backup/sync-20261019/)'
grep -vE "$FILTRO" "$P/refs-antes.txt" > "$P/refs-antes-outras.txt" || true
grep -vE "$FILTRO" "$P/refs-depois.txt" > "$P/refs-depois-outras.txt" || true
if cmp -s "$P/refs-antes-outras.txt" "$P/refs-depois-outras.txt"; then
  ok "as outras $(wc -l < "$P/refs-depois-outras.txt") refs (branches, stash, checkpoints) estão intactas"
else
  aviso "outras refs mudaram enquanto o script rodava (outro chat do Hermes trabalhando ao mesmo tempo; este script não mexe nelas):"
  diff "$P/refs-antes-outras.txt" "$P/refs-depois-outras.txt" | grep '^[<>]' | head -20 || true
fi
git stash list --format='%H %gd %s' > "$P/stashes-depois.txt"
if cmp -s "$P/stashes-antes.txt" "$P/stashes-depois.txt"; then
  ok "os $(wc -l < "$P/stashes-depois.txt") stashes estão intactos"
else
  aviso "a lista de stashes mudou durante a execução (este script não mexe em stash)"
fi
git cat-file -e "$ORFAO^{commit}" || falha "o commit órfão sumiu"
ok "commit órfão $ORFAO preservado (ref $REF_ORFAO)"
git bundle list-heads "$B/commits-locais-nao-publicados.bundle" | cut -d' ' -f1 \
  | git cat-file --batch-check='%(objecttype)' > "$P/bundle-heads.txt"
SUMIRAM="$(grep -vcx commit "$P/bundle-heads.txt" || true)"
if [ "$SUMIRAM" = 0 ]; then
  ok "as $(wc -l < "$P/bundle-heads.txt") pontas de branch do backup continuam no repositório"
else
  aviso "$SUMIRAM pontas de branch do backup não estão mais no repositório (outro chat apagou branch); continuam no bundle"
fi

# ---------------------------------------------------------------------------------------------
etapa "6/6 Resultado"
echo "  SINCRONIZADO: integracao-agentes e main = $ALVO"
echo "  Último commit: $(git log -1 --format='%cd · %s' --date=format:'%Y-%m-%d %H:%M')"
echo "  Trabalho local preservado em: $B"
echo "  Log completo: $LOG"
trap - ERR
# O que o hook post-merge faria depois de um pull, agora que a validação acabou:
if [ -x "$HOME/.local/bin/graphify" ]; then
  mkdir -p graphify-out
  ( PYTHONHASHSEED=0 nohup "$HOME/.local/bin/graphify" update . > graphify-out/.post-merge.log 2>&1 & )
  echo "  Grafo do Graphify sendo reconstruído em segundo plano (graphify-out/.post-merge.log)"
fi
