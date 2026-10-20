#!/usr/bin/env bash
# Prova de orcamento e rate limit em PRODUCAO (auditoria Blocos 04/05, item 3).
#
# O que esta prova responde, com uma chamada real:
#   1. a reserva de orcamento roda?      -> ai_budget_reservations (RPC ai_budget_reserve)
#   2. o rate limit roda?                -> edge_rate_limits      (RPC ai_rate_limit_hit)
#   3. o consumo fica registrado?        -> ai_usage_logs         (logAiUsage)
#   4. o despacho central resolve provedor e modelo no servidor? -> metadata.provider_name / model
#
# A funcao usada e' `classify-audio-meme` porque ela e' barata (poucos tokens),
# nao envia mensagem para ninguem e passa pelos tres caminhos acima.
#
# ESTA PROVA GASTA DINHEIRO (poucos centavos por chamada) E CHAMA PRODUCAO.
# Por isso exige confirmacao explicita: PROVA_PRODUCAO=sim
#
# Uso:
#   set -a; source ~/.secrets/zapp-multiplix-escopo.env; set +a
#   export SUPABASE_ANON_KEY='<chave publicavel do projeto>'   # publica por desenho
#   PROVA_PRODUCAO=sim bash scripts/qa/prova-orcamento-rate-limit.sh .tmp/prova-out
#
# NUNCA imprime senha nem token: a saida traz apenas o email da conta, os codigos
# HTTP, o resultado da classificacao e (opcionalmente) o resumo lido do banco.
set -uo pipefail

OUT="${1:?uso: prova-orcamento-rate-limit.sh <dir-de-saida>}"
BASE="${ZAPP_SUPABASE_URL:-https://tnnnlkbymytvtqngbbqh.supabase.co}"
FUNCAO="${ZAPP_FUNCAO_PROVA:-classify-audio-meme}"

if [ "${PROVA_PRODUCAO:-}" != "sim" ]; then
  echo "RECUSADO: esta prova chama producao e consome credito de IA."
  echo "Confirme com: PROVA_PRODUCAO=sim bash $0 $OUT"
  exit 2
fi

: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY ausente no ambiente (chave publicavel do projeto)}"
: "${ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL:?email da conta COMPRAS ausente no ambiente}"
: "${ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD:?senha da conta COMPRAS ausente no ambiente}"

mkdir -p "$OUT"

echo "== PROVA DE ORCAMENTO E RATE LIMIT (producao) =="
echo "BASE=$BASE  FUNCAO=$FUNCAO"

# 1) Login no Supabase Auth do Zapp V2. O corpo vai por --data (nao por argv) e o
#    token nunca e' ecoado.
BODY=$(jq -nc --arg e "$ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL" \
              --arg p "$ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD" '{email:$e,password:$p}')
LOGIN_HTTP=$(curl -sS -o "$OUT/login.json" -w '%{http_code}' \
  -X POST "$BASE/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  --data "$BODY")
echo "LOGIN_HTTP=$LOGIN_HTTP  CONTA=$ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL"

JWT=$(jq -r '.access_token // empty' "$OUT/login.json")
if [ -z "$JWT" ]; then
  echo "ERRO: login nao devolveu access_token"
  jq -c '{error,error_description,msg}' "$OUT/login.json" 2>/dev/null | head -c 300; echo
  exit 1
fi
echo "JWT_OK=sim  (len=${#JWT}; valor nunca impresso)"

# 2) Chamadas reais (3, para o rate limit ter o que contar)
chamar() {
  local rotulo="$1" payload="$2" saida="$3" http
  http=$(curl -sS -o "$saida" -w '%{http_code}' \
    -X POST "$BASE/functions/v1/$FUNCAO" \
    -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json' --data "$payload")
  echo "${rotulo}_HTTP=$http  corpo=$(head -c 200 "$saida")"
}

chamar "CHAMADA1" '{"file_name":"risada-troll-meme.mp3","audio_url":"https://exemplo.invalid/risada-troll-meme.mp3"}' "$OUT/chamada1.json"
chamar "CHAMADA2" '{"file_name":"aplausos-standup.mp3","audio_url":"https://exemplo.invalid/aplausos-standup.mp3"}' "$OUT/chamada2.json"
chamar "CHAMADA3" '{"file_name":"suspense-drama.mp3","audio_url":"https://exemplo.invalid/suspense-drama.mp3"}' "$OUT/chamada3.json"

# 3) Como ler o resultado no banco canonico (nao roda aqui: e' leitura do operador)
cat <<'SQL'
-- Depois de rodar, confirme no banco canonico (tnnnlkbymytvtqngbbqh):
--   select count(*) from ai_budget_reservations;   -- a reserva rodou?
--   select count(*) from edge_rate_limits;         -- o rate limit contou?
--   select function_name, status, model, error_message, metadata, created_at
--     from ai_usage_logs order by created_at desc limit 5;
-- As tres chamadas devem aparecer em ai_usage_logs. `status=success` prova o
-- caminho completo (reserva -> provedor -> liquidacao -> log). `status=error`
-- com HTTP 401 significa provedor recusando a credencial: a rota, o orcamento e
-- o rate limit funcionaram; o que falhou foi a chave do provedor.
SQL

echo "FIM_PROVA=ok"
