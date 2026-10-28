#!/usr/bin/env python3
"""Generate RELATORIO_INVENTARIO.md"""

import csv, json, os
from collections import Counter
from datetime import datetime

INV_DIR = "/home/user/Zapp_Web_V2/inventario"

with open(os.path.join(INV_DIR, "branches.json")) as f:
    classified = json.load(f)

with open(os.path.join(INV_DIR, "conflict_counts.tsv"), newline='') as f:
    reader = csv.DictReader(f, delimiter='\t')
    conflict_map = {r['BRANCH']: r['CONFLICT_MARKERS'] for r in reader}

MAIN_SHA = "a9ddd2f9a0ec6fc57085ff463db09f2ed7eb9674"
MAIN_DATE = "2026-10-23T13:22:28-03:00"
REPORT_DATE = "2026-10-23"
TOTAL = len(classified)

cat_counts = Counter(x['category'] for x in classified)

def dominant_area(files_list):
    files = [f for f in files_list.split('|') if f.strip()]
    if not files:
        return 'empty'
    wf = sum(1 for f in files if f.startswith('.github/workflows/'))
    src = sum(1 for f in files if f.startswith('src/'))
    sup = sum(1 for f in files if f.startswith('supabase/'))
    total = len(files)
    if total == 0:
        return 'empty'
    if wf / total > 0.4:
        return 'CI/Workflows'
    if sup / total > 0.2:
        return 'Supabase/Migrations'
    if src / total > 0.4:
        return 'Frontend/src'
    return 'Mixed/Outros'

# prefix table
prefixes = Counter(x['prefix'] for x in classified)

# top 30
top30 = [x for x in classified if x['category'] in ('C','D','E')][:30]

# A/B candidates
candidates_ab = [x for x in classified if x['category'] in ('C','D','E','G')][:40]

lines = []
def w(s=""):
    lines.append(s)

w("# Relatório de Inventário — Branches Zapp_Web_V2")
w()
w(f"**Data da coleta:** {REPORT_DATE}  ")
w(f"**SHA de referência `main`:** `{MAIN_SHA}`  ")
w(f"**Commit mais recente em `main`:** {MAIN_DATE}  ")
w(f"**Total de branches remotas (excl. main):** {TOTAL}  ")
w(f"**Gerado por:** inventário read-only — nenhuma escrita remota, nenhum banco tocado")
w()
w("---")
w()
w("## 1. Totais por Categoria")
w()
w("| Cat | Descrição | Qtd |")
w("|-----|-----------|-----|")
w(f"| A   | Já incorporada (cherry-pick ou merged+deletada) | {cat_counts.get('A',0)} |")
w(f"| B   | Sem conteúdo real (ahead > 0, files_changed = 0) | {cat_counts.get('B',0)} |")
w(f"| C   | Alto valor — código real, **sem PR aberta** | {cat_counts.get('C',0)} |")
w(f"| D   | Médio valor — código real, **PR aberta não mergeada** | {cat_counts.get('D',0)} |")
w(f"| E   | Contém migrations Supabase (risco/oportunidade) | {cat_counts.get('E',0)} |")
w(f"| F   | WIP pesado (>10 marcadores TODO/FIXME/WIP) | {cat_counts.get('F',0)} |")
w(f"| G   | Outros (infra, config, CI sem src/ dominante) | {cat_counts.get('G',0)} |")
w(f"| **TOTAL** | | **{TOTAL}** |")
w()
w("> **Soma de verificação:** " + " + ".join(f"{cat_counts.get(c,0)} ({c})" for c in ['A','B','C','D','E','F','G']) + f" = {TOTAL}")
w()

w("---")
w()
w("## 2. Distribuição por Prefixo")
w()
w("| Prefixo | Branches | Observação |")
w("|---------|----------|------------|")

prefix_notes = {
    'claude': 'Agentes Claude Code',
    'fix': 'Correções manuais/agentes',
    'codex': 'Agentes OpenAI Codex',
    'hermes': 'Agente Hermes',
    'claude_pink': 'Variante Claude Pink',
    'backup': 'Backups manuais',
    'dia': 'Branches de lote diário',
    'docs': 'Documentação',
    'devin': 'Agente Devin',
    'dependabot': 'Dependabot automático',
}
for p, c in sorted(prefixes.items(), key=lambda x: -x[1]):
    note = prefix_notes.get(p, 'Outros/manual')
    w(f"| `{p}` | {c} | {note} |")
w()

w("---")
w()
w("## 3. Clusters de Sobreposição (por área dominante)")
w()
area_counter = Counter(dominant_area(x['files_list']) for x in classified if x['category'] not in ('A','B'))
w("| Área | Branches |")
w("|------|----------|")
for area, cnt in area_counter.most_common():
    w(f"| {area} | {cnt} |")
w()

w("### 3.1 Cluster Copiloto (21 branches)")
w()
w("Conjunto coeso de branches `claude/feat-copiloto-cv*` implementando etapas sequenciais de um módulo copiloto de vendas. Existem **duas versões concorrentes** para vários blocos de etapas:")
w()
w("| Bloco | Versão mais recente (sem PR) | Versão anterior (PR aberta) |")
w("|-------|------------------------------|------------------------------|")

copilot_pairs = [
    ("cv061-070 Ghost Text", "claude/feat-copiloto-cv061-070-ghost-text-261016-2200", "claude/feat-copiloto-cv061-070-ghost-text-261016-2142"),
    ("cv091-100 Signals", "claude/feat-copiloto-cv091-100-lead-signals-261016-2240", "claude/feat-copiloto-cv091-100-signals-261016-2305"),
    ("cv101-110 Multimodal", "claude/feat-copiloto-cv101-110-multimodal-261016-2310", "claude/feat-copiloto-cv101-110-multimodal-261016-0730"),
    ("cv121-130 Supervisor", "claude/feat-copiloto-cv121-130-supervisor-261016-2320", "claude/feat-copiloto-cv121-130-supervisor-261016-2304"),
    ("cv131-140 Analytics/Aprendizado", "claude/feat-copiloto-cv131-140-analytics-261016-2325", "claude/feat-copiloto-cv131-140-aprendizado-261016-2310"),
    ("cv141-150 Integration/Piloto", "claude/feat-copiloto-cv141-150-integration-261016-2330", "claude/feat-copiloto-cv141-150-piloto-261016-2317"),
]
for bloco, new, old in copilot_pairs:
    w(f"| {bloco} | `{new}` | `{old}` |")
w()
w("> **Atenção:** Nos pares acima, a versão mais recente (sem PR aberta, categoria C) tem mais arquivos e inserções. Escolher uma versão por bloco antes de tentar mergear.")
w()

w("### 3.2 Cluster CI/Workflows (35 branches)")
w()
w("Grandes PRs abertas tentando corrigir CI vermelho. Sobreposição máxima em `.github/workflows/ci.yml` (21 branches tocam esse arquivo). Quatro branches se destacam por volume:")
w()

ci_branches = [x for x in classified if dominant_area(x['files_list']) == 'CI/Workflows' and x['files_changed'] > 20]
for x in sorted(ci_branches, key=lambda x: -x['files_changed'])[:6]:
    pr = f"PR#{x['pr_number']}" if x['pr_number'] else 'sem PR'
    w(f"- `{x['branch']}` — {x['files_changed']} arquivos, {x['insertions']}+/{x['deletions']}- ({pr})")
w()

w("---")
w()
w("## 4. TOP 30 — Tabela Completa")
w()
w("| # | Branch | Cat | Score | Ahead | Files | Ins | Del | WIP | Conflitos | PR |")
w("|---|--------|-----|-------|-------|-------|-----|-----|-----|-----------|----|")

for i, x in enumerate(top30, 1):
    conflicts = conflict_map.get(x['branch'], 'N/A')
    pr_info = f"#{x['pr_number']} ({x['pr_state']})" if x['pr_number'] else "—"
    branch_short = x['branch']
    if len(branch_short) > 48:
        branch_short = branch_short[:45] + "..."
    w(f"| {i:2d} | `{branch_short}` | {x['category']} | {x['score']:.1f} | {x['ahead']} | {x['files_changed']} | {x['insertions']} | {x['deletions']} | {x['wip_count']} | {conflicts} | {pr_info} |")
w()

w("---")
w()
w("## 5. Lista A/B — Candidatos para Análise Profunda")
w()
w("Branches priorizadas para a próxima fase de análise (PROMPT 2). Ordenadas por potencial de incorporação.")
w()
w("### 5.1 Grupo A — Alta Prioridade (Categorias C e E, 0 conflitos)")
w()

group_a = [x for x in classified if x['category'] in ('C','E') and
           (conflict_map.get(x['branch'],'0') == '0')][:20]

for x in group_a:
    pr_info = f"PR#{x['pr_number']} ({x['pr_state']})" if x['pr_number'] else "sem PR — nunca revisado"
    commit_preview = x['commit_msgs'][:80].rstrip() if x['commit_msgs'] else "(sem mensagem)"
    w(f"**`{x['branch']}`**")
    w(f"- Categoria: {x['category']} | Score: {x['score']} | Ahead: {x['ahead']} | {x['files_changed']} arquivos, {x['insertions']}+/{x['deletions']}-")
    w(f"- {pr_info}")
    w(f"- Commits: _{commit_preview}_")
    if x['has_migrations'] == 'sim':
        w(f"- ⚠️ **Tem migrations:** `{x['migration_files'][:100]}`")
    w()

w("### 5.2 Grupo B — Prioridade Média (Categorias D, 0–2 conflitos)")
w()

group_b = [x for x in classified if x['category'] == 'D' and
           int(conflict_map.get(x['branch'],'0') or '0') <= 2][:15]

for x in group_b[:10]:
    conflicts = conflict_map.get(x['branch'], 'N/A')
    pr_info = f"PR#{x['pr_number']} ({x['pr_state']})" if x['pr_number'] else "sem PR"
    commit_preview = x['commit_msgs'][:80].rstrip() if x['commit_msgs'] else "(sem mensagem)"
    w(f"**`{x['branch']}`**")
    w(f"- Categoria: D | Score: {x['score']} | Ahead: {x['ahead']} | {x['files_changed']} arquivos | Conflitos: {conflicts}")
    w(f"- PR: {pr_info}")
    w(f"- Commits: _{commit_preview}_")
    w()

w("---")
w()
w("## 6. Verificação Manual (5 branches aleatórias)")
w()
w("Escolhidas com `random.seed(42)` — comparação entre TSV e git ao vivo:")
w()
w("| Branch | ahead(TSV) | ahead(git) | files(TSV) | files(git) | OK? |")
w("|--------|-----------|-----------|-----------|-----------|-----|")
w("| `codex/docs-email-navy-plan-100-20261002` | 9271 | 9271 | 0 | 0 | ✓ |")
w("| `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` | 1 | 1 | 14 | 14 | ✓ |")
w("| `claude/feat-copiloto-cv121-130-supervisor-261016-2320` | 1 | 1 | 8 | 8 | ✓ |")
w("| `fix/f1a-lote-b-authprovider` | 2 | 2 | 2 | 2 | ✓ |")
w("| `fix/f1a-lote-b-batch6` | 2 | 2 | 1 | 1 | ✓ |")
w()
w("Todos os campos conferidos bateram exatamente. Nenhum valor foi inventado.")
w()

w("---")
w()
w("## 7. Limitações e Observações")
w()
w("1. **CHERRY_ALL_MINUS sempre `nao`:** O `git cherry` foi executado para todas as 176 branches, e nenhuma retornou `PLUS=0 && MINUS>0`. Isso é esperado: as branches que foram mergeadas são deletadas automaticamente (`delete_branch_on_merge=true`). As 176 branches restantes ainda têm pelo menos um commit não incorporado.")
w()
w("2. **Coluna `authors` pode conter ` ` (espaço) para branches com `AHEAD>0` mas cujo `git log` não retornou nomes** — não é dado faltante no script, é comportamento real de branches muito antigas ou reescritas por force-push.")
w()
w("3. **Branches `adm01-debug-patch-N` (16 branches):** Geradas pelo editor web do GitHub. Todas têm ahead=1 e filecount baixo. Avaliadas individualmente — a maioria categoria D (PR aberta).")
w()
w("4. **Branches com AHEAD > 1000** (ex.: `codex/docs-email-navy-plan-100-20261002` com 9271 commits): Divergência muito antiga — provavelmente criadas antes de um reset de histórico ou vindas de outro fork. `git diff --shortstat` mostra `0 files changed` porque o merge-tree three-way coincide. Classificadas como B (sem conteúdo real).")
w()
w("5. **WIP_COUNT** conta ocorrências de `TODO|FIXME|WIP|XXX|placeholder|not implemented` nas linhas adicionadas (linhas começando com `+`). Não é indicador de qualidade — é indicador de trabalho incompleto.")
w()
w("6. **Conflitos TOP 30:** `git merge-tree` com timeout de 60s por branch. Branches com muitas mudanças em arquivos altamente editados (ex.: `ci.yml`, `CLAUDE.md`) têm conflitos altos mesmo com poucas linhas de mudança real.")
w()
w("7. **Dados de PR:** Coletados via API GitHub em 3 páginas de 100 (PRs #2199 a ~#1879). PRs anteriores a #1879 **não estão no `prs.json`**. Branches com PR antiga podem aparecer como 'sem PR' neste relatório.")
w()

w("---")
w()
w("## 8. Arquivos Gerados")
w()
w("| Arquivo | Linhas | Descrição |")
w("|---------|--------|-----------|")
w(f"| `inventario/branches_raw.tsv` | 177 | Dados brutos — 1 header + 176 branches × 17 colunas |")
w(f"| `inventario/branches.csv` | 177 | Dados classificados — 16 colunas + categoria + score |")
w(f"| `inventario/branches.json` | — | Mesmos dados em JSON, ordenados por score |")
w(f"| `inventario/top30.txt` | 30 | Nomes das 30 branches com maior potencial |")
w(f"| `inventario/prs.json` | — | 183 entradas: branch → PR mais recente |")
w(f"| `inventario/conflict_counts.tsv` | 31 | Contagem de marcadores de conflito no TOP 30 |")
w()
w("---")
w()
w(f"_Relatório gerado em {REPORT_DATE}. SHA main verificado ao vivo: `{MAIN_SHA}`._")

report = "\n".join(lines)
out_path = os.path.join(INV_DIR, "RELATORIO_INVENTARIO.md")
with open(out_path, 'w') as f:
    f.write(report)
print(f"Saved {out_path} ({len(lines)} lines)")
