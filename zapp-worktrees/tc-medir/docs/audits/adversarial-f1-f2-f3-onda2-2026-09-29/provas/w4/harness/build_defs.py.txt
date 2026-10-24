#!/usr/bin/env python3
"""Extrai os CORPOS LITERAIS das funcoes das migrations e gera
`generated/02-functions.sql` -- para que o fixture do banco descartavel use o SQL
real do repo, sem transcricao manual (fonte de erro).

Uso: python3 build_defs.py  (a partir de scripts/db-audit/w4-perf/)
"""
from __future__ import annotations

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
MIGRATIONS = REPO / "supabase" / "migrations"
OUT = HERE / "generated" / "02-functions.sql"

# (arquivo, nome da funcao) -> extraido do SQL real
FUNCS = [
    ("20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql", "is_admin_or_supervisor"),
    ("20260909200000_harden_inbox_contact_authorization.sql", "get_profile_id_for_user"),
    ("20260909200000_harden_inbox_contact_authorization.sql", "get_visible_agent_ids"),
    ("20260929810000_contacts_can_edit_contact_hoisted_params.sql", "can_edit_contact"),
    ("20260929810000_contacts_can_edit_contact_hoisted_params.sql", "search_contacts"),
]

# Blocos multi-funcao que entram inteiros (trigger de auditoria).
WHOLE_FILES = [
    "20260929150000_contact_address_audit_trigger.sql",
]

# Policies de RLS de contacts (fidelidade de schema; o RPC e SECURITY DEFINER).
POLICY_SRC = ("20260929810000_contacts_can_edit_contact_hoisted_params.sql", "DROP POLICY IF EXISTS \"Users can update their assigned contacts\"")


def extract(text: str, name: str) -> list[str]:
    """Todos os blocos `CREATE [OR REPLACE] FUNCTION public.<name>(...)` do arquivo."""
    lines = text.splitlines()
    out: list[str] = []
    start = None
    for i, line in enumerate(lines):
        if start is None and re.match(
            rf"CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.{re.escape(name)}\s*\(", line
        ):
            start = i
            continue
        if start is not None and re.match(r"^\$(function)?\$;\s*$", line):
            out.append("\n".join(lines[start : i + 1]).strip())
            start = None
    if start is not None:
        raise SystemExit(f"ERRO: bloco nao terminado para {name}")
    if not out:
        raise SystemExit(f"ERRO: {name} nao encontrada")
    return out


def extract_policies(text: str) -> str:
    """Bloco de policies de `contacts` a partir do marcador (ate o fim do arquivo
    ou ate o proximo `-- N)` de secao)."""
    idx = text.find(POLICY_SRC[1])
    if idx < 0:
        raise SystemExit("ERRO: bloco de policies nao encontrado")
    tail = text[idx:]
    cut = tail.find("-- 3) search_contacts")
    if cut < 0:
        cut = tail.find("-- 3)")
    body = tail if cut < 0 else tail[:cut]
    # remove a definicao de search_contacts que vem depois, se houver
    body = body.split("CREATE OR REPLACE FUNCTION public.search_contacts")[0]
    return body.strip()


def main() -> int:
    parts: list[str] = [
        "-- GERADO por build_defs.py -- NAO EDITAR A MAO.",
        "-- Corpos extraidos literalmente das migrations (ver FUNCS em build_defs.py).",
        "",
    ]
    for fname, fn in FUNCS:
        path = MIGRATIONS / fname
        blocks = extract(path.read_text(encoding="utf-8"), fn)
        for b in blocks:
            parts.append(f"-- >>> {fn}  <- supabase/migrations/{fname}")
            # o bloco ja termina na linha `$...$;` -- nao acrescentar ';'
            parts.append(b)
            parts.append("")
    for fname in WHOLE_FILES:
        path = MIGRATIONS / fname
        parts.append(f"-- >>> arquivo inteiro <- supabase/migrations/{fname}")
        parts.append(path.read_text(encoding="utf-8").strip())
        parts.append("")

    pol = extract_policies((MIGRATIONS / POLICY_SRC[0]).read_text(encoding="utf-8"))
    parts.append(f"-- >>> policies de RLS de contacts <- supabase/migrations/{POLICY_SRC[0]}")
    parts.append(pol)
    parts.append("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"OK  {OUT.relative_to(REPO)}  ({len(parts)} blocos, {OUT.stat().st_size} bytes)")
    for fname, fn in FUNCS:
        n = len(extract((MIGRATIONS / fname).read_text(encoding="utf-8"), fn))
        print(f"    {fn:<26} {n} bloco(s)  <- {fname}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
