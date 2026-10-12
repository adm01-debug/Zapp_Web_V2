#!/usr/bin/env bash
# Teste do ratchet da lista de falhas esperadas do replay (check-replay-allowlist-ratchet.py) - N-020.
#
# O replay-classify.py separa falha esperada de drift novo, mas o allowlist so protege enquanto
# for a FRONTEIRA medida: no momento em que uma falha nova entra na lista, a fronteira anda. Este
# teste prova o ratchet que impede isso - entrada nova fora do teto derruba o verificador, remover
# entrada passa, e o teto do repositorio cobre a lista real (nao e vacuo).
#
# Offline: nenhum docker, nenhum banco. So os JSON de fixture e os arquivos REAIS do repositorio.
#
# Vermelho antes / verde depois, caso a caso (a mutacao do caso 2 e o discriminante: sem o ratchet,
# acrescentar a entrada nova daria exit 0 e o caso FALHARIA):
#   1. lista igual ao teto                            -> exit 0;
#   2. MUTACAO: entrada nova sem baixar o teto        -> exit 1, nomeia a entrada;
#   3. entrada REMOVIDA da lista (falha reparada)     -> exit 0;
#   4. lista vazia (todas reparadas)                  -> exit 0;
#   5. teto com entrada que saiu da lista             -> exit 0, mas avisa (aperta);
#   6. allowlist ausente / ilegivel / sem a chave     -> exit 2 (nao consegui medir);
#   7. arquivos REAIS do repositorio, sem argumento    -> exit 0.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
CHECK="$DIR/check-replay-allowlist-ratchet.py"
TMP=$(mktemp -d)
trap 'rm -rf -- "$TMP"' EXIT

falhou=0
checa() { # <descricao> <esperado> <obtido>
  if [ "$2" = "$3" ]; then echo "  ok  : $1"; else echo "  FALHA: $1 (esperado '$2', obtido '$3')"; falhou=1; fi
}
contem() { # <descricao> <padrao> <arquivo>
  if grep -q "$2" "$3" 2>/dev/null; then echo "  ok  : $1"; else echo "  FALHA: $1 (nao achei '$2' em $3)"; falhou=1; fi
}
nao_contem() { # <descricao> <padrao> <arquivo>
  if grep -q "$2" "$3" 2>/dev/null; then echo "  FALHA: $1 (achei '$2' em $3)"; falhou=1; else echo "  ok  : $1"; fi
}

# ---------------------------------------------------------------------------
# Fixture: lista com 2 falhas aceitas e teto com as mesmas 2.
# ---------------------------------------------------------------------------
lista() { # <arquivo> <nomes...>
  local destino="$1"; shift
  {
    printf '{\n  "esperadas": {\n'
    local primeiro=1
    for nome in "$@"; do
      [ "$primeiro" = 1 ] || printf ',\n'
      printf '    "%s": {"categoria": "ambiente", "motivo": "medido no canonico"}' "$nome"
      primeiro=0
    done
    printf '\n  }\n}\n'
  } > "$destino"
}
teto() { # <arquivo> <nomes...>
  local destino="$1"; shift
  {
    printf '{\n  "aceitas": [\n'
    local primeiro=1
    for nome in "$@"; do
      [ "$primeiro" = 1 ] || printf ',\n'
      printf '    "%s"' "$nome"
      primeiro=0
    done
    printf '\n  ]\n}\n'
  } > "$destino"
}

A="20260101000000_a.sql"
B="20260101000001_b.sql"
NOVA="20261012999999_nova_sem_reparo.sql"

# ===========================================================================
# Caso 1: lista igual ao teto -> dentro do teto, exit 0.
# ===========================================================================
lista "$TMP/l1.json" "$A" "$B"
teto "$TMP/t1.json" "$A" "$B"
python3 "$CHECK" "$TMP/l1.json" "$TMP/t1.json" >"$TMP/o1.txt" 2>&1
RC=$?
checa "1: lista igual ao teto -> exit 0" "0" "$RC"
contem "1: diz que esta dentro do teto" "RATCHET OK" "$TMP/o1.txt"

# ===========================================================================
# Caso 2 (MUTACAO): entrada NOVA na lista sem baixar o teto -> exit 1 e nomeia.
# ===========================================================================
lista "$TMP/l2.json" "$A" "$B" "$NOVA"
python3 "$CHECK" "$TMP/l2.json" "$TMP/t1.json" >"$TMP/o2.txt" 2>&1
RC=$?
checa "2: entrada nova -> exit 1" "1" "$RC"
contem "2: acusa ratchet violado" "RATCHET VIOLADO" "$TMP/o2.txt"
contem "2: nomeia a entrada nova" "$NOVA" "$TMP/o2.txt"

# ...e a entrada antiga NAO pode ser acusada: so a nova esta fora do teto.
nao_contem "2: nao acusa a entrada ja aceita" "NOVA: $A" "$TMP/o2.txt"

# ===========================================================================
# Caso 3: entrada REMOVIDA da lista (falha reparada) -> passa.
# ===========================================================================
lista "$TMP/l3.json" "$A"
python3 "$CHECK" "$TMP/l3.json" "$TMP/t1.json" >"$TMP/o3.txt" 2>&1
RC=$?
checa "3: remover entrada passa (exit 0)" "0" "$RC"
contem "3: avisa que o teto pode encolher" "FORA DA LISTA: $B" "$TMP/o3.txt"

# ===========================================================================
# Caso 4: lista vazia (todas as falhas reparadas) -> passa, exit 0.
# ===========================================================================
printf '{\n  "esperadas": {}\n}\n' > "$TMP/l4.json"
python3 "$CHECK" "$TMP/l4.json" "$TMP/t1.json" >"$TMP/o4.txt" 2>&1
RC=$?
checa "4: lista vazia -> exit 0" "0" "$RC"
contem "4: 0 aceita dentro do teto" "0 aceita(s) dentro do teto de 2" "$TMP/o4.txt"

# ===========================================================================
# Caso 5: teto vazio (fechado) contra lista com entrada -> exit 1.
# ===========================================================================
teto "$TMP/t5.json"
python3 "$CHECK" "$TMP/l3.json" "$TMP/t5.json" >"$TMP/o5.txt" 2>&1
RC=$?
checa "5: teto fechado + 1 aceita -> exit 1" "1" "$RC"

# ===========================================================================
# Caso 6: fail-closed - nao consegui medir e nao e verde.
# ===========================================================================
python3 "$CHECK" "$TMP/nao-existe.json" "$TMP/t1.json" >"$TMP/o6a.txt" 2>&1
checa "6a: allowlist ausente -> exit 2" "2" "$?"
contem "6a: diz que nao mediu" "RATCHET NAO MEDIDO" "$TMP/o6a.txt"
python3 "$CHECK" "$TMP/l1.json" "$TMP/nao-existe.json" >"$TMP/o6b.txt" 2>&1
checa "6b: teto ausente -> exit 2" "2" "$?"
printf 'isto nao e json\n' > "$TMP/quebrado.json"
python3 "$CHECK" "$TMP/quebrado.json" "$TMP/t1.json" >"$TMP/o6c.txt" 2>&1
checa "6c: allowlist ilegivel -> exit 2" "2" "$?"
printf '{\n  "outra_chave": {}\n}\n' > "$TMP/semchave.json"
python3 "$CHECK" "$TMP/semchave.json" "$TMP/t1.json" >"$TMP/o6d.txt" 2>&1
checa "6d: allowlist sem a chave 'esperadas' -> exit 2" "2" "$?"
printf '{\n  "aceitas": [""]\n}\n' > "$TMP/tetonome.json"
python3 "$CHECK" "$TMP/l1.json" "$TMP/tetonome.json" >"$TMP/o6e.txt" 2>&1
checa "6e: teto com nome vazio -> exit 2" "2" "$?"

# ===========================================================================
# Caso 7: o teto do REPOSITORIO cobre a lista REAL (sem argumentos) - se a
# lista do dia estiver acima do teto, e aqui que se descobre.
# ===========================================================================
python3 "$CHECK" >"$TMP/o7.txt" 2>&1
RC=$?
checa "7: lista real dentro do teto real -> exit 0" "0" "$RC"
contem "7: leu os arquivos ao lado do script" "RATCHET OK" "$TMP/o7.txt"

if [ "$falhou" -eq 0 ]; then
  echo "PASSOU: a lista de falhas esperadas do replay so pode diminuir (entrada nova -> exit 1; remover entrada -> passa; teto do repositorio cobre a lista real)"
else
  echo "REPROVOU"
fi
exit "$falhou"
