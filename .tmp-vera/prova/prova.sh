#!/usr/bin/env bash
# prova.sh — prova controlada das DUAS rotas de conferir_base (extraído do integrador, nada copiado à mão).
# O corpo das funções vem por sed da seção "CONFERÊNCIA DA BASE" do arquivo corrigido; os pares "base|ponta"
# vêm do git REAL (~/projetos: leitura) e da fila real; zapp-verify e zapp-db-local são substituídos por stubs
# (primeiros no PATH, para valerem também atrás do `timeout`) que registram o comando efetivo.
# O integrador inteiro NÃO é executado: ele se recusa a rodar em sessão de agente, e essa guarda não se toca.
set -u
RAIZ="$HOME/hermes-workspaces/Zapp_Web_V2/.tmp-vera"
NOVO="$RAIZ/novo/integrar.sh"
ORIG="$RAIZ/orig-integrar.sh"
FILA="$HOME/hermes-workspaces/.v2-fila"
REF="$HOME/projetos/Zapp_Web_V2"
BANCO="$RAIZ/prova/tmp"; rm -rf "$BANCO"; mkdir -p "$BANCO/dirlog" "$BANCO/copia" "$BANCO/bin"
GIT=git
DIRLOG="$BANCO/dirlog"; LOG="$DIRLOG/integrar.log"; INT="$BANCO/copia"
RX_DIA='^dia/[0-9]{4}-[0-9]{2}-[0-9]{2}$'; RX_ID='^[0-9a-f]{12,16}$'
SAIDA="$RAIZ/prova/prova.log"; : > "$SAIDA"
CMD="$BANCO/cmd.txt"; : > "$CMD"
diario() { echo "$*" | tee -a "$SAIDA"; }

cat > "$BANCO/bin/zapp-verify" <<'EOF'
#!/usr/bin/env bash
echo "CMD  zapp-verify $*" >> "$PROVA_CMD"
printf 'FALHOU  testes  10s  (stub)\n'
exit 1
EOF
cat > "$BANCO/bin/zapp-db-local" <<'EOF'
#!/usr/bin/env bash
echo "CMD  zapp-db-local $*" >> "$PROVA_CMD"
exit 0
EOF
chmod +x "$BANCO/bin/zapp-verify" "$BANCO/bin/zapp-db-local"
export PROVA_CMD="$CMD"
export PATH="$BANCO/bin:$PATH"

diario "=== ANTES (orig-integrar.sh): os dois pontos de conferência da BASE"
diario "  linha 240: $(sed -n '240p' "$ORIG" | sed 's/^ *//')"
diario "  linha 422: $(sed -n '422p' "$ORIG" | sed 's/^ *//')"

diario "=== DEPOIS (novo/integrar.sh): os mesmos dois pontos"
diario "  $(grep -n 'conferir_base "base \$DIAV' "$NOVO")"
diario "  $(grep -n 'conferir_base "\$ID' "$NOVO")"

# corpo REAL das funções, extraído do arquivo corrigido
L1=$(grep -n 'CONFERÊNCIA DA BASE (06/10)' "$NOVO" | cut -d: -f1)
L2=$(grep -n '^# =.*LOTE OTIMISTA' "$NOVO" | cut -d: -f1)
sed -n "${L1},$((L2-2))p" "$NOVO" > "$BANCO/funcs.sh"
diario "=== funções extraídas de novo/integrar.sh (linhas ${L1}-$((L2-2))):"
diario "  $(grep -c . "$BANCO/funcs.sh") linhas; declarações: $(grep -oE '^(CONJUNTO_BASE="[^"]*"|[a-z_]+\(\))' "$BANCO/funcs.sh" | tr '\n' ' ')"
# shellcheck disable=SC1090
. "$BANCO/funcs.sh"

log() { echo "LOG  $*" >> "$CMD"; }
reteste_isolado() { echo "STUB reteste_isolado — fora do escopo desta prova (a prova é a ROTA escolhida)" >> "$CMD"; return 1; }

campo() { python3 -c "import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],''))
except Exception: print('')" "$1" "$2"; }

# pares REAIS: um cartão pronto que traz migration e um que não traz
COM=""; SEM=""
for f in "$FILA"/*.json; do
  [ -f "$f" ] || continue
  b="$(campo "$f" base_dia)"; s="$(campo "$f" sha)"
  [ -n "$b" ] && [ -n "$s" ] || continue
  m="$($GIT -C "$REF" diff --name-only --diff-filter=AM "$b...$s" -- supabase/migrations 2>/dev/null | head -1)"
  if [ -n "$m" ] && [ -z "$COM" ]; then COM="$b|$s"; diario "PAR COM (traz migration): $b..${s:0:9} ($m) — $(basename "$f")"; fi
  if [ -z "$m" ] && [ -z "$SEM" ]; then SEM="$b|$s"; diario "PAR SEM (sem migration):    $b..${s:0:9} — $(basename "$f")"; fi
  [ -n "$COM" ] && [ -n "$SEM" ] && break
done
[ -n "$COM" ] && [ -n "$SEM" ] || { diario "FALHA: não achei os dois pares na fila"; exit 2; }

diario "--- predicado (função real do integrador):"
ponta_tem_migration "$COM"; diario "  ponta_tem_migration 'par COM' -> $?  (0 = traz migration)"
ponta_tem_migration "$SEM"; diario "  ponta_tem_migration 'par SEM' -> $?  (1 = não traz)"

diario "=== ROTA 1: ponta COM migration"
conferir_base "PROVA-COM" "$COM" >/dev/null 2>&1; RC1=$?
diario "  conferir_base -> $RC1 (1 = base vermelha, como manda o stub)"
cat "$CMD" >> "$SAIDA"

: > "$CMD"
diario "=== ROTA 2: ponta SEM migration"
conferir_base "PROVA-SEM" "$SEM" >/dev/null 2>&1; RC2=$?
diario "  conferir_base -> $RC2 (1 = base vermelha, como manda o stub)"
cat "$CMD" >> "$SAIDA"
cat "$SAIDA"
exit 0
