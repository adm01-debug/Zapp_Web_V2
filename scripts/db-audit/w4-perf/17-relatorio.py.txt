#!/usr/bin/env python3
"""Agrega as evidencias do experimento W4 (onda 2) em tabelas markdown.

Le `docs/audits/w4-performance-2026-09-29/evidence/bench-all-<vol>.csv`,
`bench-<vol>.csv`, `trig-<vol>.csv`, `indexes-<vol>.csv`, `*-ddl-<vol>.txt`
e imprime as tabelas que vao para o RELATORIO-W4-PERFORMANCE.md.

Uso: python3 scripts/db-audit/w4-perf/17-relatorio.py [volume...]
"""
from __future__ import annotations

import csv
import pathlib
import statistics
import sys
from collections import defaultdict

REPO = pathlib.Path(__file__).resolve().parents[3]
EV = REPO / "docs" / "audits" / "w4-performance-2026-09-29" / "evidence"
VOLS = [int(v) for v in sys.argv[1:]] or [3000, 10000, 100000]


def p95(vals: list[float]) -> float:
    if len(vals) < 2:
        return vals[0]
    return statistics.quantiles(vals, n=100, method="inclusive")[94]


def p50(vals: list[float]) -> float:
    return statistics.median(vals)


def load(name: str) -> list[dict]:
    f = EV / name
    if not f.exists():
        return []
    return list(csv.DictReader(f.open()))


def key(r: dict) -> tuple:
    return (r["phase"], r["variant"], r["caller"], r["scenario"],
            r["sort_field"], r["sort_dir"], r["page_offset"])


def group(rows: list[dict]) -> dict[tuple, list[float]]:
    g: dict[tuple, list[float]] = defaultdict(list)
    for r in rows:
        g[key(r)].append(float(r["ms"]))
    return g


def f(x: float) -> str:
    return f"{x:,.1f}".replace(",", " ")


def md_table(header: list[str], rows: list[list[str]]) -> str:
    out = ["| " + " | ".join(header) + " |",
           "|" + "|".join("---" for _ in header) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(out)


def main() -> int:
    for vol in VOLS:
        rows = load(f"bench-all-{vol}.csv")
        if not rows:
            seen, rows = set(), []
            for nm in (f"bench-{vol}.csv", f"bench-idx-{vol}.csv"):
                for r in load(nm):
                    k = tuple(r.values())
                    if k not in seen:
                        seen.add(k)
                        rows.append(r)
        if not rows:
            print(f"\n## VOLUME {vol}: SEM EVIDENCIA\n")
            continue
        g = group(rows)
        print(f"\n\n==================== VOLUME {vol:,} ====================".replace(",", "."))

        # ---- 1. distribuicao / visibilidade ---------------------------------
        seed = EV / f"seed-{vol}.txt"
        if seed.exists():
            lines = [l for l in seed.read_text(encoding="utf-8").splitlines()
                     if l.strip() and ("|" in l) and "linhas" not in l][:1]
            print("\n### distribuicao efetiva (saida literal do seed)\n```")
            print("\n".join(lines))
            print("```")
        # visibilidade MEDIDA na execucao (total_count devolvido pelo RPC)
        for caller in ("agent", "admin"):
            ks = [k for k in g if k[2] == caller and k[3] == "sem_filtro"
                  and k[4] == "name" and k[5] == "asc" and k[6] == "0"]
            if ks:
                print(f"visibilidade ({caller}): total_count = "
                      f"{max(int(r['total_count']) for r in rows if key(r) == ks[0])}")

        # ---- 2. 3 piores e 3 melhores do BASELINE (f1_v0_base, todos os sorts)
        base = {k: v for k, v in g.items() if k[0] == "f1_v0_base"}
        ranked = sorted(
            ((k, p50(v), p95(v), max(v), len(v)) for k, v in base.items()
             if k[3] != "__overhead_wrapper__"),
            key=lambda t: -t[2])
        print("\n### BASELINE v0 -- 3 PIORES (por p95)\n")
        print(md_table(
            ["cenario", "sort", "dir", "offset", "p50 ms", "p95 ms", "max ms", "n"],
            [[k[3], k[4], k[5], k[6], f(a), f(b), f(c), n] for k, a, b, c, n in ranked[:3]]))
        print("\n### BASELINE v0 -- 3 MELHORES (por p95)\n")
        print(md_table(
            ["cenario", "sort", "dir", "offset", "p50 ms", "p95 ms", "max ms", "n"],
            [[k[3], k[4], k[5], k[6], f(a), f(b), f(c), n] for k, a, b, c, n in ranked[-3:]]))

        # ---- 3. sem_filtro por fase (antes/depois) ---------------------------
        print("\n### ORDENACAO name/asc, offset 0 -- todas as fases\n")
        out = []
        for k in sorted(g):
            if k[3] == "sem_filtro" and k[4] == "name" and k[5] == "asc" and k[6] == "0":
                out.append([k[0], k[1], k[2], f(p50(g[k])), f(p95(g[k])), len(g[k])])
        print(md_table(["fase", "variant", "caller", "p50 ms", "p95 ms", "n"], out))

        # ---- 4. antes/depois por cenario (baseline vs melhor combinacao) -----
        final = "f4_v3_idx3"
        final_variant = next((k[1] for k in g if k[0] == final), "v3")
        print(f"\n### ANTES/DEPOIS -- f1_v0_base (vigente, indices do canonico) x {final} (v{final_variant} + idx2 + idx3)\n")
        out = []
        for k in sorted(base):
            if k[3] == "__overhead_wrapper__":
                continue
            kk = (final, final_variant, k[2], k[3], k[4], k[5], k[6])
            if kk not in g:
                continue
            a, b = p50(base[k]), p50(g[kk])
            out.append([k[3], k[4], k[5], k[6], f(a), f(p95(base[k])), f(b), f(p95(g[kk])),
                        f(a - b), f"{100 * (a - b) / a:.0f}%" if a else "-"])
        out.sort(key=lambda r: -float(r[4].replace(" ", "")))
        print(md_table(["cenario", "sort", "dir", "off", "p50 antes", "p95 antes",
                        "p50 depois", "p95 depois", "ganho ms", "ganho %"], out))

        # ---- 5. indice trgm parcial x completo ------------------------------
        print("\n### termo livre: baseline x idx1 (trgm 2 colunas) x idx2 (trgm 7 colunas)\n")
        out = []
        for sc in ["termo_nome_5ch", "termo_empresa", "termo_nome_2ch", "termo_nome_3ch"]:
            for phase, lab in [("f1_v0_base", "baseline"), ("f2_v0_idx1", "idx1"),
                               ("f3_v0_idx2", "idx2")]:
                for off in ["0", "500"]:
                    k = (phase, "v0", "agent", sc, "name", "asc", off)
                    if k in g:
                        out.append([sc, off, lab, f(p50(g[k])), f(p95(g[k]))])
        print(md_table(["cenario", "off", "fase", "p50 ms", "p95 ms"], out))

        # ---- 6. custo dos indices -------------------------------------------
        idx = load(f"indexes-{vol}.csv")
        if idx:
            print("\n### indices de `contacts` (tamanho, uso)\n")
            out = []
            for r in sorted(idx, key=lambda r: -int(r["bytes_indice"])):
                out.append([r["indice"], f"{int(r['bytes_indice']) / 1024:.0f} kB",
                            f"{int(r['bytes_indice']) / 1048576:.2f} MB",
                            r["scans"]])
            print(md_table(["indice", "kB", "MB", "scans"], out))

        # ---- 7. trigger ------------------------------------------------------
        tg = load(f"trig-{vol}.csv")
        if tg:
            byk: dict[tuple, list[float]] = defaultdict(list)
            for r in tg:
                byk[(r["mode"], int(r["k"]), r["arm"])].append(float(r["ms"]))
            print("\n### trigger de auditoria (p50 por modo x lote x arm)\n")
            out = []
            for (mode, k, arm), v in sorted(byk.items()):
                if arm not in ("lote_ON", "lote_OFF", "insert_only"):
                    continue
                out.append([mode, k, arm, f(p50(v)), len(v)])
            print(md_table(["modo", "k", "arm", "p50 ms", "n"], out))

        # ---- 8. overhead do invólucro ---------------------------------------
        over = [float(r["ms"]) for r in rows if r["scenario"] == "__overhead_wrapper__"]
        if over:
            print(f"\noverhead do invólucro de medicao (PERFORM count(*)): "
                  f"p50 {p50(over):.3f} ms")
    return 0


if __name__ == "__main__":
    sys.exit(main())
