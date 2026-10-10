#!/usr/bin/env bash
# IA-030 — ensaio de MIGRACAO + REVERSAO do contrato de vocabulario de IA (Bloco 03).
#
# Ate aqui a migration de contrato
#   20260930150000_ai_block03_vocabulary_contract.sql
# so foi CLASSIFICADA (aditiva x contrato); nunca foi EXECUTADA. Este ensaio roda o
# arquivo de verdade num PostgreSQL descartavel que reproduz o estado do banco de
# 30/09 ANTES do contrato, e assina cada promessa com expect_value/expect_error:
#
#   (1) backfill do vocabulario legado em contacts (IA-021);
#   (2) nenhuma linha perdida nem criada; coluna `nome` intacta;
#   (3) as 6 constraints existem e estao VALIDADAS (pg_constraint.convalidated = true);
#   (4) INSERT/UPDATE com valor invalido e REJEITADO citando a constraint;
#   (5) valor canonico e ACEITO;
#   (6) os defaults mascaradores sumiram (IA-023);
#   (7) ACL minima das RPCs (so service_role executa) + EXECUTE das funcoes de CHECK
#       (o CHECK roda no contexto de quem escreve);
#   (8) REVERSAO no nivel de schema (drop constraint + restore default).
#
# No fim prova que o ensaio PEGA O DEFEITO: muta uma COPIA da migration em /tmp
#   (a) remove os dois UPDATEs de backfill -> o `validate constraint` FALHA;
#   (b) troca 'normal' -> 'high' -> a assercao de backfill fica VERMELHA;
#   (c) confirma por sha256 que o arquivo do repo NUNCA foi tocado.
#
# Parametro opcional: caminho da migration a ensaiar (default = a do repo).
#
# NAO entra no CI: .github/workflows/db-guard.yml e territorio do Joaquim.

set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
migration="${1:-$repo_root/supabase/migrations/20260930150000_ai_block03_vocabulary_contract.sql}"
postgres_image="${AI_VOCAB_TEST_POSTGRES_IMAGE:-postgres:17-alpine}"

main_container="zapp-v2-aivocab-main-test-$$"
mut_a_container="zapp-v2-aivocab-muta-test-$$"
mut_b_container="zapp-v2-aivocab-mutb-test-$$"
target_container=""

remove_container() {
  local name="$1"
  if [[ "$name" =~ ^zapp-v2-aivocab-[a-z0-9]+-test-[0-9]+$ ]]; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  remove_container "$main_container"
  remove_container "$mut_a_container"
  remove_container "$mut_b_container"
}
trap cleanup EXIT INT TERM

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

psql_sql() {
  docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c "$1"
}

psql_file() {
  docker exec -i "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres < "$1"
}

# expect_error: a chamada precisa FALHAR e a mensagem precisa conter `needle`.
expect_error() {
  local label="$1" needle="$2" sql="$3" output status
  set +e
  output="$(docker exec "$target_container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c '\set VERBOSITY verbose' -c "$sql" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: deveria falhar, mas passou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

# expect_value: a ULTIMA linha do resultado precisa ser exatamente `expected`
# (chamadas que preparam a sessao imprimem o proprio retorno antes do resultado).
expect_value() {
  local label="$1" expected="$2" sql="$3" actual
  actual="$(psql_sql "$sql" | tail -n1)"
  if [[ "$actual" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$actual'"
  fi
  printf '[PASS] %s\n' "$label"
}

expect_ok() {
  local label="$1" sql="$2"
  psql_sql "$sql" >/dev/null || fail "$label: deveria ter sucesso"
  printf '[PASS] %s\n' "$label"
}

# Aplicar a migration mutada e exigir FALHA citando `needle` (usado na mutacao (a)).
expect_migration_failure() {
  local label="$1" file="$2" needle="$3" output status
  set +e
  output="$(psql_file "$file" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    printf '%s\n' "$output" >&2
    fail "$label: migration mutada deveria falhar, mas aplicou"
  fi
  if [[ "$output" != *"$needle"* ]]; then
    printf '%s\n' "$output" >&2
    fail "$label: esperava '$needle' no erro"
  fi
  printf '[PASS] %s\n' "$label"
}

start_container() {
  local name="$1" ready=0
  docker run --rm -d --name "$name" -e POSTGRES_PASSWORD=test_only "$postgres_image" >/dev/null
  for _ in $(seq 1 90); do
    if docker exec "$name" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
      ready=$((ready + 1))
      if (( ready >= 2 )); then break; fi
    else
      ready=0
    fi
    sleep 1
  done
  (( ready >= 2 )) || fail "PostgreSQL descartavel ($name) nao ficou pronto de forma estavel"
}

command -v docker >/dev/null 2>&1 || fail 'Docker nao esta instalado'
docker info >/dev/null 2>&1 || fail 'Docker daemon nao esta acessivel'
[[ -f "$migration" ]] || fail "migration nao encontrada: $migration"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"; cleanup' EXIT INT TERM

sha_before="$(sha256sum "$migration" | cut -d' ' -f1)"
cp "$migration" "$tmp_dir/original.sql"

# ── Estado ANTERIOR fiel ao banco de 30/09 ─────────────────────────────────────
cat > "$tmp_dir/pre.sql" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY,
  nome text,
  ai_sentiment text DEFAULT 'neutral',
  ai_priority text DEFAULT 'normal'
);

CREATE TABLE public.conversation_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  sentiment text,
  urgency text,
  churn_risk text,
  sentiment_score integer DEFAULT 50,
  customer_satisfaction integer DEFAULT 3
);

CREATE TABLE public.ai_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid,
  tag_name text,
  source text
);

-- Funcoes de vocabulario COPIADAS VERBATIM de
-- 20260930110000_ai_block03_analysis_persistence.sql (parte aditiva, ja aplicada).
create function public.ai_is_canonical_sentiment(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('positivo', 'neutro', 'negativo', 'critico');
$$;

create function public.ai_is_canonical_priority(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value is null or p_value in ('low', 'medium', 'high', 'urgent');
$$;

-- Converte jsonb (array) em text[], tratando ausencia como ausencia (usada pela RPC).
create function public.ai_text_array(p_value jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(x order by ord),
    '{}'::text[]
  )
  from (
    select value as x, ordinality as ord
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
    ) with ordinality
  ) s;
$$;

-- ── As duas RPCs do bloco, com as assinaturas REAIS (a migration de contrato faz
--    REVOKE/GRANT nelas, entao precisam existir). Corpos verbatim da parte aditiva.
create function public.persist_conversation_analysis(
  p_contact_id uuid,
  p_analysis jsonb,
  p_analyzed_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_analysis_id uuid;
  v_sentiment text := nullif(btrim(coalesce(p_analysis ->> 'sentiment', '')), '');
  v_priority text := nullif(btrim(coalesce(p_analysis ->> 'ai_priority', '')), '');
  v_projected boolean := false;
begin
  if p_contact_id is null then
    raise exception 'p_contact_id é obrigatório' using errcode = '22023';
  end if;

  if not public.ai_is_canonical_sentiment(v_sentiment) then
    raise exception 'sentiment fora do vocabulário canônico: %', v_sentiment using errcode = '22023';
  end if;
  if not public.ai_is_canonical_priority(v_priority) then
    raise exception 'ai_priority fora do vocabulário canônico: %', v_priority using errcode = '22023';
  end if;

  insert into public.conversation_analyses (
    contact_id, analyzed_by, summary, sentiment, sentiment_score,
    customer_satisfaction, key_points, next_steps, topics, urgency, status,
    message_count, department, relationship_type, agent_performance,
    churn_risk, sales_opportunity, analysis_version, period_days, coverage,
    model, analyzed_at
  ) values (
    p_contact_id,
    nullif(btrim(coalesce(p_analysis ->> 'analyzed_by', '')), '')::uuid,
    coalesce(nullif(btrim(coalesce(p_analysis ->> 'summary', '')), ''), 'Análise sem resumo'),
    v_sentiment,
    nullif(btrim(coalesce(p_analysis ->> 'sentiment_score', '')), '')::integer,
    nullif(btrim(coalesce(p_analysis ->> 'customer_satisfaction', '')), '')::integer,
    public.ai_text_array(p_analysis -> 'key_points'),
    public.ai_text_array(p_analysis -> 'next_steps'),
    public.ai_text_array(p_analysis -> 'topics'),
    nullif(btrim(coalesce(p_analysis ->> 'urgency', '')), ''),
    coalesce(nullif(btrim(coalesce(p_analysis ->> 'status', '')), ''), 'pendente'),
    nullif(btrim(coalesce(p_analysis ->> 'message_count', '')), '')::integer,
    nullif(btrim(coalesce(p_analysis ->> 'department', '')), ''),
    nullif(btrim(coalesce(p_analysis ->> 'relationship_type', '')), ''),
    case when jsonb_typeof(p_analysis -> 'agent_performance') = 'object'
         then p_analysis -> 'agent_performance' else null end,
    nullif(btrim(coalesce(p_analysis ->> 'churn_risk', '')), ''),
    nullif(btrim(coalesce(p_analysis ->> 'sales_opportunity', '')), ''),
    coalesce(nullif(btrim(coalesce(p_analysis ->> 'analysis_version', '')), '')::integer, 2),
    nullif(btrim(coalesce(p_analysis ->> 'period_days', '')), '')::integer,
    case when jsonb_typeof(p_analysis -> 'coverage') = 'object'
         then p_analysis -> 'coverage' else null end,
    nullif(btrim(coalesce(p_analysis ->> 'model', '')), ''),
    p_analyzed_at
  )
  returning id into v_analysis_id;

  if v_sentiment is not null or v_priority is not null then
    update public.contacts c
       set ai_sentiment = coalesce(v_sentiment, c.ai_sentiment),
           ai_priority = coalesce(v_priority, c.ai_priority),
           ai_projection_updated_at = p_analyzed_at,
           ai_projection_analysis_id = v_analysis_id,
           updated_at = now()
     where c.id = p_contact_id
       and (c.ai_projection_updated_at is null or c.ai_projection_updated_at <= p_analyzed_at);
    v_projected := found;
  end if;

  return jsonb_build_object(
    'analysis_id', v_analysis_id,
    'projected', v_projected,
    'analyzed_at', p_analyzed_at
  );
end;
$$;

create function public.replace_ai_conversation_tags(
  p_contact_id uuid,
  p_tags jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_contact_id is null then
    raise exception 'p_contact_id é obrigatório' using errcode = '22023';
  end if;

  delete from public.ai_conversation_tags
   where contact_id = p_contact_id
     and source = 'ai';

  insert into public.ai_conversation_tags (contact_id, tag_name, confidence, source)
  select p_contact_id, t.tag_name, max(t.confidence), 'ai'
    from (
      select
        btrim(coalesce(e ->> 'name', '')) as tag_name,
        case
          when nullif(btrim(coalesce(e ->> 'confidence', '')), '') is null then null
          else least(greatest(nullif(btrim(coalesce(e ->> 'confidence', '')), '')::numeric, 0), 1)
        end as confidence
      from jsonb_array_elements(
        case when jsonb_typeof(p_tags) = 'array' then p_tags else '[]'::jsonb end
      ) as e
    ) t
   where t.tag_name <> ''
   group by t.tag_name
  on conflict (contact_id, tag_name) do update
     set confidence = greatest(
           coalesce(excluded.confidence, public.ai_conversation_tags.confidence),
           coalesce(public.ai_conversation_tags.confidence, excluded.confidence)
         ),
         source = 'ai';

  select count(*) into v_count
    from public.ai_conversation_tags
   where contact_id = p_contact_id and source = 'ai';

  return jsonb_build_object('contact_id', p_contact_id, 'replaced', true, 'count', v_count);
end;
$$;
SQL

# ── Dados: 1.200 contatos cobrindo cada caso de sentimento e prioridade ────────
# indices 1..10 em cada lista; 'i % 10' cobre o ciclo inteiro (120 linhas por caso).
cat > "$tmp_dir/seed.sql" <<'SQL'
INSERT INTO public.contacts (id, nome, ai_sentiment, ai_priority)
SELECT ('00000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       'contato-' || lpad(i::text, 4, '0'),
       (ARRAY['neutral','positive','negative','critical','neutro','positivo','negativo','critico','weird',NULL])[1 + (i % 10)],
       (ARRAY['normal','low','medium','high','urgent','alta','critica','baixa','lixo',NULL])[1 + (i % 10)]
FROM generate_series(1, 1200) AS i;
SQL

TOTAL_CONTACTS=1200
CASES=10
PER_CASE=$((TOTAL_CONTACTS / CASES))     # 120
COMBINED=$((PER_CASE * 2))               # 240 (legado traduzido + canonico preservado)

# ───────────────────────────────────────────────────────────────────────────────
echo '── Estado ANTERIOR: defaults mascaradores e ACL herdada de PUBLIC ────────────────'
start_container "$main_container"
target_container="$main_container"
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"

expect_value 'ANTES: contacts.ai_sentiment assume default neutral' 'neutral/normal' \
  "INSERT INTO public.contacts (id, nome) VALUES ('11111111-1111-1111-1111-111111111111','probe-pre-contacts') RETURNING ai_sentiment || '/' || ai_priority"
psql_sql "DELETE FROM public.contacts WHERE nome = 'probe-pre-contacts'" >/dev/null
expect_value 'ANTES: conversation_analyses assume default 50/3' '50/3' \
  "INSERT INTO public.conversation_analyses (id, contact_id) VALUES ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000001') RETURNING sentiment_score || '/' || customer_satisfaction"
psql_sql "DELETE FROM public.conversation_analyses WHERE id = '22222222-2222-2222-2222-222222222222'" >/dev/null
expect_value 'ANTES: seed tem 1200 contatos cobrindo os casos de vocabulario' "$TOTAL_CONTACTS" \
  "SELECT count(*) FROM public.contacts"
expect_value 'ANTES: authenticated podia executar persist_conversation_analysis (herdado de PUBLIC)' 't' \
  "SELECT has_function_privilege('authenticated','public.persist_conversation_analysis(uuid,jsonb,timestamptz)','EXECUTE')"

name_hash_before="$(psql_sql "SELECT md5(string_agg(nome, ',' ORDER BY id)) FROM public.contacts")"

echo
echo '── Aplicando a migration de CONTRATO (psql_file com ON_ERROR_STOP=1) ─────────────'
psql_file "$migration" || fail 'migration de contrato falhou ao aplicar'
printf '[PASS] migration de contrato aplicou sem erro\n'

echo
echo '── (1) Backfill do vocabulario legado (IA-021) ──────────────────────────────────'
expect_value "backfill: 'neutral' (legado) nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'neutral'"
expect_value "backfill: 'positive' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'positive'"
expect_value "backfill: 'negative' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'negative'"
expect_value "backfill: 'critical' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'critical'"
expect_value "backfill: 'weird' (desconhecido) virou NULL" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'weird'"
expect_value "backfill: 'neutral'+'neutro' -> 'neutro' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'neutro'"
expect_value "backfill: 'positive'+'positivo' -> 'positivo' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'positivo'"
expect_value "backfill: 'negative'+'negativo' -> 'negativo' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'negativo'"
expect_value "backfill: 'critical'+'critico' -> 'critico' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment = 'critico'"
expect_value "backfill: 'weird'+NULL continuam NULL ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_sentiment IS NULL"

expect_value "backfill: 'normal' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'normal'"
expect_value "backfill: 'alta' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'alta'"
expect_value "backfill: 'critica' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'critica'"
expect_value "backfill: 'baixa' nao existe mais" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'baixa'"
expect_value "backfill: 'lixo' (desconhecido) virou NULL" '0' \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'lixo'"
expect_value "backfill: 'normal'+'medium' -> 'medium' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'medium'"
expect_value "backfill: 'baixa'+'low' -> 'low' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'low'"
expect_value "backfill: 'alta'+'high' -> 'high' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'high'"
expect_value "backfill: 'critica'+'urgent' -> 'urgent' ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_priority = 'urgent'"
expect_value "backfill: 'lixo'+NULL continuam NULL ($COMBINED)" "$COMBINED" \
  "SELECT count(*) FROM public.contacts WHERE ai_priority IS NULL"

echo
echo '── (2) Nenhuma linha perdida nem criada; `nome` intacta ─────────────────────────'
expect_value 'contagem de contacts preservada (nenhuma linha perdida/criada)' "$TOTAL_CONTACTS" \
  "SELECT count(*) FROM public.contacts"
expect_value 'coluna nome intacta (md5 do agregado inalterado)' "$name_hash_before" \
  "SELECT md5(string_agg(nome, ',' ORDER BY id)) FROM public.contacts"
expect_value 'migration nao criou analise (conversation_analyses segue vazia)' '0' \
  "SELECT count(*) FROM public.conversation_analyses"

echo
echo '── (3) As 6 constraints existem e estao VALIDADAS ───────────────────────────────'
for c in \
  contacts_ai_sentiment_canonical \
  contacts_ai_priority_canonical \
  conversation_analyses_sentiment_canonical \
  conversation_analyses_urgency_canonical \
  conversation_analyses_churn_risk_canonical \
  ai_conversation_tags_source_known; do
  expect_value "constraint $c existe e esta VALIDADA (convalidated)" 't' \
    "SELECT convalidated FROM pg_constraint WHERE conname = '$c'"
done

echo
echo '── (4)/(5) Valor invalido REJEITADO (citando a constraint); canonico ACEITO ─────'
expect_error 'INSERT com ai_sentiment invalido (positive) rejeitado citando a constraint' \
  'contacts_ai_sentiment_canonical' \
  "INSERT INTO public.contacts (id, nome, ai_sentiment) VALUES (gen_random_uuid(), 'probe-invalido', 'positive')"
expect_error 'UPDATE com ai_sentiment invalido (positive) rejeitado citando a constraint' \
  'contacts_ai_sentiment_canonical' \
  "UPDATE public.contacts SET ai_sentiment = 'positive' WHERE id = '00000000-0000-0000-0000-000000000001'"
expect_error 'INSERT com ai_priority invalido (lixo) rejeitado citando a constraint' \
  'contacts_ai_priority_canonical' \
  "INSERT INTO public.contacts (id, nome, ai_priority) VALUES (gen_random_uuid(), 'probe-invalido2', 'lixo')"
expect_ok "INSERT com valor canonico ('positivo') aceito" \
  "INSERT INTO public.contacts (id, nome, ai_sentiment) VALUES ('55555555-5555-5555-5555-555555555555','probe-canonico','positivo')"
expect_value 'valor canonico persistido' 'positivo' \
  "SELECT ai_sentiment FROM public.contacts WHERE id = '55555555-5555-5555-5555-555555555555'"

echo
echo '── (6) Defaults mascaradores sumiram (IA-023) ───────────────────────────────────'
expect_ok 'INSERT sem ai_sentiment/ai_priority em contacts' \
  "INSERT INTO public.contacts (id, nome) VALUES ('66666666-6666-6666-6666-666666666666','probe-defaults')"
expect_value 'contacts sem defaults: ai_sentiment e ai_priority ficam NULL (nao neutral/normal)' 't' \
  "SELECT ai_sentiment IS NULL AND ai_priority IS NULL FROM public.contacts WHERE id = '66666666-6666-6666-6666-666666666666'"
expect_ok 'INSERT sem sentiment_score/customer_satisfaction em conversation_analyses' \
  "INSERT INTO public.conversation_analyses (id, contact_id) VALUES ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000001')"
expect_value 'conversation_analyses sem defaults: score/CSAT ficam NULL (nao 50/3)' 't' \
  "SELECT sentiment_score IS NULL AND customer_satisfaction IS NULL FROM public.conversation_analyses WHERE id = '77777777-7777-7777-7777-777777777777'"

echo
echo '── (7) ACL minima das RPCs + EXECUTE das funcoes de CHECK ───────────────────────'
expect_value 'ACL: authenticated NAO tem EXECUTE em persist_conversation_analysis' 'f' \
  "SELECT has_function_privilege('authenticated','public.persist_conversation_analysis(uuid,jsonb,timestamptz)','EXECUTE')"
expect_value 'ACL: authenticated NAO tem EXECUTE em replace_ai_conversation_tags' 'f' \
  "SELECT has_function_privilege('authenticated','public.replace_ai_conversation_tags(uuid,jsonb)','EXECUTE')"
expect_value 'ACL: service_role TEM EXECUTE em persist_conversation_analysis' 't' \
  "SELECT has_function_privilege('service_role','public.persist_conversation_analysis(uuid,jsonb,timestamptz)','EXECUTE')"
expect_value 'ACL: service_role TEM EXECUTE em replace_ai_conversation_tags' 't' \
  "SELECT has_function_privilege('service_role','public.replace_ai_conversation_tags(uuid,jsonb)','EXECUTE')"
expect_error 'ACL: authenticated chamando persist_conversation_analysis -> permission denied' \
  'permission denied for function' \
  "SET ROLE authenticated; SELECT public.persist_conversation_analysis('00000000-0000-0000-0000-000000000001'::uuid,'{}'::jsonb, now())"
expect_error 'ACL: authenticated chamando replace_ai_conversation_tags -> permission denied' \
  'permission denied for function' \
  "SET ROLE authenticated; SELECT public.replace_ai_conversation_tags('00000000-0000-0000-0000-000000000001'::uuid,'[]'::jsonb)"
expect_error 'ACL: service_role passa a checagem de ACL e ENTRA no corpo (barra por coluna ausente no container)' \
  'does not exist' \
  "SET ROLE service_role; SELECT public.persist_conversation_analysis('00000000-0000-0000-0000-000000000001'::uuid,'{}'::jsonb, now())"
expect_value 'ACL: authenticated CONSEGUE executar ai_is_canonical_sentiment (CHECK roda no contexto de quem escreve)' 't' \
  "SET ROLE authenticated; SELECT public.ai_is_canonical_sentiment('positivo')"
expect_value 'ACL: authenticated CONSEGUE executar ai_is_canonical_priority' 't' \
  "SET ROLE authenticated; SELECT public.ai_is_canonical_priority('high')"
expect_value 'ACL: ai_is_canonical_sentiment ainda REJEITA legado no contexto de quem escreve' 'f' \
  "SET ROLE authenticated; SELECT public.ai_is_canonical_sentiment('positive')"

echo
echo '── (8) REVERSAO no nivel de schema (IA-030) ─────────────────────────────────────'
expect_ok 'REVERSAO: drop constraint contacts_ai_sentiment_canonical' \
  "ALTER TABLE public.contacts DROP CONSTRAINT contacts_ai_sentiment_canonical"
expect_ok "REVERSAO: ai_sentiment volta a DEFAULT 'neutral'" \
  "ALTER TABLE public.contacts ALTER COLUMN ai_sentiment SET DEFAULT 'neutral'"
expect_value 'REVERSAO: constraint removida de pg_constraint' '0' \
  "SELECT count(*) FROM pg_constraint WHERE conname = 'contacts_ai_sentiment_canonical'"
expect_ok 'REVERSAO: tabela aceita valor LEGADO neutral novamente' \
  "INSERT INTO public.contacts (id, nome, ai_sentiment) VALUES ('88888888-8888-8888-8888-888888888888','reversao-legado','neutral')"
expect_value "REVERSAO: default 'neutral' voltou a preencher" 'neutral' \
  "INSERT INTO public.contacts (id, nome) VALUES ('99999999-9999-9999-9999-999999999999','reversao-default') RETURNING ai_sentiment"

echo
echo '── MUTACOES: prova que o ensaio pega o defeito (copias em /tmp, nunca o repo) ────'

mut_a="$tmp_dir/mut_a_sem_backfill.sql"
mut_b="$tmp_dir/mut_b_normal_para_high.sql"

# (a) remove os dois UPDATEs de backfill (do inicio 'update public.contacts' ate o
#     ';' que fecha a respectiva clausula de filtro).
awk '
  /^update public\.contacts$/ { skip=1 }
  skip { if ($0 ~ /;[[:space:]]*$/) { skip=0 } ; next }
  { print }
' "$tmp_dir/original.sql" > "$mut_a"
# (b) troca um mapeamento do backfill: 'normal' -> 'high' (era 'medium').
sed "s/when 'normal' then 'medium'/when 'normal' then 'high'/" \
    "$tmp_dir/original.sql" > "$mut_b"

[[ "$(grep -c '^update public.contacts$' "$mut_a" || true)" == '0' ]] \
  || fail 'mutacao (a) nao removeu os UPDATEs de backfill'
[[ "$(grep -c 'validate constraint' "$mut_a" || true)" == '6' ]] \
  || fail 'mutacao (a) removeu coisa demais (as 6 validacoes devem permanecer)'
grep -q "when 'normal' then 'high'" "$mut_b" \
  || fail 'mutacao (b) nao trocou o mapeamento normal->high'

# (a) fresh container: sem backfill, o VALIDATE CONSTRAINT tem de FALHAR.
start_container "$mut_a_container"
target_container="$mut_a_container"
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"
expect_migration_failure 'MUTACAO (a): sem os UPDATEs de backfill, VALIDATE CONSTRAINT falha' \
  "$mut_a" 'contacts_ai_sentiment_canonical'

# (b) fresh container: mapeamento trocado aplica (ainda canonico) mas a assercao
#     de backfill fica VERMELHA.
start_container "$mut_b_container"
target_container="$mut_b_container"
psql_file "$tmp_dir/pre.sql"
psql_file "$tmp_dir/seed.sql"
psql_file "$mut_b" || fail 'MUTACAO (b): migration mutada nao aplicou'
observed="$(psql_sql "SELECT ai_priority FROM public.contacts WHERE id = '00000000-0000-0000-0000-000000000010'")"
if [[ "$observed" == 'medium' ]]; then
  fail "MUTACAO (b) NAO foi detectada: assercao de backfill passou com 'normal'->'high'"
fi
[[ "$observed" == 'high' ]] \
  || fail "MUTACAO (b): esperava observar 'high' na copia mutada, obtido '$observed'"
printf '[FAIL-esperado] backfill normal->medium: esperado %s, obtido %s (mutacao detectada)\n' "'medium'" "'$observed'"
printf '[PASS] MUTACAO (b): assercao de backfill ficou VERMELHA (obtido %s)\n' "$observed"

# (c) o arquivo do repo nunca foi tocado.
sha_after="$(sha256sum "$migration" | cut -d' ' -f1)"
[[ "$sha_after" == "$sha_before" ]] || fail 'MUTACAO (c): o arquivo do repo foi alterado'
cmp -s "$tmp_dir/original.sql" "$migration" || fail 'MUTACAO (c): copia pristina difere do repo'
printf '[PASS] MUTACAO (c): arquivo do repo intacto (sha256 %s)\n' "$sha_after"

printf '\n[OK] contrato de vocabulario de IA (IA-030) verificado: migration EXECUTA, faz o que promete e e reversivel\n'
