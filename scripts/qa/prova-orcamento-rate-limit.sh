#!/usr/bin/env bash
# Prova de orcamento e rate limit em PRODUCAO (auditoria Blocos 04/05, item 3).
#
# R2-INF-012: esta prova TERMINA COM VEREDITO MEDIDO. Ela nao pode mais imprimir
# "ok" so porque chegou ao fim do script. Transporte, codigo HTTP, corpo e o
# proprio registro de consumo sao CONFERIDOS, e o resultado sai como
#   FIM_PROVA=aprovado     (exit 0)
#   FIM_PROVA=inconclusivo (exit 2)  nao foi possivel MEDIR um criterio
#   FIM_PROVA=falha        (exit 1)  um criterio medido FALHOU
# Qualquer coisa que nao seja "aprovado" termina com codigo de saida nao-zero.
#
# O que esta prova responde, com chamadas reais:
#   1. o login no Auth do projeto funciona?   -> HTTP 200 + access_token
#   2. a rota de IA responde?                 -> cada chamada em {200, 429}
#   3. o consumo/despacho ficou registrado?   -> linhas DESTE RUN em ai_usage_logs
#   4. a rejeicao por limite, quando ocorre   -> 429 conta como PROVA do limite
#
# Correlacao por RUN, nunca por total global nem por janela de horario: cada
# execucao tem RUN_ID (uuid) e RUN_INICIO. O RUN_ID vai em CADA chamada
# verificada, no header `x-ai-request-id` — o mesmo id opaco que a IA-051 grava
# em `ai_usage_logs.request_id` — e a leitura do banco filtra por
# `request_id = RUN_ID`, alem de `function_name` e `created_at >= RUN_INICIO`.
# Filtrar so por funcao e horario contaria registros de uma execucao CONCORRENTE
# na mesma janela e aprovaria sem provar o consumo DESTA execucao (R2-INF-012,
# recusa #359). A RLS de `ai_usage_logs` limita a leitura ao proprio usuario.
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
# ZAPP_SUPABASE_URL e OBRIGATORIO (vem do arquivo de escopo): o script nao guarda
# a URL do projeto embutida.
#
# Ajustes usados tambem pelo teste `scripts/ci/prova-orcamento-rate-limit.unit.mjs`:
#   ZAPP_FUNCAO_PROVA   (default: classify-audio-meme)
#   ZAPP_PROVA_CHAMADAS (default: 3)
#   ZAPP_PROVA_RUN_ID   (default: uuid novo; PRECISA ser uuid — e' o unico
#                        formato que o caminho de consumo aceita em
#                        ai_usage_logs.request_id, logo outro formato nunca
#                        casaria a leitura e a prova aprovaria nada)
#   ZAPP_PROVA_ESPERA   (segundos entre tentativas de leitura; default: 2)
#
# NUNCA imprime senha nem token e nenhuma credencial vai para argv de processo:
# o corpo do login chega ao curl por stdin (--data-binary @-) e os cabecalhos
# com credencial (apikey, Authorization) vao num arquivo de configuracao
# privado do curl (--config). A resposta do Auth fica num diretorio temporario
# apagado ao sair; no diretorio de saida so vai evidencia redigida, sem tokens.
set -uo pipefail
umask 077

OUT="${1:?uso: prova-orcamento-rate-limit.sh <dir-de-saida>}"
BASE="${ZAPP_SUPABASE_URL:?ZAPP_SUPABASE_URL ausente no ambiente (URL do projeto Supabase)}"
FUNCAO="${ZAPP_FUNCAO_PROVA:-classify-audio-meme}"
N_CHAMADAS="${ZAPP_PROVA_CHAMADAS:-3}"
ESPERA="${ZAPP_PROVA_ESPERA:-2}"

if [[ "${PROVA_PRODUCAO:-}" != "sim" ]]; then
  echo "RECUSADO: esta prova chama producao e consome credito de IA."
  echo "Confirme com: PROVA_PRODUCAO=sim bash $0 $OUT"
  exit 2
fi

: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY ausente no ambiente (chave publicavel do projeto)}"
: "${ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL:?email da conta COMPRAS ausente no ambiente}"
: "${ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD:?senha da conta COMPRAS ausente no ambiente}"

mkdir -p "$OUT"
chmod 700 "$OUT"

# Diretorio privado de trabalho: tudo que carrega token (resposta do Auth e o
# --config do curl) mora aqui e e' removido ao sair, inclusive em falha.
PRIV_PARENT="${TMPDIR:-.tmp}"
if [[ ! -d "$PRIV_PARENT" ]]; then
  mkdir -p "$PRIV_PARENT"
  chmod 700 "$PRIV_PARENT"
fi
PRIV="$(mktemp -d "$PRIV_PARENT/prova-orcamento.XXXXXX")"
chmod 700 "$PRIV"
limpar() { [[ -n "${PRIV:-}" ]] && rm -rf -- "$PRIV"; }
trap limpar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

CURL_CFG="$PRIV/curl.cfg"
{
  printf 'header = "apikey: %s"\n' "$SUPABASE_ANON_KEY"
  printf 'header = "Content-Type: application/json"\n'
} > "$CURL_CFG"

FALHAS=0
INCONCLUSIVOS=0
falha()        { FALHAS=$((FALHAS + 1));            echo "CRITERIO_FALHOU: $*"; }
inconclusivo() { INCONCLUSIVOS=$((INCONCLUSIVOS + 1)); echo "CRITERIO_INCONCLUSIVO: $*"; }

# Veredito unico do script: aprovado so com TODOS os criterios medidos e verdes.
veredito() {
  if (( FALHAS > 0 )); then
    echo "FIM_PROVA=falha"
    exit 1
  fi
  if (( INCONCLUSIVOS > 0 )); then
    echo "FIM_PROVA=inconclusivo"
    exit 2
  fi
  echo "FIM_PROVA=aprovado"
  exit 0
}

# Identidade do RUN: correlaciona TODAS as chamadas e leituras a ESTA execucao.
# O identificador precisa ser UUID: `ai_usage_logs.request_id` so aceita esse
# formato (normalizeCorrelationId descarta o resto), entao um RUN_ID de outro
# formato nunca casaria a leitura — a prova mediria zero e diria "falha" para
# sempre. Recusar cedo e' melhor que medir o nada.
RUN_INICIO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_ID="$(printf '%s' "${ZAPP_PROVA_RUN_ID:-}" | tr 'A-Z' 'a-z')"
if [[ -z "$RUN_ID" ]]; then
  RUN_ID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || true)"
fi
if [[ -z "$RUN_ID" ]]; then
  # Sem /proc: monta um uuid v4 (versao 4 + variante RFC 4122) de /dev/urandom.
  _hex="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  RUN_ID="${_hex:0:8}-${_hex:8:4}-4${_hex:13:3}-$(printf '%x' $(( (0x${_hex:16:1} & 3) | 8 )))${_hex:17:3}-${_hex:20:12}"
  unset _hex
fi
if [[ ! "$RUN_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  inconclusivo "identificador do run nao e' UUID (ZAPP_PROVA_RUN_ID='${ZAPP_PROVA_RUN_ID:-}'): ai_usage_logs.request_id so aceita UUID"
  veredito
fi

echo "== PROVA DE ORCAMENTO E RATE LIMIT (producao) =="
echo "BASE=$BASE  FUNCAO=$FUNCAO  RUN_ID=$RUN_ID  RUN_INICIO=$RUN_INICIO"

# 1) Login no Supabase Auth do Zapp V2. A senha sai do ambiente direto para o
#    corpo (jq $ENV), que chega ao curl por stdin -- nunca por argv. A resposta
#    completa do Auth fica em $PRIV; em $OUT vai so o resumo redigido.
LOGIN_RC=0
LOGIN_HTTP=$(jq -nc \
  '{email:$ENV.ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL, password:$ENV.ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD}' \
  | curl -sS -o "$PRIV/login.json" -w '%{http_code}' \
    -X POST "$BASE/auth/v1/token?grant_type=password" \
    --config "$CURL_CFG" \
    --data-binary @-) || LOGIN_RC=$?
echo "LOGIN_HTTP=$LOGIN_HTTP  CONTA=$ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL"

if [[ -s "$PRIV/login.json" ]]; then
  jq -c '{token_type,expires_in,error,error_code,error_description,msg}' \
    "$PRIV/login.json" > "$OUT/login-resumo.json" 2>/dev/null \
    || printf '{"erro":"login sem json parseavel"}\n' > "$OUT/login-resumo.json"
else
  printf '{"erro":"login sem resposta"}\n' > "$OUT/login-resumo.json"
fi

JWT=""
if (( LOGIN_RC != 0 )); then
  falha "transporte do login falhou (curl exit=$LOGIN_RC)"
elif [[ "$LOGIN_HTTP" != "200" ]]; then
  falha "login nao devolveu HTTP 200 (recebido: $LOGIN_HTTP)"
  jq -c '{error,error_description,msg}' "$PRIV/login.json" 2>/dev/null | head -c 300; echo
else
  JWT=$(jq -r '.access_token // empty' "$PRIV/login.json" 2>/dev/null || true)
  if [[ -z "$JWT" ]]; then
    falha "login HTTP 200 sem access_token"
  else
    echo "JWT_OK=sim  (len=${#JWT}; valor nunca impresso)"
  fi
fi

# Sem login nao ha o que medir adiante: fecha o veredito com o que ja' foi medido.
if (( FALHAS > 0 )); then veredito; fi

printf 'header = "Authorization: Bearer %s"\n' "$JWT" >> "$CURL_CFG"

# 2) Chamadas reais. Cada resposta e' CONFERIDA (transporte, HTTP, corpo): uma
#    chamada que falha NAO pode terminar em "ok". 429 e' resultado VALIDO — e' a
#    propria prova de que o limite agiu — e nao entra como falha.
PAYLOADS=(
  '{"file_name":"risada-troll-meme.mp3","audio_url":"https://exemplo.invalid/risada-troll-meme.mp3"}'
  '{"file_name":"aplausos-standup.mp3","audio_url":"https://exemplo.invalid/aplausos-standup.mp3"}'
  '{"file_name":"suspense-drama.mp3","audio_url":"https://exemplo.invalid/suspense-drama.mp3"}'
)

OK_200=0
LIMITE=0
for (( i=0; i<N_CHAMADAS; i++ )); do
  n=$((i + 1))
  payload="${PAYLOADS[$((i % ${#PAYLOADS[@]}))]}"
  saida="$OUT/chamada$n.json"
  rc=0
  http=$(curl -sS -o "$saida" -w '%{http_code}' \
    -X POST "$BASE/functions/v1/$FUNCAO" \
    -H "x-ai-request-id: $RUN_ID" \
    --config "$CURL_CFG" \
    --data "$payload") || rc=$?
  echo "CHAMADA${n}_HTTP=$http  corpo=$(head -c 200 "$saida")"
  if (( rc != 0 )); then
    falha "chamada $n: transporte falhou (curl exit=$rc)"
    continue
  fi
  case "$http" in
    200)
      OK_200=$((OK_200 + 1))
      if ! jq -e 'type == "object" and (.category | type == "string")' "$saida" >/dev/null 2>&1; then
        falha "chamada $n: HTTP 200 sem corpo de classificacao valido"
      fi
      ;;
    429)
      LIMITE=$((LIMITE + 1))
      echo "CHAMADA${n}: 429 = rejeicao por rate limit (PROVA do limite, nao falha)"
      ;;
    *)
      falha "chamada $n: HTTP inesperado ($http)"
      ;;
  esac
done

# 3) Consumo registrado. Le as linhas DESTE run — correlacionadas pelo
#    `request_id` que foi mandado em cada chamada —, nunca um total global nem a
#    janela de horario sozinha: uma execucao concorrente na mesma janela nao
#    conta para este run. A RLS de ai_usage_logs limita a leitura ao proprio
#    usuario.
if (( OK_200 == 0 )); then
  inconclusivo "nenhuma chamada chegou ao provedor (${LIMITE} resposta(s) 429): o caminho de consumo nao foi exercitado"
else
  registradas=-1
  leitura_http=""
  leitura_ok=0
  for (( tentativa=1; tentativa<=3; tentativa++ )); do
    rc=0
    leitura_http=$(curl -sS -o "$OUT/ai_usage_logs.json" -w '%{http_code}' -G \
      "$BASE/rest/v1/ai_usage_logs" \
      --config "$CURL_CFG" \
      --data-urlencode "select=request_id,function_name,status,model,created_at" \
      --data-urlencode "request_id=eq.$RUN_ID" \
      --data-urlencode "function_name=eq.$FUNCAO" \
      --data-urlencode "created_at=gte.$RUN_INICIO") || rc=$?
    if (( rc != 0 )); then
      inconclusivo "transporte da leitura de ai_usage_logs falhou (curl exit=$rc)"
      break
    fi
    if [[ "$leitura_http" != "200" ]]; then
      inconclusivo "nao consegui ler ai_usage_logs (HTTP $leitura_http): consumo do run NAO medido"
      break
    fi
    registradas=$(jq 'if type=="array" then length else -1 end' "$OUT/ai_usage_logs.json" 2>/dev/null || echo -1)
    [[ "$registradas" =~ ^[0-9]+$ ]] || registradas=-1
    if (( registradas >= OK_200 )); then
      leitura_ok=1
      break
    fi
    if (( tentativa < 3 )); then sleep "$ESPERA"; fi
  done

  if (( leitura_ok == 1 )); then
    echo "CONSUMO_REGISTRADO=sim  linhas_do_run=$registradas  esperado>=$OK_200  run_id=$RUN_ID"
    jq -c '.[]? | {request_id, status, model}' "$OUT/ai_usage_logs.json" 2>/dev/null | head -c 600; echo
  elif [[ "$leitura_http" == "200" && "$registradas" != "-1" ]]; then
    falha "consumo nao registrado: $registradas linha(s) do run em ai_usage_logs (esperado >= $OK_200)"
  else
    inconclusivo "resposta de ai_usage_logs nao pode ser interpretada: consumo do run NAO medido"
  fi
fi

# 4) Leituras CORRELACIONADAS ao run (para o operador conferir no banco canonico,
#    quando precisar). Nunca use totais globais: eles nao provam ESTA execucao.
cat <<SQL

-- Confirme no banco canonico do projeto, sempre pelo RUN:
--   RUN_ID=$RUN_ID  RUN_INICIO=$RUN_INICIO  FUNCAO=$FUNCAO
--   select request_id, function_name, status, model, created_at
--     from ai_usage_logs
--    where request_id = '$RUN_ID'
--      and function_name = '$FUNCAO' and created_at >= '$RUN_INICIO'
--    order by created_at;
--   select key, hits, window_start from edge_rate_limits
--    where key like 'ai:user:$FUNCAO:%' and window_start >= '$RUN_INICIO';
--   select id, status, tokens, created_at from ai_budget_reservations
--    where created_at >= '$RUN_INICIO';
-- As chamadas com HTTP 200 devem aparecer em ai_usage_logs. 'status=success'
-- prova o caminho completo (reserva -> provedor -> liquidacao -> log).
-- 'status=error' com HTTP 401 significa provedor recusando a credencial: a rota,
-- o orcamento e o rate limit funcionaram; o que falhou foi a chave do provedor.
SQL

veredito
