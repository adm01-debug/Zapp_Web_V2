#!/usr/bin/env python3
"""
Supabase -> GitHub snapshot (v2).

Introspecta um projeto Supabase (Postgres + Management API) e grava um retrato
completo, determinístico e sem dados pessoais em Markdown/JSON/SQL, pensado
para ser lido por agentes de IA antes de planejar ou executar tarefas.

Garantias:
  * Somente leitura no banco (sessão read-only, statement_timeout, lock_timeout).
  * Nunca grava linhas de tabelas, valores de segredos, chaves, senhas ou DSN.
  * Saída estrutural determinística (ordenada, sem timestamps, sem métricas
    voláteis) -> o git só registra commit quando algo REAL mudou.
    Métricas voláteis (linhas, bytes, scans, contagens, execuções de cron,
    saúde) ficam separadas em stats.md / stats.json / cron-runs.md.
  * Cada seção é isolada: falha em uma não derruba as outras. Uma seção que
    falhou é carregada da coleta anterior (com aviso), nunca registrada como
    "tudo removido" no CHANGELOG.
  * CHANGELOG.md recebe um diff semântico por categoria a cada mudança.

Variáveis de ambiente:
  SUPABASE_DB_URL            (obrigatório) postgres://... (pooler em SESSION mode, ou direta)
  SUPABASE_PROJECT_REF       (opcional)   ref do projeto -> habilita Management API
  SUPABASE_ACCESS_TOKEN      (opcional)   personal access token da Management API
  SNAPSHOT_DIR               (default docs/supabase)
  SNAPSHOT_EXCLUDE_SCHEMAS   schemas extras a ignorar, separados por vírgula
  SNAPSHOT_INCLUDE_SCHEMAS   schemas internos do Supabase a FORÇAR inclusão (ex.: "graphql_public")
  PGDUMP_SCHEMAS             (default "public") schemas do pg_dump --schema-only
  GEN_TYPES                  (default "true") gera types.ts via supabase CLI (npx)
  PGDUMP                     (default "true") gera schema.sql via pg_dump (exige pg_dump >= versão do servidor)
  CRON_RUNS_PER_JOB          (default 3) últimas execuções por job do pg_cron
  STAT_STATEMENTS_TOP        (default 15) consultas mais custosas em stats.md (0 desliga)
  REPO_ROOT                  (default ".") raiz do repo para cruzar funções x código (vazio desliga)
  CODE_SCAN_DIRS             (default src,supabase/functions,supabase/migrations,scripts,...) pastas varridas
  SUPABASE_SNAPSHOT_PUBLICACAO  (default "Gerado automaticamente...") rodapé do índice
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from decimal import Decimal
from typing import Any, Callable

import psycopg
from psycopg.rows import dict_row

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

FORMAT_VERSION = 2

DB_URL = os.environ.get("SUPABASE_DB_URL", "").strip()
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "").strip()
ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
OUT = pathlib.Path(os.environ.get("SNAPSHOT_DIR", "docs/supabase")).resolve()
PGDUMP_SCHEMAS = [s.strip() for s in os.environ.get("PGDUMP_SCHEMAS", "public").split(",") if s.strip()]
GEN_TYPES = os.environ.get("GEN_TYPES", "true").lower() in ("1", "true", "yes")
PGDUMP = os.environ.get("PGDUMP", "true").lower() in ("1", "true", "yes")
CRON_RUNS_PER_JOB = int(os.environ.get("CRON_RUNS_PER_JOB", "3"))
STAT_STATEMENTS_TOP = int(os.environ.get("STAT_STATEMENTS_TOP", "15"))
# Raiz do repositório para cruzar "quem chama cada função no código". Vazio = desliga.
REPO_ROOT = pathlib.Path(os.environ.get("REPO_ROOT", ".")).resolve() if os.environ.get("REPO_ROOT", ".") else None
CODE_SCAN_DIRS = [d.strip() for d in os.environ.get("CODE_SCAN_DIRS", "src,supabase/functions,supabase/migrations,scripts,app,lib,server,api").split(",") if d.strip()]
CODE_SCAN_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".py", ".go", ".vue", ".svelte"}
CODE_SCAN_MAX_FILES = int(os.environ.get("CODE_SCAN_MAX_FILES", "20000"))

SYSTEM_SCHEMAS = {"pg_catalog", "information_schema", "pg_toast"}
# Schemas internos do Supabase: cheios de objetos que não são do app. Ficam fora da
# introspecção geral; o que importa deles é coletado em seções dedicadas
# (policies de storage/realtime, triggers em auth/storage, cron, migrations, vault...).
SUPABASE_INTERNAL_SCHEMAS = {
    "auth", "storage", "realtime", "_realtime", "extensions", "graphql", "graphql_public",
    "net", "pgsodium", "pgsodium_masks", "vault", "supabase_functions", "supabase_migrations",
    "cron", "pgbouncer", "pgmq", "pgtle", "repack", "_analytics", "_supavisor", "pg_stat_statements",
}
FORCE_INCLUDE = {s.strip() for s in os.environ.get("SNAPSHOT_INCLUDE_SCHEMAS", "").split(",") if s.strip()}
EXCLUDE_SCHEMAS = (SYSTEM_SCHEMAS | SUPABASE_INTERNAL_SCHEMAS | {
    s.strip() for s in os.environ.get("SNAPSHOT_EXCLUDE_SCHEMAS", "").split(",") if s.strip()
}) - FORCE_INCLUDE

# Roles de sistema do Supabase — grants para elas são ruído.
SYSTEM_ROLES = {
    "postgres", "supabase_admin", "supabase_auth_admin", "supabase_storage_admin",
    "supabase_read_only_user", "supabase_replication_admin", "supabase_realtime_admin",
    "supabase_functions_admin", "supabase_etl_admin", "dashboard_user", "pgbouncer", "pgsodium_keyholder",
    "pgsodium_keyiduser", "pgsodium_keymaker", "pgtle_admin",
}
API_ROLES = ("anon", "authenticated", "service_role", "PUBLIC")

MGMT_API = "https://api.supabase.com/v1"
REDACT_RE = re.compile(
    r"(secret|password|passwd|token|private_key|api_key|apikey|smtp_pass|client_secret|"
    r"signing_key|service_key|anon_key|service_role|jwt|credential|encryption_key|connection_string|dsn)",
    re.I,
)

ERRORS: list[dict[str, str]] = []
CARRIED: list[str] = []  # seções reaproveitadas da coleta anterior por erro


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def log(msg: str) -> None:
    print(f"[snapshot] {msg}", flush=True)


def record_error(section: str, err: Exception | str) -> None:
    text = str(err).strip().splitlines()[0] if str(err).strip() else repr(err)
    ERRORS.append({"section": section, "error": text[:500]})
    log(f"ERRO em {section}: {text[:300]}")


def jsonable(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (bytes, memoryview)):
        return bytes(value).hex()
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    return value


def dumps(obj: Any) -> str:
    return json.dumps(jsonable(obj), ensure_ascii=False, indent=2, sort_keys=True, default=str)


def sha(obj: Any) -> str:
    return hashlib.sha256(json.dumps(jsonable(obj), sort_keys=True, default=str).encode()).hexdigest()[:16]


def md_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "sim" if value else "não"
    if isinstance(value, (list, tuple)):
        value = ", ".join(str(v) for v in value)
    return str(value).replace("\r", "").replace("\n", " ").replace("|", "\\|")


def md_table(headers: list[str], rows: list[list[Any]]) -> str:
    if not rows:
        return "_nenhum_\n"
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(md_cell(c) for c in r) + " |")
    return "\n".join(out) + "\n"


def code(v: Any) -> str:
    return f"`{v}`" if v not in (None, "") else ""


def human_bytes(n: Any) -> str:
    try:
        n = float(n)
    except (TypeError, ValueError):
        return ""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


def approx(n: Any) -> str:
    """Ordem de grandeza estável: ~0, ~1-9, ~12, ~1.2k, ~34k, ~1.5M."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    if n < 10:
        return str(n)
    for div, suf in ((1_000_000_000, "B"), (1_000_000, "M"), (1_000, "k")):
        if n >= div:
            return f"~{n / div:.1f}{suf}".replace(".0", "")
    return f"~{round(n, -1)}"


def slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", text).strip("_") or "_"


_SLUG_SEEN: dict[str, str] = {}


def uslug(text: str, scope: str = "") -> str:
    """slug único dentro de um escopo: nomes diferentes que colidem no slug ganham sufixo com hash."""
    base = slug(text)
    key = f"{scope}/{base}"
    owner = _SLUG_SEEN.setdefault(key, text)
    return base if owner == text else f"{base}__{sha(text)[:6]}"


def write(path: pathlib.Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")


def redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: ("[REDACTED]" if REDACT_RE.search(str(k)) else redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [redact(v) for v in obj]
    if isinstance(obj, str):
        return scrub(obj)
    return obj


def excluded_sql(alias: str = "n.nspname", extra: set[str] | None = None) -> str:
    lst = ", ".join("'" + s.replace("'", "''") + "'" for s in sorted(EXCLUDE_SCHEMAS | (extra or set())))
    return f"{alias} NOT IN ({lst})"


def group(rows, keyfn):
    g: dict[Any, list] = {}
    for r in rows or []:
        g.setdefault(keyfn(r), []).append(r)
    return g


# --------------------------------------------------------------------------- #
# Database introspection
# --------------------------------------------------------------------------- #

SCRUB_RULES: list[tuple[re.Pattern, str]] = [
    # JWT (3 partes) — anon/service_role keys do Supabase
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}"), "[REDACTED_JWT]"),
    # chaves novas do Supabase
    (re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}"), "[REDACTED_KEY]"),
    # Authorization: Bearer <token>  /  apikey: <token>
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]{16,}"), r"\1[REDACTED]"),
    # valor precisa parecer token: >= 16 chars, sem espaço, com pelo menos um dígito (evita redigir prosa)
    (re.compile(r"""(?i)((?:apikey|api_key|x-api-key|authorization|token|secret|password|passwd|service_role_key|anon_key)\s*["']?\s*[:=]\s*["']?)(?=[^"'\s,;)}]*\d)[^"'\s,;)}]{16,}"""), r"\1[REDACTED]"),
    # PASSWORD 'x' em DDL de role
    (re.compile(r"(?i)(password\s+)'[^']*'"), r"\1'[REDACTED]'"),
    # DSN com senha
    (re.compile(r"(\w+://[^/\s:@]+:)[^@\s]+(@)"), r"\1[REDACTED]\2"),
    # chaves de provedores comuns
    (re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b"), "[REDACTED_KEY]"),
]


def scrub(text: str) -> str:
    """Redige segredos em texto vindo do banco (comandos de cron, corpos de função, migrations, webhooks...)."""
    for rx, rep in SCRUB_RULES:
        text = rx.sub(rep, text)
    return text


def scrub_value(v: Any) -> Any:
    if isinstance(v, str):
        return scrub(v) if len(v) > 7 else v
    if isinstance(v, list):
        return [scrub_value(x) for x in v]
    if isinstance(v, dict):
        return {k: scrub_value(x) for k, x in v.items()}
    return v


def q(conn: psycopg.Connection, sql: str, params: tuple | None = None) -> list[dict]:
    # params=None -> psycopg não interpreta '%' como placeholder (LIKE 'pg_%' funciona sem escapar).
    # Todo texto que sai do banco passa pelo scrub: pg_cron chamando edge function com service_role no
    # header, migration com senha, trigger http_request com apikey — tudo isso existe na prática.
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params or None)
        return [{k: scrub_value(v) for k, v in dict(r).items()} for r in cur.fetchall()]


def has_ext(conn, name: str) -> bool:
    return bool(q(conn, "SELECT 1 FROM pg_extension WHERE extname = %s", (name,)))


def has_table(conn, schema: str, table: str) -> bool:
    return bool(q(conn, "SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = %s AND c.relname = %s", (schema, table)))


def section(name: str, volatile: bool = False):
    """Isola falhas por seção. volatile=True -> vai para stats.*, fora do snapshot estrutural."""
    def deco(fn):
        def wrapper(conn):
            try:
                data = fn(conn)
                log(f"{name}: ok ({len(data) if hasattr(data, '__len__') else 1})")
                return data
            except Exception as e:  # noqa: BLE001
                record_error(name, e)
                try:
                    conn.rollback()
                except Exception:  # noqa: BLE001
                    pass
                return None
        wrapper.__name__ = name
        wrapper.volatile = volatile  # type: ignore[attr-defined]
        return wrapper
    return deco


@section("server")
def get_server(conn):
    rows = q(conn, """
        SELECT name, setting FROM pg_settings
        WHERE name IN ('server_version','max_connections','timezone','statement_timeout','idle_in_transaction_session_timeout',
                       'shared_buffers','work_mem','maintenance_work_mem','max_wal_size','log_min_duration_statement',
                       'default_transaction_isolation','wal_level','max_worker_processes','max_parallel_workers')
        ORDER BY name""")
    info = {r["name"]: r["setting"] for r in rows}
    info["database"] = q(conn, "SELECT current_database() AS db")[0]["db"]
    info["exposed_schemas_hint"] = "ver project-config.md (postgrest db_schemas); default: public, graphql_public"
    return info


@section("schemas")
def get_schemas(conn):
    return q(conn, f"""
        SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner, obj_description(n.oid, 'pg_namespace') AS comment,
               (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) FROM pg_roles r
                 WHERE r.rolname IN ('anon','authenticated','service_role') AND has_schema_privilege(r.oid, n.oid, 'USAGE')) AS usage_api_roles
        FROM pg_namespace n
        WHERE {excluded_sql()} AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast%'
        ORDER BY 1""")


@section("tables")
def get_tables(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name,
               CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned' WHEN 'f' THEN 'foreign' END AS kind,
               c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
               pg_get_userbyid(c.relowner) AS owner, obj_description(c.oid, 'pg_class') AS comment,
               c.relispartition AS is_partition,
               (SELECT pn.nspname || '.' || pc.relname FROM pg_inherits i JOIN pg_class pc ON pc.oid = i.inhparent
                  JOIN pg_namespace pn ON pn.oid = pc.relnamespace WHERE i.inhrelid = c.oid LIMIT 1) AS parent,
               CASE WHEN c.relkind = 'p' THEN pg_get_partkeydef(c.oid) END AS partition_key,
               CASE WHEN c.relispartition THEN pg_get_expr(c.relpartbound, c.oid) END AS partition_bound,
               CASE c.relreplident WHEN 'd' THEN 'default' WHEN 'f' THEN 'full' WHEN 'i' THEN 'index' WHEN 'n' THEN 'nothing' END AS replica_identity,
               EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') AS from_extension
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p','f') AND {excluded_sql()}
        ORDER BY 1, 2""")


@section("columns")
def get_columns(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", a.attnum AS position, a.attname AS name,
               format_type(a.atttypid, a.atttypmod) AS type,
               NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS "default",
               NULLIF(a.attidentity, '') AS identity, NULLIF(a.attgenerated, '') AS generated,
               col_description(c.oid, a.attnum) AS comment,
               (t.typtype = 'e') AS is_enum
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_type t ON t.oid = a.atttypid
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f') AND {excluded_sql()}
        ORDER BY 1, 2, 3""")


@section("constraints")
def get_constraints(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", con.conname AS name,
               CASE con.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'u' THEN 'UNIQUE'
                    WHEN 'c' THEN 'CHECK' WHEN 'x' THEN 'EXCLUDE' ELSE con.contype::text END AS type,
               pg_get_constraintdef(con.oid, true) AS definition,
               ARRAY(SELECT a.attname FROM unnest(con.conkey) k JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k) AS columns,
               fn.nspname AS ref_schema, fc.relname AS ref_table,
               ARRAY(SELECT a.attname FROM unnest(con.confkey) k JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k) AS ref_columns,
               CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_delete,
               CASE con.confupdtype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END AS on_update,
               con.condeferrable AS deferrable, con.convalidated AS validated
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_class fc ON fc.oid = con.confrelid
        LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        WHERE {excluded_sql()}
        ORDER BY 1, 2, 3""")


@section("indexes")
def get_indexes(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, t.relname AS "table", ic.relname AS name, pg_get_indexdef(ix.indexrelid) AS definition,
               ix.indisunique AS is_unique, ix.indisprimary AS is_primary, ix.indisvalid AS is_valid,
               am.amname AS method,
               ARRAY(SELECT a.attname FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
                     JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
               pg_get_expr(ix.indpred, ix.indrelid) AS predicate
        FROM pg_index ix
        JOIN pg_class ic ON ic.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = ic.relam
        WHERE {excluded_sql()}
        ORDER BY 1, 2, 3""")


@section("views")
def get_views(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name,
               CASE c.relkind WHEN 'v' THEN 'view' ELSE 'materialized' END AS kind,
               pg_get_viewdef(c.oid, true) AS definition,
               c.reloptions AS options, pg_get_userbyid(c.relowner) AS owner,
               obj_description(c.oid, 'pg_class') AS comment,
               CASE WHEN c.relkind = 'm' THEN c.relispopulated END AS populated,
               (c.relkind = 'v' AND coalesce(array_to_string(c.reloptions, ','), '') ILIKE '%security_invoker=true%') AS security_invoker,
               ARRAY(SELECT DISTINCT dn.nspname || '.' || dc.relname
                     FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
                     JOIN pg_class dc ON dc.oid = d.refobjid JOIN pg_namespace dn ON dn.oid = dc.relnamespace
                     WHERE r.ev_class = c.oid AND d.refobjid <> c.oid AND dc.relkind IN ('r','p','v','m','f')
                     ORDER BY 1) AS depends_on
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('v','m') AND {excluded_sql()}
        ORDER BY 1, 2""")


@section("functions")
def get_functions(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS returns,
               l.lanname AS language,
               CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' END AS kind,
               p.prosecdef AS security_definer,
               CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' ELSE 'volatile' END AS volatility,
               p.proconfig AS config, p.proleakproof AS leakproof, p.proisstrict AS strict,
               pg_get_userbyid(p.proowner) AS owner, obj_description(p.oid, 'pg_proc') AS comment,
               CASE WHEN p.prokind IN ('f','p') THEN pg_get_functiondef(p.oid) END AS definition,
               (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) FROM pg_roles r
                 WHERE r.rolname IN ('anon','authenticated','service_role') AND has_function_privilege(r.oid, p.oid, 'EXECUTE')) AS execute_api_roles,
               has_function_privilege('public', p.oid, 'EXECUTE') AS execute_public,
               (p.prorettype = 'trigger'::regtype) AS is_trigger_fn
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE {excluded_sql()}
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
        ORDER BY 1, 2, 3""")


@section("triggers")
def get_triggers(conn):
    # inclui auth e storage: triggers do app em auth.users / storage.objects são críticos.
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS "table", t.tgname AS name,
               CASE t.tgenabled WHEN 'O' THEN 'enabled' WHEN 'D' THEN 'disabled' WHEN 'R' THEN 'replica' WHEN 'A' THEN 'always' END AS status,
               pn.nspname || '.' || p.proname AS function,
               CASE WHEN (t.tgtype & 2) > 0 THEN 'BEFORE' WHEN (t.tgtype & 64) > 0 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
               concat_ws(' OR ', CASE WHEN (t.tgtype & 4) > 0 THEN 'INSERT' END, CASE WHEN (t.tgtype & 8) > 0 THEN 'DELETE' END,
                         CASE WHEN (t.tgtype & 16) > 0 THEN 'UPDATE' END, CASE WHEN (t.tgtype & 32) > 0 THEN 'TRUNCATE' END) AS events,
               CASE WHEN (t.tgtype & 1) > 0 THEN 'ROW' ELSE 'STATEMENT' END AS level,
               pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
        JOIN pg_namespace pn ON pn.oid = p.pronamespace
        WHERE NOT t.tgisinternal AND ({excluded_sql()} OR n.nspname IN ('auth','storage'))
        ORDER BY 1, 2, 3""")


@section("policies")
def get_policies(conn):
    # inclui storage (buckets/objects) e realtime.messages (broadcast/presence authorization)
    return q(conn, f"""
        SELECT schemaname AS schema, tablename AS "table", policyname AS name,
               permissive, roles, cmd, qual AS "using", with_check
        FROM pg_policies
        WHERE {excluded_sql('schemaname')} OR schemaname IN ('storage','realtime')
        ORDER BY 1, 2, 3""")


@section("types")
def get_types(conn):
    enums = q(conn, f"""
        SELECT n.nspname AS schema, t.typname AS name, 'enum' AS kind,
               array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE {excluded_sql()}
        GROUP BY 1, 2 ORDER BY 1, 2""")
    domains = q(conn, f"""
        SELECT n.nspname AS schema, t.typname AS name, 'domain' AS kind,
               format_type(t.typbasetype, t.typtypmod) AS base_type,
               t.typnotnull AS not_null, t.typdefault AS "default",
               ARRAY(SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c WHERE c.contypid = t.oid) AS constraints,
               obj_description(t.oid, 'pg_type') AS comment
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'd' AND {excluded_sql()}
        ORDER BY 1, 2""")
    composites = q(conn, f"""
        SELECT n.nspname AS schema, t.typname AS name, 'composite' AS kind,
               array_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum) AS fields
        FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_class c ON c.oid = t.typrelid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        WHERE t.typtype = 'c' AND c.relkind = 'c' AND {excluded_sql()}
        GROUP BY 1, 2 ORDER BY 1, 2""")
    return {"enums": enums, "domains": domains, "composites": composites}


@section("sequences")
def get_sequences(conn):
    return q(conn, f"""
        SELECT n.nspname AS schema, s.relname AS name, pg_get_userbyid(s.relowner) AS owner,
               seq.seqstart AS start, seq.seqincrement AS increment, seq.seqmax AS max_value,
               seq.seqmin AS min_value, seq.seqcycle AS cycle,
               obj_description(s.oid, 'pg_class') AS comment
        FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace JOIN pg_sequence seq ON seq.seqrelid = s.oid
        WHERE s.relkind = 'S' AND {excluded_sql()}
        ORDER BY 1, 2""")


@section("grants")
def get_grants(conn):
    return q(conn, f"""
        SELECT grantor, grantee, table_schema AS schema, table_name AS "table",
               string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges, is_grantable
        FROM information_schema.role_table_grants
        WHERE table_schema NOT IN ({', '.join("'" + s + "'" for s in sorted(EXCLUDE_SCHEMAS))})
          AND grantee IN ('anon','authenticated','service_role')
        GROUP BY 1,2,3,4,6 ORDER BY 2,3,4""")


@section("rls")
def get_rls(conn):
    """Tabelas públicas sem RLS habilitado — potencial brecha de segurança."""
    return q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name,
               c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
               (SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname) FROM pg_roles r
                 WHERE r.rolname IN ('anon','authenticated','service_role')
                   AND has_table_privilege(r.oid, c.oid, 'SELECT')) AS select_api_roles,
               EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid) AS has_policies
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p') AND {excluded_sql()}
        ORDER BY 1, 2""")


@section("storage")
def get_storage(conn):
    if not has_table(conn, "storage", "buckets"):
        return []
    return q(conn, """
        SELECT id, name, public, file_size_limit, allowed_mime_types, owner, created_at,
               (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = b.id) AS object_count
        FROM storage.buckets b ORDER BY name""")


@section("vault")
def get_vault(conn):
    if not has_table(conn, "vault", "secrets"):
        return []
    # Nunca retorna valores — só nomes e IDs.
    return q(conn, """
        SELECT id, name, description, created_at, updated_at
        FROM vault.secrets ORDER BY name""")


@section("hooks")
def get_hooks(conn):
    if not has_table(conn, "supabase_functions", "hooks"):
        return []
    return q(conn, """
        SELECT id, hook_table_id, hook_name, created_at,
               request_id
        FROM supabase_functions.hooks ORDER BY hook_name""")


@section("webhooks")
def get_webhooks(conn):
    # supabase_functions.hooks é a tabela antiga; a nova API usa pg_net + triggers
    if not has_table(conn, "supabase_functions", "hooks"):
        return {"hooks": [], "note": "supabase_functions.hooks not found"}
    rows = q(conn, """
        SELECT id, hook_table_id, hook_name, created_at FROM supabase_functions.hooks ORDER BY hook_name""")
    return {"hooks": rows}


@section("cron")
def get_cron(conn):
    if not has_ext(conn, "pg_cron"):
        return []
    return q(conn, """
        SELECT jobid, jobname, schedule, command, nodename, nodeport, database, username, active, runcount
        FROM cron.job ORDER BY jobname""")


@section("cron_runs", volatile=True)
def get_cron_runs(conn):
    if not has_ext(conn, "pg_cron"):
        return []
    n = CRON_RUNS_PER_JOB
    return q(conn, f"""
        WITH ranked AS (
          SELECT r.*, row_number() OVER (PARTITION BY r.jobid ORDER BY r.start_time DESC) AS rn
          FROM cron.job_run_details r
        )
        SELECT jobid, runid, job_pid, database, username, command, status, return_message,
               start_time, end_time, extract(epoch FROM (end_time - start_time))::numeric(10,3) AS duration_s
        FROM ranked WHERE rn <= {n} ORDER BY jobid, start_time DESC""")


@section("migrations")
def get_migrations(conn):
    if not has_table(conn, "supabase_migrations", "schema_migrations"):
        return []
    return q(conn, """
        SELECT version, name, statements
        FROM supabase_migrations.schema_migrations
        ORDER BY version""")


@section("project_config")
def get_project_config(conn):
    rows = q(conn, """
        SELECT name, setting FROM pg_settings
        WHERE name IN ('pgrst.db_schemas','pgrst.db_extra_search_path','pgrst.db_anon_role',
                       'pgrst.jwt_secret','pgrst.jwt_aud','pgrst.max_rows','pgrst.server_host',
                       'pgrst.server_port','pgrst.db_pool','pgrst.db_pool_timeout',
                       'pgrst.db_pre_request','pgrst.db_pre_config')
        ORDER BY name""")
    return {r["name"]: r["setting"] for r in rows}


@section("extensions")
def get_extensions(conn):
    return q(conn, """
        SELECT e.extname AS name, e.extversion AS version,
               n.nspname AS schema, c.description
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        LEFT JOIN pg_description c ON c.objoid = e.oid AND c.classoid = 'pg_extension'::regclass
        ORDER BY e.extname""")


@section("roles")
def get_roles(conn):
    return q(conn, """
        SELECT r.rolname AS name, r.rolsuper AS superuser, r.rolinherit AS inherit,
               r.rolcreaterole AS createrole, r.rolcreatedb AS createdb,
               r.rolcanlogin AS can_login, r.rolreplication AS replication,
               r.rolbypassrls AS bypassrls, r.rolconnlimit AS conn_limit,
               r.rolvaliduntil AS valid_until,
               ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid WHERE m.member = r.oid ORDER BY 1) AS member_of,
               ARRAY(SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.member WHERE m.roleid = r.oid ORDER BY 1) AS members
        FROM pg_roles r
        WHERE r.rolname NOT LIKE 'pg_%' AND r.rolname NOT IN (
            'supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_read_only_user',
            'supabase_replication_admin','supabase_realtime_admin','supabase_functions_admin','supabase_etl_admin',
            'dashboard_user','pgbouncer','pgsodium_keyholder','pgsodium_keyiduser','pgsodium_keymaker','pgtle_admin'
        )
        ORDER BY r.rolname""")


@section("lints")
def get_lints(conn):
    """Chama a função de lint do Supabase se disponível."""
    try:
        rows = q(conn, "SELECT * FROM extensions.pg_safeupdate_lint() LIMIT 0")  # existe?
    except Exception:  # noqa: BLE001
        pass
    try:
        return q(conn, "SELECT * FROM supabase_functions.lint() ORDER BY name, level, detail LIMIT 500")
    except Exception:  # noqa: BLE001
        pass
    try:
        return q(conn, "SELECT * FROM extensions.lint() ORDER BY name, level, detail LIMIT 500")
    except Exception:  # noqa: BLE001
        pass
    try:
        # Supabase Cloud expõe como função sem schema explícito
        return q(conn, "SELECT * FROM lint() ORDER BY name, level, detail LIMIT 500")
    except Exception:  # noqa: BLE001
        pass
    return []


@section("stats", volatile=True)
def get_stats(conn):
    """Métricas voláteis: linhas, bytes, índices. Vai em stats.md, fora do snapshot estrutural."""
    tables = q(conn, f"""
        SELECT n.nspname AS schema, c.relname AS name,
               c.reltuples::bigint AS row_estimate,
               pg_total_relation_size(c.oid) AS total_bytes,
               pg_relation_size(c.oid) AS table_bytes,
               pg_indexes_size(c.oid) AS indexes_bytes,
               pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid) AS toast_bytes
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p') AND {excluded_sql()}
        ORDER BY total_bytes DESC""")
    return {"tables": tables}


@section("stat_statements", volatile=True)
def get_stat_statements(conn):
    if STAT_STATEMENTS_TOP <= 0 or not has_ext(conn, "pg_stat_statements"):
        return []
    return q(conn, f"""
        SELECT queryid, query, calls, total_exec_time, mean_exec_time, stddev_exec_time,
               rows, shared_blks_hit, shared_blks_read, blk_read_time, blk_write_time
        FROM pg_stat_statements
        WHERE query NOT ILIKE '%pg_stat_statements%'
        ORDER BY total_exec_time DESC
        LIMIT {STAT_STATEMENTS_TOP}""")


@section("auth_config")
def get_auth_config(conn):
    """Configuração do Auth do Supabase (auth.config se existir)."""
    if not has_table(conn, "auth", "config"):
        return {}
    rows = q(conn, "SELECT parameter, value FROM auth.config ORDER BY parameter")
    return {r["parameter"]: r["value"] for r in rows}


@section("auth_stats", volatile=True)
def get_auth_stats(conn):
    """Contagens de usuários por provedor (volátil)."""
    if not has_table(conn, "auth", "users"):
        return {}
    total = q(conn, "SELECT count(*) AS n FROM auth.users WHERE deleted_at IS NULL")[0]["n"]
    by_provider = q(conn, """
        SELECT provider, count(*) AS n
        FROM auth.identities
        GROUP BY provider ORDER BY n DESC""") if has_table(conn, "auth", "identities") else []
    mfa = q(conn, "SELECT count(*) AS n FROM auth.mfa_factors WHERE status = 'verified'")[0]["n"] if has_table(conn, "auth", "mfa_factors") else None
    return {"total_users": total, "by_provider": by_provider, "mfa_verified_factors": mfa}


# --------------------------------------------------------------------------- #
# Management API
# --------------------------------------------------------------------------- #

def mgmt_get(path: str) -> Any:
    if not PROJECT_REF or not ACCESS_TOKEN:
        return None
    url = f"{MGMT_API}/projects/{PROJECT_REF}{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except Exception as e:  # noqa: BLE001
        record_error(f"mgmt:{path}", e)
        return None


# --------------------------------------------------------------------------- #
# Code cross-reference
# --------------------------------------------------------------------------- #

def build_code_index() -> dict[str, list[str]]:
    """Mapeia nome de função/tabela -> arquivos que a mencionam."""
    if not REPO_ROOT:
        return {}
    idx: dict[str, list[str]] = {}
    count = 0
    for d in CODE_SCAN_DIRS:
        base = REPO_ROOT / d
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in CODE_SCAN_EXT or not f.is_file():
                continue
            if count >= CODE_SCAN_MAX_FILES:
                break
            count += 1
            try:
                text = f.read_text(encoding="utf-8", errors="ignore")
                # Extrai tokens que podem ser nomes de funções/tabelas
                for token in re.findall(r"\b([a-z_][a-z0-9_]{2,})\b", text):
                    idx.setdefault(token, [])
                    rel = str(f.relative_to(REPO_ROOT)) if REPO_ROOT else str(f)
                    if rel not in idx[token]:
                        idx[token].append(rel)
            except Exception:  # noqa: BLE001
                pass
    return idx


# --------------------------------------------------------------------------- #
# Markdown generators
# --------------------------------------------------------------------------- #

def md_index(data: dict, stats: dict, errors: list) -> str:
    tables = data.get("tables") or []
    funcs = data.get("functions") or []
    policies = data.get("policies") or []
    cron = data.get("cron") or []
    storage = data.get("storage") or []
    extensions = data.get("extensions") or []
    lints = data.get("lints") or []
    vault = data.get("vault") or []
    rls_issues = [t for t in (data.get("rls") or []) if not t.get("rls_enabled")]

    lines = [
        "# Snapshot Supabase — contexto para agentes de IA\n",
        os.environ.get("SUPABASE_SNAPSHOT_PUBLICACAO", "Gerado automaticamente a cada 10 min pelo workflow `contexto` (job `banco`). **Não edite manualmente.**") + "\n",
        "Frescor: `git log -1 --format=%cI -- docs/contexto/supabase`. Só há commit quando algo mudou; o histórico está em `CHANGELOG.md`.\n",
        "## Protocolo para agentes\n",
        "- Use `tables.md` para nomes de colunas, tipos, defaults e chaves primárias.\n",
        "- Use `functions.md` para saber se a função existe, que parâmetros aceita e qual role pode chamar.\n",
        "- Use `policies.md` antes de qualquer query com RLS: confira que a operação está coberta.\n",
        "- Use `stats.md` para tamanhos de tabela e contagens aproximadas.\n",
        "- Use `schema.sql` para o DDL completo do schema public.\n",
        "- Use `types.ts` para os tipos TypeScript gerados pelo Supabase CLI.\n",
        "- Use `cron.md` para jobs agendados (pg_cron).\n",
        "- Use `storage.md` para buckets e políticas de Storage.\n",
        "- Use `lints.md` para alertas de segurança e performance do Supabase Lint.\n",
        "\n## Resumo\n",
    ]

    srv = data.get("server") or {}
    lines += [
        f"- **PostgreSQL**: {srv.get('server_version', '?')}\n",
        f"- **Database**: `{srv.get('database', '?')}`\n",
        f"- **Tabelas**: {len(tables)}\n",
        f"- **Funções**: {len(funcs)}\n",
        f"- **Políticas RLS**: {len(policies)}\n",
        f"- **Jobs cron**: {len(cron)}\n",
        f"- **Buckets storage**: {len(storage)}\n",
        f"- **Extensões**: {len(extensions)}\n",
        f"- **Segredos Vault**: {len(vault)}\n",
    ]

    if lints:
        errors_count = sum(1 for l in lints if l.get("level") == "ERROR")
        warn_count = sum(1 for l in lints if l.get("level") == "WARN")
        lines.append(f"- **Lint**: {errors_count} error(s), {warn_count} warn(s) → ver `lints.md`\n")

    if rls_issues:
        lines.append(f"- ⚠️ **Tabelas sem RLS**: {len(rls_issues)} → ver `rls.md`\n")

    if errors:
        lines.append(f"\n### ⚠️ Erros na coleta ({len(errors)})\n")
        for e in errors:
            lines.append(f"- `{e['section']}`: {e['error']}\n")

    # Tabelas por schema
    lines.append("\n## Tabelas por schema\n")
    by_schema = group(tables, lambda t: t["schema"])
    for sch, tbls in sorted(by_schema.items()):
        lines.append(f"\n### `{sch}`\n")
        lines.append(md_table(["Tabela", "RLS", "Linhas ~", "Tamanho"],
            [[t["name"],
              "✅" if t.get("rls_enabled") else "❌",
              approx((stats.get("tables_by_name") or {}).get(f"{sch}.{t['name']}", {}).get("row_estimate")),
              human_bytes((stats.get("tables_by_name") or {}).get(f"{sch}.{t['name']}", {}).get("total_bytes"))]
             for t in tbls]))

    # Funções por schema
    lines.append("\n## Funções por schema\n")
    by_schema_fn = group(funcs, lambda f: f["schema"])
    for sch, fns in sorted(by_schema_fn.items()):
        lines.append(f"\n### `{sch}`\n")
        lines.append(md_table(["Função", "Tipo", "Linguagem", "Roles"],
            [[f["name"], f.get("kind", ""), f.get("language", ""), f.get("execute_api_roles", "")] for f in fns]))

    return "".join(lines)


def md_tables(tables, columns, constraints, indexes, grants, rls_data, code_idx) -> str:
    if not tables:
        return "# Tabelas\n\n_nenhuma_\n"

    col_map = group(columns or [], lambda c: (c["schema"], c["table"]))
    con_map = group(constraints or [], lambda c: (c["schema"], c["table"]))
    idx_map = group(indexes or [], lambda i: (i["schema"], i["table"]))
    grant_map = group(grants or [], lambda g: (g["schema"], g["table"]))
    rls_map = {(r["schema"], r["name"]): r for r in (rls_data or [])}

    lines = ["# Tabelas\n"]
    for t in tables:
        sch, name = t["schema"], t["name"]
        anchor = uslug(f"{sch}.{name}", "table")
        lines.append(f"\n## `{sch}.{name}` {{#{anchor}}}\n")
        if t.get("comment"):
            lines.append(f"{t['comment']}\n\n")

        rls = rls_map.get((sch, name), {})
        flags = []
        if t.get("rls_enabled"):
            flags.append("RLS ativado")
        else:
            flags.append("⚠️ RLS desativado")
        if t.get("rls_forced"):
            flags.append("forçado")
        if t.get("from_extension"):
            flags.append("de extensão")
        if t.get("is_partition"):
            flags.append(f"partição de `{t.get('parent', '?')}`")
        if t.get("partition_key"):
            flags.append(f"particionada por `{t['partition_key']}`")
        lines.append(f"**{' · '.join(flags)}**\n\n")

        # Colunas
        cols = col_map.get((sch, name), [])
        if cols:
            lines.append(md_table(
                ["#", "Nome", "Tipo", "Nullable", "Default", "Identidade", "Comentário"],
                [[c["position"], code(c["name"]), code(c["type"]),
                  "sim" if c.get("nullable") else "não",
                  code(c.get("default")), c.get("identity") or "", c.get("comment") or ""]
                 for c in cols]))

        # Constraints
        cons = con_map.get((sch, name), [])
        if cons:
            lines.append("\n**Constraints**\n\n")
            lines.append(md_table(["Nome", "Tipo", "Definição"],
                [[c["name"], c["type"], code(c.get("definition"))] for c in cons]))

        # Índices
        idxs = idx_map.get((sch, name), [])
        non_pk = [i for i in idxs if not i.get("is_primary")]
        if non_pk:
            lines.append("\n**Índices**\n\n")
            lines.append(md_table(["Nome", "Único", "Válido", "Método", "Colunas", "Predicado"],
                [[i["name"], "sim" if i.get("is_unique") else "", "sim" if i.get("is_valid") else "não",
                  i.get("method", ""), ", ".join(i.get("columns") or []), i.get("predicate") or ""]
                 for i in non_pk]))

        # Grants
        grs = grant_map.get((sch, name), [])
        if grs:
            lines.append("\n**Grants**\n\n")
            lines.append(md_table(["Grantee", "Privilégios", "Grantable"],
                [[g["grantee"], g["privileges"], "sim" if g.get("is_grantable") == "YES" else ""] for g in grs]))

        # Uso no código
        if code_idx:
            refs = code_idx.get(name, [])[:8]
            if refs:
                lines.append(f"\n**Referências no código** ({len(refs)}+): " + ", ".join(f"`{r}`" for r in refs) + "\n")

    return "".join(lines)


def md_functions(funcs, code_idx) -> str:
    if not funcs:
        return "# Funções\n\n_nenhuma_\n"
    lines = ["# Funções\n"]
    for f in funcs:
        anchor = uslug(f"{f['schema']}.{f['name']}.{f.get('args','')}", "fn")
        lines.append(f"\n## `{f['schema']}.{f['name']}` {{#{anchor}}}\n")
        if f.get("comment"):
            lines.append(f"{f['comment']}\n\n")
        meta = []
        if f.get("kind"):
            meta.append(f"**Tipo**: {f['kind']}")
        if f.get("language"):
            meta.append(f"**Linguagem**: {f['language']}")
        if f.get("volatility"):
            meta.append(f"**Volatilidade**: {f['volatility']}")
        if f.get("security_definer"):
            meta.append("**SECURITY DEFINER**")
        if f.get("execute_api_roles"):
            meta.append(f"**Roles**: {f['execute_api_roles']}")
        if f.get("execute_public"):
            meta.append("**PUBLIC pode executar**")
        if meta:
            lines.append(" · ".join(meta) + "\n\n")
        if f.get("args"):
            lines.append(f"**Assinatura**: `{f['name']}({f['args']}) → {f.get('returns','?')}`\n\n")
        if f.get("definition"):
            lines.append(f"```sql\n{f['definition']}\n```\n")
        if code_idx:
            refs = code_idx.get(f["name"], [])[:5]
            if refs:
                lines.append(f"**Refs no código**: " + ", ".join(f"`{r}`" for r in refs) + "\n")
    return "".join(lines)


def md_policies(policies) -> str:
    if not policies:
        return "# Políticas RLS\n\n_nenhuma_\n"
    lines = ["# Políticas RLS\n"]
    by_table = group(policies, lambda p: (p["schema"], p["table"]))
    for (sch, tbl), pols in sorted(by_table.items()):
        lines.append(f"\n## `{sch}.{tbl}`\n\n")
        lines.append(md_table(
            ["Política", "Permissiva", "Roles", "Operação", "USING", "WITH CHECK"],
            [[p["name"], "sim" if p.get("permissive") == "PERMISSIVE" else "restritiva",
              ", ".join(p.get("roles") or []), p.get("cmd", ""),
              code(p.get("using")), code(p.get("with_check"))]
             for p in pols]))
    return "".join(lines)


def md_triggers(triggers) -> str:
    if not triggers:
        return "# Triggers\n\n_nenhum_\n"
    lines = ["# Triggers\n"]
    by_table = group(triggers, lambda t: (t["schema"], t["table"]))
    for (sch, tbl), trigs in sorted(by_table.items()):
        lines.append(f"\n## `{sch}.{tbl}`\n\n")
        lines.append(md_table(
            ["Nome", "Status", "Timing", "Eventos", "Nível", "Função"],
            [[t["name"], t.get("status", ""), t.get("timing", ""), t.get("events", ""),
              t.get("level", ""), t.get("function", "")] for t in trigs]))
    return "".join(lines)


def md_types(types_data) -> str:
    lines = ["# Tipos customizados\n"]
    enums = types_data.get("enums") or []
    if enums:
        lines.append("\n## Enums\n\n")
        lines.append(md_table(["Schema", "Nome", "Valores"],
            [[e["schema"], e["name"], ", ".join(e.get("values") or [])] for e in enums]))
    domains = types_data.get("domains") or []
    if domains:
        lines.append("\n## Domínios\n\n")
        lines.append(md_table(["Schema", "Nome", "Tipo base", "Not Null", "Default"],
            [[d["schema"], d["name"], d.get("base_type", ""), "sim" if d.get("not_null") else "", d.get("default") or ""]
             for d in domains]))
    composites = types_data.get("composites") or []
    if composites:
        lines.append("\n## Compostos\n\n")
        lines.append(md_table(["Schema", "Nome", "Campos"],
            [[c["schema"], c["name"], ", ".join(c.get("fields") or [])] for c in composites]))
    return "".join(lines)


def md_cron(cron_jobs, cron_runs) -> str:
    if not cron_jobs:
        return "# Jobs pg_cron\n\n_pg_cron não instalado ou sem jobs_\n"
    lines = ["# Jobs pg_cron\n\n"]
    lines.append(md_table(["ID", "Nome", "Schedule", "Ativo", "Execuções", "Comando"],
        [[j["jobid"], j["jobname"], j["schedule"], "sim" if j.get("active") else "não",
          j.get("runcount", 0), code(j["command"][:120])] for j in cron_jobs]))
    if cron_runs:
        lines.append("\n## Últimas execuções\n\n")
        lines.append(md_table(
            ["Job", "Status", "Duração (s)", "Início", "Mensagem"],
            [[r["jobid"], r["status"], r.get("duration_s", ""),
              str(r.get("start_time", ""))[:19], (r.get("return_message") or "")[:80]]
             for r in cron_runs]))
    return "".join(lines)


def md_storage(storage, policies) -> str:
    lines = ["# Storage\n"]
    if not storage:
        lines.append("\n_nenhum bucket_\n")
    else:
        lines.append("\n## Buckets\n\n")
        lines.append(md_table(
            ["ID", "Nome", "Público", "Objetos", "Limite (bytes)", "MIME types"],
            [[b["id"], b["name"], "sim" if b.get("public") else "não",
              approx(b.get("object_count")), b.get("file_size_limit") or "",
              ", ".join(b.get("allowed_mime_types") or [])] for b in storage]))
    stor_pols = [p for p in (policies or []) if p.get("schema") == "storage"]
    if stor_pols:
        lines.append("\n## Políticas de Storage\n\n")
        lines.append(md_policies(stor_pols).replace("# Políticas RLS\n", ""))
    return "".join(lines)


def md_extensions(extensions) -> str:
    if not extensions:
        return "# Extensões\n\n_nenhuma_\n"
    lines = ["# Extensões\n\n"]
    lines.append(md_table(["Nome", "Versão", "Schema", "Descrição"],
        [[e["name"], e["version"], e["schema"], e.get("description") or ""] for e in extensions]))
    return "".join(lines)


def md_roles(roles) -> str:
    if not roles:
        return "# Roles\n\n_nenhuma_\n"
    lines = ["# Roles\n\n"]
    lines.append(md_table(
        ["Nome", "Login", "Superuser", "Bypass RLS", "Membro de", "Membros"],
        [[r["name"], "sim" if r.get("can_login") else "", "sim" if r.get("superuser") else "",
          "sim" if r.get("bypassrls") else "",
          ", ".join(r.get("member_of") or []), ", ".join(r.get("members") or [])]
         for r in roles]))
    return "".join(lines)


def md_lints(lints) -> str:
    if not lints:
        return "# Lint Supabase\n\n_sem alertas_\n"
    lines = ["# Lint Supabase\n\n"]
    by_level = group(lints, lambda l: l.get("level", "INFO"))
    for level in ("ERROR", "WARN", "INFO"):
        items = by_level.get(level, [])
        if not items:
            continue
        lines.append(f"\n## {level} ({len(items)})\n\n")
        lines.append(md_table(["Nome", "Descrição", "Detalhe"],
            [[l.get("name", ""), l.get("description", ""), l.get("detail", "")] for l in items]))
    return "".join(lines)


def md_rls_audit(rls_data, tables) -> str:
    lines = ["# Auditoria RLS\n"]
    no_rls = [r for r in (rls_data or []) if not r.get("rls_enabled")]
    if no_rls:
        lines.append(f"\n## ⚠️ Tabelas sem RLS ({len(no_rls)})\n\n")
        lines.append(md_table(
            ["Schema", "Tabela", "Roles com SELECT"],
            [[r["schema"], r["name"], r.get("select_api_roles") or ""] for r in no_rls]))
    else:
        lines.append("\n✅ Todas as tabelas têm RLS habilitado.\n")
    with_rls = [r for r in (rls_data or []) if r.get("rls_enabled") and not r.get("has_policies")]
    if with_rls:
        lines.append(f"\n## ⚠️ RLS habilitado mas sem políticas ({len(with_rls)})\n\n")
        lines.append(md_table(["Schema", "Tabela"],
            [[r["schema"], r["name"]] for r in with_rls]))
    return "".join(lines)


def md_vault(vault) -> str:
    if not vault:
        return "# Vault (segredos)\n\n_nenhum segredo ou vault não instalado_\n"
    lines = ["# Vault (segredos)\n\n"]
    lines.append(md_table(["ID", "Nome", "Descrição", "Criado em"],
        [[v["id"], v["name"], v.get("description") or "", str(v.get("created_at", ""))[:19]]
         for v in vault]))
    return "".join(lines)


def md_stats(stats_data) -> str:
    tables = (stats_data or {}).get("tables") or []
    if not tables:
        return "# Stats (volátil)\n\n_sem dados_\n"
    lines = ["# Stats (volátil)\n\n",
             "_Métricas de tamanho e contagem. Mudam com cada INSERT/DELETE — não são usadas para detectar mudanças estruturais._\n\n"]
    lines.append(md_table(
        ["Schema.Tabela", "Linhas ~", "Total", "Tabela", "Índices", "TOAST"],
        [[f"{t['schema']}.{t['name']}", approx(t.get("row_estimate")),
          human_bytes(t.get("total_bytes")), human_bytes(t.get("table_bytes")),
          human_bytes(t.get("indexes_bytes")), human_bytes(t.get("toast_bytes"))]
         for t in tables]))
    return "".join(lines)


def md_stat_statements(rows) -> str:
    if not rows:
        return "# Consultas mais custosas (pg_stat_statements)\n\n_sem dados_\n"
    lines = ["# Consultas mais custosas (pg_stat_statements)\n\n"]
    lines.append(md_table(
        ["Query (truncada)", "Calls", "Total (ms)", "Mean (ms)", "Rows"],
        [[(r.get("query") or "")[:120].replace("\n", " "), r.get("calls", ""),
          f"{float(r.get('total_exec_time', 0)):.1f}", f"{float(r.get('mean_exec_time', 0)):.2f}",
          r.get("rows", "")] for r in rows]))
    return "".join(lines)


def md_migrations(migrations) -> str:
    if not migrations:
        return "# Migrations (ledger)\n\n_supabase_migrations.schema_migrations não encontrado_\n"
    lines = [f"# Migrations (ledger)\n\n_{len(migrations)} migrations registradas_\n\n"]
    lines.append(md_table(["Versão", "Nome", "Statements"],
        [[m["version"], m.get("name") or "", len(m.get("statements") or [])] for m in migrations]))
    return "".join(lines)


# --------------------------------------------------------------------------- #
# Changelog diff
# --------------------------------------------------------------------------- #

def _stable_key(section: str, row: dict) -> str:
    for k in ("name", "schema", "id", "version", "jobname", "parameter"):
        if k in row:
            return f"{row.get('schema','')}.{row[k]}" if k == "name" and "schema" in row else str(row[k])
    return sha(row)


def semantic_diff(old_data: dict, new_data: dict) -> list[str]:
    changes: list[str] = []
    for key in sorted(set(old_data) | set(new_data)):
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        if old_val == new_val:
            continue
        label = key.replace("_", " ").title()
        if old_val is None:
            changes.append(f"- **{label}**: seção adicionada")
            continue
        if new_val is None:
            changes.append(f"- **{label}**: seção removida")
            continue
        # Listas de dicts
        if isinstance(old_val, list) and isinstance(new_val, list):
            old_keys = {_stable_key(key, r): r for r in old_val}
            new_keys = {_stable_key(key, r): r for r in new_val}
            added = set(new_keys) - set(old_keys)
            removed = set(old_keys) - set(new_keys)
            changed = {k for k in set(old_keys) & set(new_keys) if old_keys[k] != new_keys[k]}
            if added:
                changes.append(f"- **{label}**: {len(added)} adicionado(s): " + ", ".join(sorted(added)[:10]))
            if removed:
                changes.append(f"- **{label}**: {len(removed)} removido(s): " + ", ".join(sorted(removed)[:10]))
            if changed:
                changes.append(f"- **{label}**: {len(changed)} alterado(s): " + ", ".join(sorted(changed)[:10]))
        # Dicts simples (server config, project_config)
        elif isinstance(old_val, dict) and isinstance(new_val, dict):
            for k in sorted(set(old_val) | set(new_val)):
                ov, nv = old_val.get(k), new_val.get(k)
                if ov != nv:
                    changes.append(f"- **{label} › {k}**: `{ov}` → `{nv}`")
        else:
            changes.append(f"- **{label}**: alterado")
    return changes


def update_changelog(out_dir: pathlib.Path, changes: list[str]) -> None:
    if not changes:
        return
    cl_path = out_dir / "CHANGELOG.md"
    old = cl_path.read_text(encoding="utf-8") if cl_path.exists() else ""
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    entry = f"## {stamp}\n\n" + "\n".join(changes) + "\n\n"
    write(cl_path, entry + old)


# --------------------------------------------------------------------------- #
# Deterministic snapshot (strips volatile fields before comparison)
# --------------------------------------------------------------------------- #

VOLATILE_SECTIONS = {"stats", "stat_statements", "auth_stats", "cron_runs"}


def stable_data(data: dict) -> dict:
    return {k: v for k, v in data.items() if k not in VOLATILE_SECTIONS}


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main() -> None:
    if not DB_URL:
        print("SUPABASE_DB_URL não definida", file=sys.stderr)
        sys.exit(1)

    log(f"Conectando a {DB_URL[:40]}...")

    connect_opts = {
        "options": "-c default_transaction_read_only=on -c statement_timeout=60000 -c lock_timeout=5000",
        "row_factory": dict_row,
        "autocommit": True,
    }

    with psycopg.connect(DB_URL, **connect_opts) as conn:
        log("Coletando dados...")

        data: dict[str, Any] = {}
        volatile: dict[str, Any] = {}

        sections_structural = [
            get_server, get_schemas, get_tables, get_columns, get_constraints,
            get_indexes, get_views, get_functions, get_triggers, get_policies,
            get_types, get_sequences, get_grants, get_rls,
            get_storage, get_vault, get_cron, get_migrations,
            get_project_config, get_extensions, get_roles, get_lints,
            get_auth_config,
        ]
        sections_volatile = [get_stats, get_stat_statements, get_cron_runs, get_auth_stats]

        for fn in sections_structural:
            result = fn(conn)
            if result is not None:
                data[fn.__name__.replace("get_", "")] = result

        for fn in sections_volatile:
            result = fn(conn)
            if result is not None:
                volatile[fn.__name__.replace("get_", "")] = result

    # Management API (fora da conexão DB)
    project_info = mgmt_get("/") or {}

    # Code cross-reference
    code_idx = build_code_index()
    if code_idx:
        log(f"Índice de código: {len(code_idx)} tokens")

    # Preparar stats para o índice
    stats_tables = {f"{t['schema']}.{t['name']}": t for t in (volatile.get("stats") or {}).get("tables") or []}
    stats_ctx = {"tables_by_name": stats_tables}

    # Carregar snapshot anterior (para changelog e carry-on)
    snap_path = OUT / "snapshot.json"
    old_stable: dict = {}
    if snap_path.exists():
        try:
            old_snap = json.loads(snap_path.read_text(encoding="utf-8"))
            old_stable = stable_data(old_snap)
        except Exception:  # noqa: BLE001
            pass

    new_stable = stable_data(data)

    # Carry-on: seção com erro usa dado anterior
    for key, val in old_stable.items():
        if key not in data and key not in ERRORS:
            data[key] = val
            CARRIED.append(key)
    if CARRIED:
        log(f"Reaproveitadas do snapshot anterior: {', '.join(CARRIED)}")

    # Detectar mudanças (apenas estruturais)
    changes = semantic_diff(old_stable, new_stable)
    changed = bool(changes)
    log(f"Mudanças estruturais: {len(changes)}")

    # Gerar outputs
    OUT.mkdir(parents=True, exist_ok=True)

    write(OUT / "index.md", md_index(data, stats_ctx, ERRORS))
    write(OUT / "tables.md", md_tables(
        data.get("tables"), data.get("columns"), data.get("constraints"),
        data.get("indexes"), data.get("grants"), data.get("rls"), code_idx))
    write(OUT / "functions.md", md_functions(data.get("functions"), code_idx))
    write(OUT / "policies.md", md_policies(data.get("policies")))
    write(OUT / "triggers.md", md_triggers(data.get("triggers")))
    write(OUT / "types.md", md_types(data.get("types") or {}))
    write(OUT / "cron.md", md_cron(data.get("cron"), volatile.get("cron_runs")))
    write(OUT / "cron-runs.md", md_cron(data.get("cron"), volatile.get("cron_runs")))
    write(OUT / "storage.md", md_storage(data.get("storage"), data.get("policies")))
    write(OUT / "extensions.md", md_extensions(data.get("extensions")))
    write(OUT / "roles.md", md_roles(data.get("roles")))
    write(OUT / "lints.md", md_lints(data.get("lints")))
    write(OUT / "rls.md", md_rls_audit(data.get("rls"), data.get("tables")))
    write(OUT / "vault.md", md_vault(data.get("vault")))
    write(OUT / "migrations.md", md_migrations(data.get("migrations")))
    write(OUT / "stats.md", md_stats(volatile.get("stats")))
    write(OUT / "stat-statements.md", md_stat_statements(volatile.get("stat_statements")))

    # Snapshot JSON (estrutural + volátil separados)
    write(snap_path, dumps({**data, **volatile}))
    write(OUT / "snapshot-stable.json", dumps(new_stable))

    # pg_dump e types.ts opcionais
    if PGDUMP:
        try:
            schema_sql = subprocess.check_output(
                ["pg_dump", "--schema-only", "--no-owner", "--no-privileges",
                 "--no-comments", "--no-publications", "--no-subscriptions"]
                + [f"--schema={s}" for s in PGDUMP_SCHEMAS]
                + [DB_URL],
                stderr=subprocess.DEVNULL, timeout=120)
            write(OUT / "schema.sql", schema_sql.decode("utf-8", errors="replace"))
            log("pg_dump: ok")
        except Exception as e:  # noqa: BLE001
            record_error("pg_dump", e)

    if GEN_TYPES and PROJECT_REF:
        try:
            ts = subprocess.check_output(
                ["npx", "--yes", "supabase", "gen", "types", "typescript",
                 "--project-id", PROJECT_REF],
                stderr=subprocess.DEVNULL, timeout=120)
            write(OUT / "types.ts", ts.decode("utf-8", errors="replace"))
            log("types.ts: ok")
        except Exception as e:  # noqa: BLE001
            record_error("gen_types", e)

    # Changelog
    if changed:
        update_changelog(OUT, changes)
        log(f"CHANGELOG atualizado: {len(changes)} mudanças")

    # Resumo final
    all_errors = ERRORS
    log(f"Concluído. Arquivos em {OUT}. Erros: {len(all_errors)}. Mudanças: {len(changes)}.")
    if all_errors:
        for e in all_errors:
            log(f"  ERRO: {e['section']}: {e['error']}")
    sys.exit(0 if not any(e["section"] in ("server", "tables", "functions") for e in all_errors) else 1)


if __name__ == "__main__":
    main()
