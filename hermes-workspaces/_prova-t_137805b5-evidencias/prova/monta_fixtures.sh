#!/usr/bin/env bash
# Monta as fixtures do cartao t_137805b5 em .tmp/prova/fixtures/<caso>/
set -eu
PROVA="$(cd "$(dirname "$0")" && pwd)"
FX="$PROVA/fixtures"

mk() { # mk <caso>
  local c="$1"
  mkdir -p "$FX/$c/copia/supabase/migrations" "$FX/$c/estado"
  : > "$FX/$c/estado/falhas.tsv"
  : > "$FX/$c/estado/check-diferencas.txt"
  printf '{}' > "$FX/$c/copia/supabase/schema-manifest.json"
  cat > "$FX/$c/copia/supabase/migrations/20261001000000_zzz_base.sql" <<'SQL'
-- zzz_base (ja aplicada, nao tem relacao com o caso)
-- Rollback: drop table if exists public.zzz_base_t137805b5;
create table public.zzz_base_t137805b5 (id int);
SQL
}

pend() { # pend <caso> <arquivo>  (conteudo vem do stdin)
  cat > "$FX/$1/copia/supabase/migrations/$2"
}

envf() { # envf <caso> <NOVAS...>
  local c="$1"; shift
  printf 'NOVAS=%s\nW=%s\nST=%s\n' "$*" "$FX/$c/copia" "$FX/$c/estado" > "$FX/$c/caso.env"
}

MIG=20261008000000_t137805b5_pend.sql

# ---- c1-rls-positivo / c2-rls-negativo: pendente cria t137805b5_pend
for c in c1-rls-positivo c2-rls-negativo; do
  mk "$c"
  pend "$c" "$MIG" <<'SQL'
-- t137805b5_pend
-- Rollback: drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
alter table public.t137805b5_pend enable row level security;
SQL
  envf "$c" "$MIG"
done
echo 'rls|t137805b5_pend'    > "$FX/c1-rls-positivo/estado/check-diferencas.txt"
echo 'rls|t137805b5_ausente' > "$FX/c2-rls-negativo/estado/check-diferencas.txt"

# ---- c3-index-positivo / c4-index-negativo
for c in c3-index-positivo c4-index-negativo; do
  mk "$c"
  pend "$c" "$MIG" <<'SQL'
-- t137805b5_pend
-- Rollback: drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
SQL
  envf "$c" "$MIG"
done
printf 'indexes|t137805b5_pend.t137805b5_pend_pkey\nconstraints|relation:t137805b5_pend.t137805b5_pend_pkey\n' > "$FX/c3-index-positivo/estado/check-diferencas.txt"
echo 'indexes|foo_bar.foo_bar_pkey' > "$FX/c4-index-negativo/estado/check-diferencas.txt"

# ---- c5-column-negativo
mk c5-column-negativo
pend c5-column-negativo "$MIG" <<'SQL'
-- t137805b5_pend
-- Rollback: drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (col_a text);
SQL
echo 'columns|t137805b5_pend.col_nao_citada' > "$FX/c5-column-negativo/estado/check-diferencas.txt"
envf c5-column-negativo "$MIG"

# ---- c6a-acl-policy-negativo
mk c6a-acl-policy-negativo
pend c6a-acl-policy-negativo "$MIG" <<'SQL'
-- t137805b5_pend + policy pol_certa
-- Rollback: drop policy if exists pol_certa on public.t137805b5_pend; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
alter table public.t137805b5_pend enable row level security;
create policy pol_certa on public.t137805b5_pend for select to authenticated using (true);
SQL
echo 'policies|t137805b5_pend.pol_errada' > "$FX/c6a-acl-policy-negativo/estado/check-diferencas.txt"
envf c6a-acl-policy-negativo "$MIG"

# ---- c6b-acl-papel-negativo (literal do cartao: papel relatorio_role E citado pela pendente)
mk c6b-acl-papel-negativo
pend c6b-acl-papel-negativo "$MIG" <<'SQL'
-- t137805b5_pend + grant para papel de aplicacao
-- Rollback: revoke all on public.t137805b5_pend from relatorio_role; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
grant select on public.t137805b5_pend to relatorio_role;
SQL
echo 'relation_grants|r:public.t137805b5_pend|relatorio_role|SELECT|grantor=postgres' > "$FX/c6b-acl-papel-negativo/estado/check-diferencas.txt"
envf c6b-acl-papel-negativo "$MIG"

# ---- c6b2-acl-papel-naocitado (variante: papel fora dos padrao NAO citado — prova o negativo real)
mk c6b2-acl-papel-naocitado
pend c6b2-acl-papel-naocitado "$MIG" <<'SQL'
-- t137805b5_pend + grant para outro papel
-- Rollback: revoke all on public.t137805b5_pend from relatorio_role; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
grant select on public.t137805b5_pend to relatorio_role;
SQL
echo 'relation_grants|r:public.t137805b5_pend|auditoria_role|SELECT|grantor=postgres' > "$FX/c6b2-acl-papel-naocitado/estado/check-diferencas.txt"
envf c6b2-acl-papel-naocitado "$MIG"

# ---- c6c-acl-funcao-negativo
mk c6c-acl-funcao-negativo
pend c6c-acl-funcao-negativo "$MIG" <<'SQL'
-- t137805b5_pend (tabela; nenhuma funcao)
-- Rollback: drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
SQL
echo 'routine_grants|f:t137805b5_fn(p_id uuid)|authenticated|EXECUTE|grantor=postgres' > "$FX/c6c-acl-funcao-negativo/estado/check-diferencas.txt"
envf c6c-acl-funcao-negativo "$MIG"

# ---- c6d-acl-explicito-igual
mk c6d-acl-explicito-igual
pend c6d-acl-explicito-igual "$MIG" <<'SQL'
-- t137805b5_pend + revoke explicito de papel padrao
-- Rollback: grant all on public.t137805b5_pend to authenticated; drop table if exists public.t137805b5_pend;
create table public.t137805b5_pend (id bigint generated always as identity primary key, col_a text);
revoke all on public.t137805b5_pend from authenticated;
SQL
echo 'relation_grants|r:public.t137805b5_pend|authenticated|SELECT|grantor=postgres' > "$FX/c6d-acl-explicito-igual/estado/check-diferencas.txt"
envf c6d-acl-explicito-igual "$MIG"

ls -d "$FX"/*/ | wc -l
find "$FX" -name caso.env | sort
