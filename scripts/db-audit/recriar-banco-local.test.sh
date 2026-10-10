#!/usr/bin/env bash
# Teste do runbook recriar-banco-local.md — R2-DB-020 / N-136.
#
# O runbook documenta o comando para recriar o banco local do zero.
# Este teste verifica que o arquivo existe, cita o replay-local.sh e
# os caminhos corretos, e nao menciona producao.
#
# Vermelho antes: o runbook nao existe ou esta incompleto.
# Verde depois:   o runbook existe e passa em todas as verificacoes.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$DIR/../.." && pwd)
RUNBOOK="$REPO/docs/runbooks/recriar-banco-local.md"
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
# 1. O runbook existe.
# ---------------------------------------------------------------------------
checa "1: runbook existe" "0" "$([ -f "$RUNBOOK" ] && echo 0 || echo 1)"

# ---------------------------------------------------------------------------
# 2. Cita o script replay-local.sh.
# ---------------------------------------------------------------------------
contem "2: cita replay-local.sh" "scripts/db-audit/replay-local.sh" "$RUNBOOK"

# ---------------------------------------------------------------------------
# 3. Cita o diretorio de migrations.
# ---------------------------------------------------------------------------
contem "3: cita supabase/migrations" "supabase/migrations" "$RUNBOOK"

# ---------------------------------------------------------------------------
# 4. Nao menciona producao (URL, credenciais, nome do banco canonico).
# ---------------------------------------------------------------------------
nao_contem "4: nao menciona banco de producao" "canonico" "$RUNBOOK"
nao_contem "4b: nao menciona URL de producao" "supabase.co" "$RUNBOOK"

# ---------------------------------------------------------------------------
# 5. Todos os arquivos citados no runbook existem no repo.
# ---------------------------------------------------------------------------
for ref in \
  "scripts/db-audit/replay-local.sh" \
  "scripts/db-audit/replay-known-failures.json" \
  "scripts/db-audit/replay-classify.py" \
  "docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md"; do
  if [ -f "$REPO/$ref" ]; then
    echo "  ok  : 5: $ref existe no repo"
  else
    echo "  FALHA: 5: $ref nao existe no repo"
    falhou=1
  fi
done

# ---------------------------------------------------------------------------
# 6. O runbook menciona o bootstrap da plataforma (etapa que as migrations
#    precisam para rodar no banco vazio).
# ---------------------------------------------------------------------------
contem "6: menciona bootstrap da plataforma" "bootstrap" "$RUNBOOK"

if [ "$falhou" -eq 0 ]; then
  echo "PASSOU: runbook recriar-banco-local.md existe, cita os caminhos corretos e nao menciona producao"
else
  echo "REPROVOU"
fi
exit "$falhou"