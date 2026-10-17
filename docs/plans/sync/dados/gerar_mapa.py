#!/usr/bin/env python3
# AG2 - gera docs/plans/sync/F05-F08-front-docs-raiz-mapa-2026-10-17.md a partir dos CSVs
import csv, os, collections

WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = WS + "/.tmp/sync"
def rd(n): return list(csv.DictReader(open(S + "/" + n)))
def tbl(rows, cols, hdr):
    out = ["| " + " | ".join(hdr) + " |", "|" + "|".join(["---"] * len(hdr)) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(r[c]) for c in cols) + " |")
    return "\n".join(out) + "\n"

resumo = [r for r in rd("src_resumo.csv") if r["subarea"] not in ("App.tsx", "index.css", "main.tsx", "vite-env.d.ts")]
ho = rd("src_head_only.csv")
dif = rd("src_diferentes.csv")
prs = rd("f05_plano_prs.csv")
f8 = rd("f08_arquivos.csv")
raiz = rd("f08_raiz.csv")
ct = rd("f08_contagens.csv")
env = rd("f08_env_nomes.csv")

sub = collections.Counter(r["subarea"] for r in dif)
todo = "\n".join(["# F05 + F08 - front (src/), docs, e2e, tests e raiz: mapa de reconciliacao", "",
    "Base: HEAD = dia/2026-10-17 @ d723a90107 x origin/main @ a9b4d6c6fb; merge-base 7a15852791.",
    "Leitura pura: nenhum arquivo de codigo foi alterado. Resumo e scripts em `docs/plans/sync/dados/`.",
    "O dado linha-a-linha dos 1157 arquivos esta em 3 CSV maiores (`src_diferentes.csv`,",
    "`src_origin_only.csv`, `f05_origin_only_proveniencia.csv`), que ficam em `.tmp/sync/` do workspace",
    "`v2/sync-ag2-front-26101708550eb1` - fora do commit pelo limite de tamanho do fechar. Os scripts",
    "regeram tudo a partir de `git ls-tree`/`git log`, sem estado externo.", "",
    "## 1. src/ por subarea", "", tbl(resumo, ["subarea","arquivos_HEAD","arquivos_origin","origin_only","HEAD_only","blobs_diferentes"],
        ["subarea","arquivos no dia","arquivos na origin","origin-only","HEAD-only","blobs diferentes"]),
    "Total: 426 origin-only, 33 HEAD-only, 731 blobs diferentes.", "",
    "## 2. HEAD-only (Etapa 053): 33/33 obsoletos - nao replayar", "",
    tbl(ho, ["caminho","ultima_alteracao_HEAD","removido_na_origin_por","veredito"],
        ["caminho","ultima alteracao no dia","removido na origin por","veredito"]),
    "32 foram removidos pela origin no commit 025d0258dc (lote 880 cartoes), que traz implementacao nova",
    "no lugar. A origin mantem testes-guarda de remocao que FALHAM se o arquivo voltar",
    "(`src/hooks/system/__tests__/useVersionsAusente.test.ts`, `src/components/inbox/__tests__/queue-position-removido.test.ts`).",
    "O 33o (`src/components/inbox/__tests__/swipeActions.test.ts`) testa modulo que a origin removeu",
    "(`git grep -F swipeActions origin/main -- src` = 0).", "",
    "## 3. Blobs diferentes (Etapa 054): 731, vencedor = origin/main", "",
    "Criterio: recencia (ultimo commit de cada lado) - nunca tamanho. 578 com a origin mais nova no",
    "intervalo; 153 em que o dia nao tem commit posterior a base, logo a unica mudanca e a da origin.",
    "Amostra de 25 conferida com `git log -1 --format=%ct` nos dois lados: 25/25 com a origin mais nova.", "",
    tbl([{"subarea": k, "blobs": sub[k]} for k in sorted(sub)], ["subarea","blobs"], ["subarea","blobs diferentes"]),
    "## 4. Plano de PRs pequenos (Etapa 055) - planejar, nao abrir", "",
    "Arquivo completo: `f05_plano_prs.csv`. Total de PRs: " + str(len(prs)) + "; maior PR: " +
    str(max(int(r["arquivos"]) for r in prs)) + " arquivos e " + str(max(int(r["linhas_estimadas"]) for r in prs)) +
    " linhas (limite 30/1500).",
    "Tipos: " + str(sum(1 for r in prs if r["tipo"] == "origin_only")) + " de replay aditivo (origin-only) e " +
    str(sum(1 for r in prs if r["tipo"] == "blob_diferente")) + " de replay da versao da origin.",
    "`src/types/**` fica FORA desta trilha (types.ts e da F12).", "",
    tbl(prs[:6], ["pr","subarea","tipo","arquivos","linhas_estimadas","origem_provavel"], ["PR","subarea","tipo","arquivos","linhas","origem provavel"]),
    "## 5. F08 - docs, e2e, tests, .tmp e raiz", "",
    tbl(ct, ["area","HEAD","origin"], ["area","arquivos no dia","arquivos na origin"]),
    "Classes por area: docs " + str(sum(1 for r in f8 if r["area"]=="docs" and r["classe"]=="origin_only")) + " origin-only e " +
    str(sum(1 for r in f8 if r["area"]=="docs" and r["classe"]=="diferente")) + " diferentes; e2e " +
    str(sum(1 for r in f8 if r["area"]=="e2e" and r["classe"]=="origin_only")) + "/" +
    str(sum(1 for r in f8 if r["area"]=="e2e" and r["classe"]=="diferente")) + "; tests " +
    str(sum(1 for r in f8 if r["area"]=="tests" and r["classe"]=="origin_only")) + "/" +
    str(sum(1 for r in f8 if r["area"]=="tests" and r["classe"]=="diferente")) + "; .tmp " +
    str(sum(1 for r in f8 if r["area"]==".tmp" and r["classe"]=="origin_only")) + "/" +
    str(sum(1 for r in f8 if r["area"]==".tmp" and r["classe"]=="diferente")) + ".",
    "`tests/contracts`: 90 no dia x 95 na origin. `tests/axe-campaigns.contract.test.ts` e HEAD-only e",
    "obsoleto (campanha classica removida na origin, que ja tem `no-campaigns-classicas.contract.test.ts`).", "",
    "Raiz divergente:", "",
    tbl(raiz, ["arquivo","classe","linhas_HEAD","linhas_origin","diferenca_linhas"], ["arquivo","classe","linhas dia","linhas origin","diff"]),
    "`.env.production`: a divergencia e de 1 linha e os NOMES das " + str(len(env)) + " variaveis sao identicos nos dois lados",
    "(`f08_env_nomes.csv`); nenhum valor foi lido ou registrado.", "",
    "## 6. Limites e ressalvas", "",
    "- 417 dos 426 origin-only de src vieram de UM commit de lote (025d0258dc, PR #1976): a atribuicao por",
    "  branch v2/* nao existe localmente para eles (Etapa 059 exige o corpo dos PRs do lote).",
    "- Nao abri PR, nao fiz push/merge (Etapa 046 proibe merge direto dia -> main).",
    "- Nao apaguei planos antigos nem tirei o .tmp do versionamento (Etapas 082/088, PR proprio).",
    "- e2e intocado: nenhuma execucao autenticada, sem .auth/*, sem banco de producao (R1)."])
os.makedirs(WS + "/docs/plans/sync", exist_ok=True)
open(WS + "/docs/plans/sync/F05-F08-front-docs-raiz-mapa-2026-10-17.md", "w").write(todo + "\n")
print("ok", len(todo))
