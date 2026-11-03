#!/usr/bin/env python3
"""
Supabase -> GitHub snapshot (v2).

Introspecta um projeto Supabase (PostgreSQL 15+) e escreve em
docs/contexto/supabase/ (ou outro OUT configurável) os arquivos Markdown
e JSON usados por agentes de IA.

Variáveis de ambiente obrigatórias:
  SUPABASE_DB_URL            URL postgresql:// direto (pgBouncer/pooler ok)

Variáveis opcionais:
  SUPABASE_PROJECT_REF       ref do projeto (ex.: tnnnlkbymytvtqngbbqh)
  SUPABASE_REST_URL          base da REST API (ex.: https://<ref>.supabase.co)
  SUPABASE_SERVICE_ROLE_KEY  service-role JWT (habilita consultas auth.*)
  OUT                        pasta de saída (default "docs/contexto/supabase")
  CHANGED_PATHS              paths CSV separados por vírgula (ex.: supabase/migrations,scripts,...) pastas varridas
  SUPABASE_SNAPSHOT_PUBLICACAO  (default "Gerado automaticamente...") rodapé do índice
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Any

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Config / helpers
# ---------------------------------------------------------------------------

OUT = Path(os.environ.get("OUT", "docs/contexto/supabase"))
DB_URL = os.environ.get("SUPABASE_DB_URL", "")
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "")
REST_URL = os.environ.get("SUPABASE_REST_URL", "")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CHANGED_PATHS_RAW = os.environ.get("CHANGED_PATHS", "")

CHANGED_PATHS: list[str] = (
    [p.strip() for p in CHANGED_PATHS_RAW.split(",") if p.strip()]
    if CHANGED_PATHS_RAW
    else []
)


def _conn():
    if psycopg2 is None:
        raise RuntimeError("psycopg2 not installed")
    if not DB_URL:
        raise RuntimeError("SUPABASE_DB_URL not set")
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def _q(sql: str, params=None) -> list[dict]:
    with _conn() as con:
        with con.cursor() as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]


def _scalar(sql: str, params=None):
    rows = _q(sql, params)
    if not rows:
        return None
    return next(iter(rows[0].values()))


def _write(path: Path, content: str) -> bool:
    """Write *content* to *path*; return True if file changed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == content:
        return False
    path.write_text(content, encoding="utf-8")
    return True


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def _git_hash(path: Path) -> str:
    """Return short commit hash of latest change to *path*, or ''."""
    try:
        r = subprocess.run(
            ["git", "log", "-1", "--format=%H", "--", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )
        return r.stdout.strip()[:12]
    except FileNotFoundError:
        return ""


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------


def tables() -> list[dict]:
    return _q(
        """
        SELECT
            t.table_schema AS schema,
            t.table_name   AS name,
            obj_description(
                (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass,
                'pg_class'
            ) AS description,
            pg_total_relation_size(
                (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass
            ) AS total_bytes,
            pg_relation_size(
                (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass
            ) AS data_bytes
        FROM information_schema.tables t
        WHERE t.table_schema NOT IN ('information_schema','pg_catalog','pg_toast')
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_schema, t.table_name
        """
    )


def columns() -> list[dict]:
    return _q(
        """
        SELECT
            c.table_schema  AS schema,
            c.table_name    AS table,
            c.column_name   AS name,
            c.data_type,
            c.udt_name,
            c.is_nullable,
            c.column_default,
            c.ordinal_position
        FROM information_schema.columns c
        WHERE c.table_schema NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        """
    )


def primary_keys() -> list[dict]:
    return _q(
        """
        SELECT
            kcu.table_schema AS schema,
            kcu.table_name   AS table,
            kcu.column_name  AS column,
            kcu.ordinal_position
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY kcu.table_schema, kcu.table_name, kcu.ordinal_position
        """
    )


def foreign_keys() -> list[dict]:
    return _q(
        """
        SELECT
            tc.table_schema          AS schema,
            tc.table_name            AS table,
            kcu.column_name          AS column,
            ccu.table_schema         AS foreign_schema,
            ccu.table_name           AS foreign_table,
            ccu.column_name          AS foreign_column,
            rc.update_rule,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY tc.table_schema, tc.table_name, kcu.column_name
        """
    )


def indexes() -> list[dict]:
    return _q(
        """
        SELECT
            schemaname  AS schema,
            tablename   AS table,
            indexname   AS name,
            indexdef    AS definition,
            (SELECT indisunique FROM pg_index WHERE indexrelid = (schemaname||'.'||indexname)::regclass)
                AS is_unique
        FROM pg_indexes
        WHERE schemaname NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY schemaname, tablename, indexname
        """
    )


def rls_policies() -> list[dict]:
    return _q(
        """
        SELECT
            schemaname  AS schema,
            tablename   AS table,
            policyname  AS name,
            permissive,
            roles,
            cmd,
            qual,
            with_check
        FROM pg_policies
        WHERE schemaname NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY schemaname, tablename, policyname
        """
    )


def functions_list() -> list[dict]:
    return _q(
        """
        SELECT
            n.nspname                       AS schema,
            p.proname                       AS name,
            pg_get_function_identity_arguments(p.oid) AS args,
            t.typname                       AS return_type,
            p.prosecdef                     AS security_definer,
            p.provolatile                   AS volatility,
            obj_description(p.oid,'pg_proc') AS description,
            pg_get_functiondef(p.oid)       AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_type      t ON t.oid = p.prorettype
        WHERE n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
          AND p.prokind IN ('f','p')
        ORDER BY n.nspname, p.proname
        """
    )


def triggers_list() -> list[dict]:
    return _q(
        """
        SELECT
            trigger_schema  AS schema,
            trigger_name    AS name,
            event_object_table AS table,
            event_manipulation AS event,
            action_timing,
            action_statement
        FROM information_schema.triggers
        WHERE trigger_schema NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY trigger_schema, event_object_table, trigger_name
        """
    )


def sequences_list() -> list[dict]:
    return _q(
        """
        SELECT
            sequence_schema AS schema,
            sequence_name   AS name,
            data_type,
            start_value,
            minimum_value,
            maximum_value,
            increment
        FROM information_schema.sequences
        WHERE sequence_schema NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY sequence_schema, sequence_name
        """
    )


def views_list() -> list[dict]:
    return _q(
        """
        SELECT
            table_schema AS schema,
            table_name   AS name,
            view_definition AS definition
        FROM information_schema.views
        WHERE table_schema NOT IN ('information_schema','pg_catalog','pg_toast')
        ORDER BY table_schema, table_name
        """
    )


def extensions_list() -> list[dict]:
    return _q(
        """
        SELECT
            extname     AS name,
            extversion  AS version,
            nspname     AS schema
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        ORDER BY extname
        """
    )


def enums_list() -> list[dict]:
    return _q(
        """
        SELECT
            n.nspname   AS schema,
            t.typname   AS name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname NOT IN ('information_schema','pg_catalog','pg_toast')
        GROUP BY n.nspname, t.typname
        ORDER BY n.nspname, t.typname
        """
    )


def cron_jobs() -> list[dict]:
    try:
        return _q(
            """
            SELECT
                jobid,
                schedule,
                command,
                nodename,
                nodeport,
                database,
                username,
                active,
                jobname
            FROM cron.job
            ORDER BY jobname
            """
        )
    except Exception:
        return []


def cron_job_run_details(limit: int = 20) -> list[dict]:
    try:
        return _q(
            """
            SELECT
                jobid,
                runid,
                job_pid,
                database,
                username,
                command,
                status,
                return_message,
                start_time,
                end_time
            FROM cron.job_run_details
            ORDER BY start_time DESC
            LIMIT %s
            """,
            (limit,),
        )
    except Exception:
        return []


def auth_metrics() -> dict:
    """Return auth stats if service_role is available."""
    if not SERVICE_ROLE_KEY:
        return {}
    try:
        total_users = _scalar("SELECT count(*) FROM auth.users")
        confirmed = _scalar(
            "SELECT count(*) FROM auth.users WHERE email_confirmed_at IS NOT NULL"
        )
        active_30d = _scalar(
            "SELECT count(*) FROM auth.users WHERE last_sign_in_at > now() - interval '30 days'"
        )
        mfa_enabled = _scalar(
            "SELECT count(DISTINCT user_id) FROM auth.mfa_factors WHERE status = 'verified'"
        )
        return {
            "total_users": int(total_users or 0),
            "confirmed_users": int(confirmed or 0),
            "active_30d": int(active_30d or 0),
            "mfa_enabled": int(mfa_enabled or 0),
        }
    except Exception as exc:
        return {"error": str(exc)}


def storage_buckets() -> list[dict]:
    try:
        return _q(
            """
            SELECT
                id,
                name,
                public,
                file_size_limit,
                allowed_mime_types,
                created_at,
                updated_at
            FROM storage.buckets
            ORDER BY name
            """
        )
    except Exception:
        return []


def migration_ledger() -> list[dict]:
    try:
        return _q(
            """
            SELECT
                version,
                name,
                executed_at
            FROM supabase_migrations.schema_migrations
            ORDER BY version DESC
            LIMIT 50
            """
        )
    except Exception:
        return []


def pg_settings_snapshot() -> list[dict]:
    return _q(
        """
        SELECT name, setting, unit, category, short_desc
        FROM pg_settings
        WHERE name IN (
            'server_version',
            'max_connections',
            'shared_buffers',
            'effective_cache_size',
            'work_mem',
            'maintenance_work_mem',
            'wal_level',
            'max_wal_size',
            'checkpoint_completion_target',
            'default_statistics_target',
            'random_page_cost',
            'effective_io_concurrency',
            'max_worker_processes',
            'max_parallel_workers',
            'max_parallel_workers_per_gather',
            'jit',
            'statement_timeout',
            'lock_timeout',
            'idle_in_transaction_session_timeout',
            'log_min_duration_statement',
            'track_activities',
            'track_counts',
            'track_io_timing',
            'autovacuum',
            'autovacuum_max_workers',
            'autovacuum_naptime',
            'ssl',
            'row_security',
            'timezone'
        )
        ORDER BY category, name
        """
    )


# ---------------------------------------------------------------------------
# Markdown generators
# ---------------------------------------------------------------------------


def _bytes_human(n: int | None) -> str:
    if n is None:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024  # type: ignore[assignment]
    return f"{n:.1f} TB"


def md_tables(rows: list[dict], cols_map: dict, pks_map: dict, fks_map: dict) -> str:
    lines = ["# Tabelas\n"]
    for r in rows:
        key = (r["schema"], r["name"])
        lines.append(f"\n## `{r['schema']}.{r['name']}`\n")
        if r.get("description"):
            lines.append(f"{r['description']}\n")
        lines.append(
            f"- Tamanho total: {_bytes_human(r.get('total_bytes'))}"
            f" | dados: {_bytes_human(r.get('data_bytes'))}\n"
        )
        # columns
        tbl_cols = cols_map.get(key, [])
        if tbl_cols:
            lines.append("\n| Coluna | Tipo | Nullable | Default |\n")
            lines.append("|--------|------|----------|---------|\n")
            for c in tbl_cols:
                nullable = "✓" if c["is_nullable"] == "YES" else "✗"
                default = c.get("column_default") or ""
                typ = c.get("udt_name") or c.get("data_type") or ""
                lines.append(
                    f"| `{c['name']}` | `{typ}` | {nullable} | `{default}` |\n"
                )
        # PKs
        tbl_pks = pks_map.get(key, [])
        if tbl_pks:
            pk_cols = ", ".join(f"`{p['column']}`" for p in tbl_pks)
            lines.append(f"\nChave primária: {pk_cols}\n")
        # FKs
        tbl_fks = fks_map.get(key, [])
        if tbl_fks:
            lines.append("\nChaves estrangeiras:\n")
            for fk in tbl_fks:
                lines.append(
                    f"- `{fk['column']}` → "
                    f"`{fk['foreign_schema']}.{fk['foreign_table']}.{fk['foreign_column']}`"
                    f" (ON DELETE {fk['delete_rule']})\n"
                )
    return "".join(lines)


def md_rls(rows: list[dict]) -> str:
    lines = ["# Políticas RLS\n"]
    cur_table = None
    for r in rows:
        tbl = f"{r['schema']}.{r['table']}"
        if tbl != cur_table:
            lines.append(f"\n## `{tbl}`\n")
            cur_table = tbl
        perm = "PERMISSIVE" if r.get("permissive") in ("PERMISSIVE", True) else "RESTRICTIVE"
        roles = ", ".join(r.get("roles") or []) or "public"
        lines.append(f"\n### `{r['name']}` ({perm})\n")
        lines.append(f"- Comando: `{r['cmd']}`\n")
        lines.append(f"- Roles: {roles}\n")
        if r.get("qual"):
            lines.append(f"- USING: `{r['qual']}`\n")
        if r.get("with_check"):
            lines.append(f"- WITH CHECK: `{r['with_check']}`\n")
    return "".join(lines)


def md_functions(rows: list[dict]) -> str:
    lines = ["# Funções\n"]
    for r in rows:
        sec = " ⚠ SECURITY DEFINER" if r.get("security_definer") else ""
        lines.append(f"\n## `{r['schema']}.{r['name']}({r['args']})`{sec}\n")
        if r.get("description"):
            lines.append(f"{r['description']}\n")
        lines.append(f"- Retorno: `{r['return_type']}`\n")
        lines.append(f"- Volatilidade: `{r['volatility']}`\n")
        defn = r.get("definition") or ""
        if defn:
            lines.append("\n```sql\n")
            lines.append(defn)
            lines.append("\n```\n")
    return "".join(lines)


def md_triggers(rows: list[dict]) -> str:
    lines = ["# Triggers\n"]
    for r in rows:
        lines.append(
            f"\n## `{r['schema']}.{r['name']}` on `{r['table']}`\n"
        )
        lines.append(f"- Evento: {r['action_timing']} {r['event']}\n")
        lines.append(f"- Ação: `{r['action_statement']}`\n")
    return "".join(lines)


def md_indexes(rows: list[dict]) -> str:
    lines = ["# Índices\n"]
    cur_table = None
    for r in rows:
        tbl = f"{r['schema']}.{r['table']}"
        if tbl != cur_table:
            lines.append(f"\n## `{tbl}`\n")
            cur_table = tbl
        uniq = " (UNIQUE)" if r.get("is_unique") else ""
        lines.append(f"\n### `{r['name']}`{uniq}\n")
        lines.append(f"```sql\n{r['definition']}\n```\n")
    return "".join(lines)


def md_extensions(rows: list[dict]) -> str:
    lines = ["# Extensões instaladas\n\n"]
    lines.append("| Extensão | Versão | Schema |\n")
    lines.append("|----------|--------|--------|\n")
    for r in rows:
        lines.append(f"| `{r['name']}` | {r['version']} | `{r['schema']}` |\n")
    return "".join(lines)


def md_enums(rows: list[dict]) -> str:
    lines = ["# Enums\n"]
    for r in rows:
        vals = ", ".join(f"`{v}`" for v in (r.get("values") or []))
        lines.append(f"\n## `{r['schema']}.{r['name']}`\n")
        lines.append(f"Valores: {vals}\n")
    return "".join(lines)


def md_cron(jobs: list[dict], runs: list[dict]) -> str:
    lines = ["# Cron Jobs (pg_cron)\n"]
    if not jobs:
        lines.append("\n_Nenhum job encontrado ou extensão não instalada._\n")
        return "".join(lines)
    lines.append("\n## Jobs ativos\n\n")
    lines.append("| ID | Nome | Schedule | Ativo |\n")
    lines.append("|----|------|----------|-------|\n")
    for j in jobs:
        active = "✓" if j.get("active") else "✗"
        lines.append(
            f"| {j['jobid']} | `{j.get('jobname','—')}` | `{j['schedule']}` | {active} |\n"
        )
    lines.append("\n## Últimas execuções\n\n")
    if not runs:
        lines.append("_Sem execuções recentes._\n")
    else:
        lines.append("| JobID | Status | Início | Duração | Mensagem |\n")
        lines.append("|-------|--------|--------|---------|----------|\n")
        for r in runs:
            start = str(r.get("start_time", ""))[:19]
            end_t = r.get("end_time")
            if end_t and r.get("start_time"):
                try:
                    dur = str(r["end_time"] - r["start_time"])
                except Exception:
                    dur = "—"
            else:
                dur = "—"
            msg = str(r.get("return_message") or "").replace("|", "\\|")[:80]
            lines.append(
                f"| {r['jobid']} | `{r['status']}` | {start} | {dur} | {msg} |\n"
            )
    return "".join(lines)


def md_auth(metrics: dict) -> str:
    lines = ["# Métricas de Auth\n"]
    if not metrics:
        lines.append(
            "\n_Não disponível: `SUPABASE_SERVICE_ROLE_KEY` não configurado._\n"
        )
        return "".join(lines)
    if "error" in metrics:
        lines.append(f"\n_Erro ao coletar: {metrics['error']}_\n")
        return "".join(lines)
    lines.append(f"\n- Total de usuários: **{metrics['total_users']}**\n")
    lines.append(f"- E-mails confirmados: **{metrics['confirmed_users']}**\n")
    lines.append(f"- Ativos nos últimos 30 dias: **{metrics['active_30d']}**\n")
    lines.append(f"- Com MFA habilitado: **{metrics['mfa_enabled']}**\n")
    return "".join(lines)


def md_storage(rows: list[dict]) -> str:
    lines = ["# Storage Buckets\n\n"]
    if not rows:
        lines.append("_Nenhum bucket encontrado._\n")
        return "".join(lines)
    lines.append("| Bucket | Público | Limite (bytes) | Tipos permitidos |\n")
    lines.append("|--------|---------|---------------|------------------|\n")
    for r in rows:
        pub = "✓" if r.get("public") else "✗"
        limit = r.get("file_size_limit") or "—"
        types_ = ", ".join(r.get("allowed_mime_types") or []) or "todos"
        lines.append(f"| `{r['name']}` | {pub} | {limit} | {types_} |\n")
    return "".join(lines)


def md_migrations(rows: list[dict]) -> str:
    lines = ["# Últimas Migrations (ledger)\n\n"]
    if not rows:
        lines.append("_Ledger não encontrado ou vazio._\n")
        return "".join(lines)
    lines.append("| Versão | Nome | Executada em |\n")
    lines.append("|--------|------|-------------|\n")
    for r in rows:
        name = r.get("name") or "—"
        executed = str(r.get("executed_at") or "—")[:19]
        lines.append(f"| `{r['version']}` | {name} | {executed} |\n")
    return "".join(lines)


def md_settings(rows: list[dict]) -> str:
    lines = ["# Configurações PostgreSQL relevantes\n\n"]
    lines.append("| Parâmetro | Valor | Descrição |\n")
    lines.append("|-----------|-------|-----------|\n")
    for r in rows:
        unit = f" {r['unit']}" if r.get("unit") else ""
        desc = (r.get("short_desc") or "").replace("|", "\\|")
        lines.append(f"| `{r['name']}` | `{r['setting']}{unit}` | {desc} |\n")
    return "".join(lines)


def md_views(rows: list[dict]) -> str:
    lines = ["# Views\n"]
    for r in rows:
        lines.append(f"\n## `{r['schema']}.{r['name']}`\n")
        defn = (r.get("definition") or "").strip()
        if defn:
            lines.append(f"```sql\n{defn}\n```\n")
    return "".join(lines)


def md_sequences(rows: list[dict]) -> str:
    lines = ["# Sequences\n\n"]
    lines.append("| Schema | Nome | Tipo | Início | Mín | Máx | Incremento |\n")
    lines.append("|--------|------|------|--------|-----|-----|------------|\n")
    for r in rows:
        lines.append(
            f"| `{r['schema']}` | `{r['name']}` | `{r['data_type']}` "
            f"| {r['start_value']} | {r['minimum_value']} | {r['maximum_value']} "
            f"| {r['increment']} |\n"
        )
    return "".join(lines)


def md_index(sections: dict[str, str]) -> str:
    server = sections.get("server") or {}
    md = [
        "# Snapshot Supabase — contexto para agentes de IA\n",
        os.environ.get("SUPABASE_SNAPSHOT_PUBLICACAO", "Gerado automaticamente a cada 10 min pelo workflow `contexto` (job `banco`). **Não edite manualmente.**") + "\n",
        "Frescor: `git log -1 --format=%cI -- docs/contexto/supabase`. Só há commit quando algo mudou; o histórico está em `CHANGELOG.md`.\n",
        "## Protocolo para agentes\n",
        "1. Leia este índice primeiro.\n",
        "2. Acesse o arquivo da seção relevante.\n",
        "3. Para estrutura de tabelas: `tabelas.md`; para lógica de negócio: `funcoes.md` + `triggers.md`.\n",
        "4. Para segurança: `rls.md`.\n",
        "5. Para estado operacional: `cron.md` + `auth.md`.\n",
        "\n## Projeto\n",
    ]
    if PROJECT_REF:
        md.append(f"- Ref: `{PROJECT_REF}`\n")
    if REST_URL:
        md.append(f"- REST URL: `{REST_URL}`\n")
    pg_ver = ""
    if isinstance(server, dict):
        for s in (server.get("settings") or []):
            if isinstance(s, dict) and s.get("name") == "server_version":
                pg_ver = s.get("setting", "")
                break
    if pg_ver:
        md.append(f"- PostgreSQL: `{pg_ver}`\n")
    md.append("\n## Seções disponíveis\n\n")
    md.append("| Arquivo | Conteúdo |\n")
    md.append("|---------|----------|\n")
    file_map = {
        "tabelas.md": "Tabelas: colunas, PKs, FKs, tamanhos",
        "rls.md": "Políticas RLS por tabela",
        "funcoes.md": "Funções e procedures (com código-fonte)",
        "triggers.md": "Triggers",
        "indexes.md": "Índices",
        "views.md": "Views",
        "sequences.md": "Sequences",
        "enums.md": "Tipos enum",
        "extensions.md": "Extensões instaladas",
        "cron.md": "Jobs pg_cron e execuções recentes",
        "auth.md": "Métricas de autenticação",
        "storage.md": "Storage buckets",
        "migrations.md": "Últimas 50 migrations do ledger",
        "settings.md": "Configurações PostgreSQL relevantes",
    }
    for fname, desc in file_map.items():
        md.append(f"| [`{fname}`]({fname}) | {desc} |\n")
    return "".join(md)


# ---------------------------------------------------------------------------
# Snapshot orchestration
# ---------------------------------------------------------------------------


def _needs_run() -> bool:
    """Return True if any changed path is relevant to the snapshot."""
    if not CHANGED_PATHS:
        return True  # always run if not filtering
    relevant = {
        "supabase/migrations",
        "supabase/functions",
        "supabase/schema",
        "scripts/supabase_snapshot",
    }
    for cp in CHANGED_PATHS:
        for rel in relevant:
            if cp.startswith(rel) or rel.startswith(cp):
                return True
    return False


def run_snapshot(dry_run: bool = False) -> int:
    if not _needs_run():
        print("Snapshot: nenhum caminho relevante alterado — pulando.")
        return 0

    if psycopg2 is None:
        print("ERRO: psycopg2 não instalado.", file=sys.stderr)
        return 1
    if not DB_URL:
        print("ERRO: SUPABASE_DB_URL não definida.", file=sys.stderr)
        return 1

    print(f"Snapshot: conectando a {DB_URL[:40]}…")

    # Collect data
    print("  → tabelas…")
    tbl_rows = tables()
    print(f"     {len(tbl_rows)} tabelas")

    print("  → colunas…")
    col_rows = columns()

    print("  → PKs / FKs…")
    pk_rows = primary_keys()
    fk_rows = foreign_keys()

    print("  → índices…")
    idx_rows = indexes()

    print("  → RLS…")
    rls_rows = rls_policies()

    print("  → funções…")
    fn_rows = functions_list()
    print(f"     {len(fn_rows)} funções")

    print("  → triggers…")
    trig_rows = triggers_list()

    print("  → views…")
    view_rows = views_list()

    print("  → sequences…")
    seq_rows = sequences_list()

    print("  → enums…")
    enum_rows = enums_list()

    print("  → extensões…")
    ext_rows = extensions_list()

    print("  → cron…")
    cron_rows = cron_jobs()
    cron_run_rows = cron_job_run_details()

    print("  → auth…")
    auth_data = auth_metrics()

    print("  → storage…")
    storage_rows = storage_buckets()

    print("  → migrations…")
    mig_rows = migration_ledger()

    print("  → pg_settings…")
    settings_rows = pg_settings_snapshot()

    # Build maps
    cols_map: dict = {}
    for c in col_rows:
        key = (c["schema"], c["table"])
        cols_map.setdefault(key, []).append(c)

    pks_map: dict = {}
    for p in pk_rows:
        key = (p["schema"], p["table"])
        pks_map.setdefault(key, []).append(p)

    fks_map: dict = {}
    for f in fk_rows:
        key = (f["schema"], f["table"])
        fks_map.setdefault(key, []).append(f)

    sections: dict[str, Any] = {
        "server": {"settings": settings_rows},
    }

    files: dict[str, str] = {
        "tabelas.md": md_tables(tbl_rows, cols_map, pks_map, fks_map),
        "rls.md": md_rls(rls_rows),
        "funcoes.md": md_functions(fn_rows),
        "triggers.md": md_triggers(trig_rows),
        "indexes.md": md_indexes(idx_rows),
        "views.md": md_views(view_rows),
        "sequences.md": md_sequences(seq_rows),
        "enums.md": md_enums(enum_rows),
        "extensions.md": md_extensions(ext_rows),
        "cron.md": md_cron(cron_rows, cron_run_rows),
        "auth.md": md_auth(auth_data),
        "storage.md": md_storage(storage_rows),
        "migrations.md": md_migrations(mig_rows),
        "settings.md": md_settings(settings_rows),
        "INDEX.md": md_index(sections),
    }

    # JSON exports
    json_exports: dict[str, Any] = {
        "tabelas.json": tbl_rows,
        "rls.json": rls_rows,
        "cron.json": {"jobs": cron_rows, "recent_runs": cron_run_rows},
        "auth.json": auth_data,
        "migrations.json": mig_rows,
    }

    changed: list[str] = []

    if dry_run:
        for fname, content in {**files, **{k: json.dumps(v, default=str) for k, v in json_exports.items()}}.items():
            size = len(content.encode())
            print(f"  [dry-run] {fname}: {size} bytes")
        return 0

    for fname, content in files.items():
        path = OUT / fname
        if _write(path, content):
            changed.append(fname)
            print(f"  ✓ {fname}")
        else:
            print(f"  = {fname} (sem mudança)")

    for fname, data in json_exports.items():
        content = json.dumps(data, default=str, ensure_ascii=False, indent=2) + "\n"
        path = OUT / fname
        if _write(path, content):
            changed.append(fname)
            print(f"  ✓ {fname}")
        else:
            print(f"  = {fname} (sem mudança)")

    print(f"\nSnapshot concluído: {len(changed)} arquivo(s) alterado(s).")
    if changed:
        print("  Alterados: " + ", ".join(changed))
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Supabase snapshot para agentes de IA")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Mostra o que seria escrito sem gravar arquivos",
    )
    parser.add_argument(
        "--out",
        default=None,
        help=f"Pasta de saída (default: {OUT}, sobrescreve var OUT)",
    )
    args = parser.parse_args()

    if args.out:
        global OUT
        OUT = Path(args.out)

    if not DB_URL and not args.dry_run:
        parser.error(
            "SUPABASE_DB_URL não definida. "
            f"Defina a variável de ambiente ou passe --dry-run para simular. "
            f"Pastas varridas: {OUT}"
        )
        return 1

    return run_snapshot(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
