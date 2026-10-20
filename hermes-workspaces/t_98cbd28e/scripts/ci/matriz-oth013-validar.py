#!/usr/bin/env python3
"""Valida a matriz documental canônica do achado OTH-013."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FINDINGS_PATH = ROOT / "docs/reconciliation/FINDINGS.json"
EXPECTED_COMMAND = (
    "python3 scripts/ci/matriz-oth013-validar.py "
    "docs/design/PLANO_EMAIL_SIDEBAR_CONTATO_50_ETAPAS_2026-10-03.md"
)
FIELDS = (
    "Site",
    "LinkedIn empresarial",
    "Instagram empresarial",
    "Sobre",
    "Logo",
    "Tipos de relacionamento",
)
SCENARIOS = (
    "Atendente autorizado",
    "Atendente negado",
    "Contato somente com e-mail",
    "Escolha entre múltiplas empresas",
)
REQUIRED_PATHS = (
    "src/types/emailContactContext.ts",
    "src/components/email/EmailContactPanel.tsx",
    "src/lib/emailCompanyLinks.ts",
    "src/lib/__tests__/emailCompanyLinks.test.ts",
    "src/components/email/__tests__/EmailContactPanel.test.tsx",
    "supabase/functions/crm-integration/index.ts",
    "supabase/functions/crm-integration/index.test.ts",
    "src/components/contacts/CompanyLogo.tsx",
    "src/types/__tests__/emailContactContext.test.ts",
    "supabase/migrations/20261003160000_add_email_crm_link_permission.sql",
    "src/hooks/crm/__tests__/useEmailContactContext.test.tsx",
    "supabase/migrations/20261003151520_add_manual_email_crm_link_guard.sql",
    "scripts/db-audit/check-migration-drift.mjs",
    "scripts/ci/crm-integration-contract.unit.mjs",
)


def fail(message: str) -> None:
    raise SystemExit(f"ERRO: {message}")


def no_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            fail(f"chave JSON duplicada: {key}")
        result[key] = value
    return result


def walk(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def matrix_row(plan: str, label: str) -> str:
    prefix = f"| {label} |"
    rows = [line for line in plan.splitlines() if line.startswith(prefix)]
    if len(rows) != 1:
        fail(f"esperada uma linha da matriz para {label!r}; encontradas {len(rows)}")
    return rows[0]


def main() -> None:
    if len(sys.argv) != 2:
        fail("uso: matriz-oth013-validar.py <plano.md>")

    plan_path = Path(sys.argv[1])
    if not plan_path.is_absolute():
        plan_path = ROOT / plan_path
    if not plan_path.is_file():
        fail(f"plano não encontrado: {plan_path}")
    plan = plan_path.read_text(encoding="utf-8")

    marker = "## Matriz final do contrato empresarial — OTH-013"
    if marker not in plan:
        fail("seção OTH-013 ausente")
    matrix = plan.split(marker, 1)[1]
    for label in (*FIELDS, *SCENARIOS):
        matrix_row(matrix, label)

    denied_row = matrix_row(matrix, "Atendente negado")
    exact_test = "mapeia o kill switch e a negação de visibilidade sem expor fallback"
    if exact_test not in denied_row or "pendência nominal" not in denied_row:
        fail("Atendente negado deve citar o teste exato disponível e manter 403/404 como pendência nominal")
    if "comprovado local (fronteira do servidor)" in denied_row:
        fail("Atendente negado não pode declarar 403/404 comprovados sem teste dedicado")

    missing_paths = [path for path in REQUIRED_PATHS if not (ROOT / path).is_file()]
    if missing_paths:
        fail("caminhos versionados ausentes: " + ", ".join(missing_paths))

    findings = json.loads(FINDINGS_PATH.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys)
    matches = [item for item in walk(findings) if item.get("id") == "OTH-013"]
    if len(matches) != 1:
        fail(f"esperado um objeto OTH-013; encontrados {len(matches)}")
    finding = matches[0]
    for key in ("status", "proof_detail", "documentation_fix"):
        if key not in finding:
            fail(f"OTH-013 sem a chave {key}")
    documentation_fix = finding["documentation_fix"]
    if not isinstance(documentation_fix, dict):
        fail("OTH-013.documentation_fix deve ser objeto")
    if documentation_fix.get("validation_command") != EXPECTED_COMMAND:
        fail("OTH-013.documentation_fix.validation_command não aponta para o validador versionado")
    if documentation_fix.get("fields_covered") != list(FIELDS):
        fail("OTH-013.fields_covered diverge dos seis campos da matriz")
    if documentation_fix.get("scenarios_covered") != [item.lower() for item in SCENARIOS]:
        fail("OTH-013.scenarios_covered diverge dos quatro cenários da matriz")

    print(
        "OK: OTH-013 válido; 6 campos, 4 cenários e 14 caminhos conferidos; "
        "status/proof_detail/documentation_fix pertencem ao objeto sem chaves JSON duplicadas"
    )


if __name__ == "__main__":
    main()
