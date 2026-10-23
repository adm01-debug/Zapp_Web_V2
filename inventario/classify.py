#!/usr/bin/env python3
"""
Phase 4: Classify branches and generate deliverables.
Reads branches_raw.tsv + prs.json, applies classification + scoring.
"""

import csv
import json
import os
import sys

REPO_DIR = "/home/user/Zapp_Web_V2"
INV_DIR = os.path.join(REPO_DIR, "inventario")

# Load TSV
tsv_path = os.path.join(INV_DIR, "branches_raw.tsv")
prs_path = os.path.join(INV_DIR, "prs.json")

with open(prs_path) as f:
    prs = json.load(f)

rows = []
with open(tsv_path, newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f, delimiter='\t')
    for r in reader:
        rows.append(r)

print(f"Loaded {len(rows)} branches from TSV")
print(f"Loaded {len(prs)} PR entries")

def safe_int(v, default=0):
    try:
        return int(str(v).strip())
    except:
        return default

def classify_and_score(r, pr_info):
    """
    Categories:
    A = already merged (CHERRY_ALL_MINUS=sim or AHEAD=0)
    B = no real content (AHEAD>0 but FILES_CHANGED=0 and no meaningful diff)
    C = high-value: AHEAD>0, files in src/ or supabase/, no open PR, not WIP-heavy
    D = medium-value: AHEAD>0, files in src/ or supabase/, has open PR still
    E = migrations: HAS_MIGRATIONS=sim AND not already in A/B
    F = WIP/draft heavy (WIP_COUNT > 10 and not E)
    G = other: AHEAD>0 but only config/infra files
    """
    ahead = safe_int(r['AHEAD'])
    behind = safe_int(r['BEHIND'])
    files_changed = safe_int(r['FILES_CHANGED'])
    insertions = safe_int(r['INSERTIONS'])
    wip_count = safe_int(r['WIP_COUNT'])
    cherry_all_minus = r['CHERRY_ALL_MINUS'].strip().lower() == 'sim'
    has_migrations = r['HAS_MIGRATIONS'].strip().lower() == 'sim'
    files_list = r['FILES_LIST'].strip()

    # Check files content
    files = [f for f in files_list.split('|') if f.strip()]
    has_src = any(f.startswith('src/') for f in files)
    has_supabase = any(f.startswith('supabase/') for f in files)
    has_real_code = has_src or has_supabase
    only_config = files and not has_real_code

    # PR info
    pr_state = pr_info.get('state', '') if pr_info else ''
    pr_merged = pr_info.get('merged', False) if pr_info else False
    pr_number = pr_info.get('number', None) if pr_info else None
    has_open_pr = pr_state == 'open'

    # --- Classification ---

    # A: merged / no exclusive commits
    if cherry_all_minus or ahead == 0:
        cat = 'A'
        score = 0
        return cat, score

    # From here: ahead > 0 and not cherry_all_minus

    # E: has migrations (high priority regardless)
    if has_migrations:
        cat = 'E'
        score = 10
        score += min(files_changed, 20) * 0.1
        score += 2 if has_src else 0
        score += 3  # migration bonus
        score -= wip_count * 0.1
        score -= 1 if has_open_pr else 0
        return cat, round(score, 2)

    # B: ahead but nothing meaningful changed
    if files_changed == 0 and insertions == 0:
        cat = 'B'
        score = 0
        return cat, score

    # F: WIP heavy (and no migrations)
    if wip_count > 10 and not has_migrations:
        cat = 'F'
        score = 2
        score += min(insertions, 500) * 0.005
        score -= wip_count * 0.1
        return cat, round(score, 2)

    # C: high-value (real code, no open PR or PR was closed without merge)
    if has_real_code and not has_open_pr:
        cat = 'C'
        score = 15
        score += min(files_changed, 50) * 0.2
        score += min(insertions, 1000) * 0.005
        score += 2 if has_src else 0
        score += 2 if not pr_number else -1  # never had PR = likely untouched
        score -= wip_count * 0.2
        score -= min(behind, 500) * 0.002  # older = lower
        return cat, round(score, 2)

    # D: has open PR (still unmerged)
    if has_real_code and has_open_pr:
        cat = 'D'
        score = 10
        score += min(files_changed, 50) * 0.15
        score += min(insertions, 1000) * 0.004
        score += 1 if has_src else 0
        score -= wip_count * 0.2
        score -= min(behind, 500) * 0.002
        return cat, round(score, 2)

    # G: other (ahead, has files, but only config/infra)
    cat = 'G'
    score = 3
    score += min(files_changed, 20) * 0.05
    score -= wip_count * 0.1
    return cat, round(score, 2)


classified = []
for r in rows:
    branch = r['BRANCH'].strip()
    pr_info = prs.get(branch)
    cat, score = classify_and_score(r, pr_info)

    pr_number = pr_info.get('number', '') if pr_info else ''
    pr_state = pr_info.get('state', '') if pr_info else ''
    pr_title = pr_info.get('title', '') if pr_info else ''
    pr_merged = pr_info.get('merged', False) if pr_info else False

    classified.append({
        'branch': branch,
        'prefix': r['PREFIX'].strip(),
        'last_commit': r['LAST_COMMIT'].strip(),
        'first_exclusive_date': r['FIRST_EXCLUSIVE_DATE'].strip(),
        'authors': r['AUTHORS'].strip(),
        'ahead': safe_int(r['AHEAD']),
        'behind': safe_int(r['BEHIND']),
        'merge_base': r['MERGE_BASE'].strip(),
        'files_changed': safe_int(r['FILES_CHANGED']),
        'insertions': safe_int(r['INSERTIONS']),
        'deletions': safe_int(r['DELETIONS']),
        'files_list': r['FILES_LIST'].strip(),
        'commit_msgs': r['COMMIT_MSGS'].strip(),
        'wip_count': safe_int(r['WIP_COUNT']),
        'has_migrations': r['HAS_MIGRATIONS'].strip(),
        'migration_files': r['MIGRATION_FILES'].strip(),
        'cherry_all_minus': r['CHERRY_ALL_MINUS'].strip(),
        'category': cat,
        'score': score,
        'pr_number': pr_number,
        'pr_state': pr_state,
        'pr_title': pr_title,
        'pr_merged': pr_merged,
    })

# Sort by score desc within C/D/E/G, then A, B, F last
def sort_key(x):
    cat_order = {'C': 0, 'E': 1, 'D': 2, 'G': 3, 'F': 4, 'B': 5, 'A': 6}
    return (cat_order.get(x['category'], 9), -x['score'])

classified.sort(key=sort_key)

# Count by category
from collections import Counter
cat_counts = Counter(x['category'] for x in classified)
print("\nCategory counts:")
for cat in ['A', 'B', 'C', 'D', 'E', 'F', 'G']:
    print(f"  {cat}: {cat_counts.get(cat, 0)}")
print(f"  TOTAL: {sum(cat_counts.values())}")

# Save branches.json
json_path = os.path.join(INV_DIR, "branches.json")
with open(json_path, 'w') as f:
    json.dump(classified, f, indent=2, ensure_ascii=False)
print(f"\nSaved {json_path}")

# Save branches.csv
csv_path = os.path.join(INV_DIR, "branches.csv")
fieldnames = ['branch','prefix','last_commit','first_exclusive_date','authors',
              'ahead','behind','files_changed','insertions','deletions',
              'has_migrations','wip_count','cherry_all_minus',
              'category','score','pr_number','pr_state','pr_title']
with open(csv_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(classified)
print(f"Saved {csv_path}")

# Save top30.txt — only C/D/E categories
candidates = [x for x in classified if x['category'] in ('C', 'D', 'E')]
top30 = candidates[:30]
top30_path = os.path.join(INV_DIR, "top30.txt")
with open(top30_path, 'w') as f:
    for x in top30:
        f.write(x['branch'] + '\n')
print(f"Saved {top30_path} ({len(top30)} entries)")

# Print TOP 30 for reference
print("\n=== TOP 30 CANDIDATES ===")
for i, x in enumerate(top30, 1):
    print(f"{i:2d}. [{x['category']}] score={x['score']:6.2f} ahead={x['ahead']:3d} files={x['files_changed']:3d} wip={x['wip_count']:2d} pr={x['pr_number'] or '-':>5} {x['branch'][:60]}")
