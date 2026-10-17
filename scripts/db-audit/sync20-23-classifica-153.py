#!/usr/bin/env python3
"""SYNC20-23 - classificacao das 153 migrations sem ledger (arquivo em origin/main,
versao ausente do ledger do canonico). Le a arvore .tmp/origin-tree. Heuristica declarada.

Classes (efeito sobre o que JA existe):
  NO-OP      - nada executavel (so comentario/vazio)
  DESTRUTIVA - apaga dado/objeto (drop table/column/schema/type, truncate, delete from)
  CONTRATIVA - tira ou muda acesso/contrato existente (revoke, drop policy/trigger/index/function,
               alter column type, set not null, rename, add constraint, disable rls)
  CORRETIVA  - reescreve definicao existente (create or replace function/view, create or replace
               policy) ou nome de conserto (fix/reconcili/harden/corrig), sem destruir nem revogar
  ADITIVA    - so acrescenta (create table/column/policy/index/trigger/type, insert de seed)
Nao edita nada e nao aplica nada."""
import json, os, re, csv, collections

ROOT = ".tmp/origin-tree"  # produza com: mkdir -p .tmp/origin-tree && git archive origin/main supabase/migrations | tar -x -C .tmp/origin-tree
dados = json.load(open(".tmp/sem-ledger.json"))
versoes = dados["versoes"]

DESTRUTIVO = [(r"\bdrop\s+table\b", "DROP TABLE"), (r"\bdrop\s+column\b", "DROP COLUMN"),
              (r"\btruncate\b", "TRUNCATE"), (r"\bdelete\s+from\b", "DELETE"),
              (r"\bdrop\s+schema\b", "DROP SCHEMA"), (r"\bdrop\s+type\b", "DROP TYPE")]
CONTRATIVO = [(r"\brevoke\b", "REVOKE"), (r"\bdrop\s+policy\b", "DROP POLICY"),
              (r"\bdrop\s+trigger\b", "DROP TRIGGER"), (r"\bdrop\s+index\b", "DROP INDEX"),
              (r"\bdrop\s+function\b", "DROP FUNCTION"),
              (r"\balter\s+table[^;]*\bdrop\s+constraint\b", "DROP CONSTRAINT"),
              (r"\balter\s+column[^;]*\bset\s+not\s+null\b", "SET NOT NULL"),
              (r"\balter\s+column[^;]*\btype\b", "ALTER TYPE"),
              (r"\balter\s+table[^;]*\brename\b", "RENAME"),
              (r"\brename\s+(?:column|constraint|to)\b", "RENAME"),
              (r"\balter\s+table[^;]*\badd\s+constraint\b", "ADD CONSTRAINT"),
              (r"\bdisable\s+row\s+level\s+security\b", "DISABLE RLS"),
              (r"\balter\s+default\s+privileges[^;]*\brevoke\b", "ALTER DEFAULT PRIVILEGES")] 
CORRETIVO = [(r"\bcreate\s+or\s+replace\s+function\b", "CREATE OR REPLACE FUNCTION"),
             (r"\bcreate\s+or\s+replace\s+view\b", "CREATE OR REPLACE VIEW")]
ADITIVO = [(r"\bcreate\s+table\b", "CREATE TABLE"), (r"\badd\s+column\b", "ADD COLUMN"),
           (r"\bcreate\s+policy\b", "CREATE POLICY"), (r"\bcreate\s+index\b", "CREATE INDEX"),
           (r"\bcreate\s+trigger\b", "CREATE TRIGGER"), (r"\bcreate\s+function\b", "CREATE FUNCTION"),
           (r"\bcreate\s+type\b", "CREATE TYPE"), (r"\bcreate\s+view\b", "CREATE VIEW"),
           (r"\binsert\s+into\b", "INSERT"), (r"\bgrant\b", "GRANT")]
NOME_CONSERTO = re.compile(r"fix|corrig|reconcili|harden|hotfix|patch|segur|security|rls|revoke|purge", re.I)
AREA = [("talkx", "talkx/campanhas"), ("campaign", "talkx/campanhas"), ("segment", "talkx/campanhas"),
        ("gmail", "email/gmail"), ("email", "email/gmail"), ("contact", "contatos"), ("contato", "contatos"),
        ("search", "busca/search"), ("busca", "busca/search"), ("rls", "seguranca/rls"), ("policy", "seguranca/rls"),
        ("grant", "seguranca/rls"), ("security", "seguranca/rls"), ("secdef", "seguranca/rls"),
        ("sec_", "seguranca/rls"), ("acl", "seguranca/rls"), ("passkey", "auth/sessao"),
        ("session", "auth/sessao"), ("login", "auth/sessao"), ("auth", "auth/sessao"),
        ("storage", "storage/midia"), ("media", "storage/midia"), ("audio", "storage/midia"),
        ("avatar", "storage/midia"), ("crm", "crm/outbox"), ("outbox", "crm/outbox"),
        ("gamif", "gamificacao"), ("xp", "gamificacao"), ("team_chat", "times/team chat"), ("team_", "times/team chat"),
        ("realtime", "realtime"), ("sla", "filas/sla/ops"), ("queue", "filas/sla/ops"), ("agent", "filas/sla/ops"),
        ("cron", "filas/sla/ops"), ("webhook", "filas/sla/ops"), ("dashboard", "dashboard/metricas"),
        ("metric", "dashboard/metricas"), ("message", "mensagens/inbox"), ("inbox", "mensagens/inbox"),
        ("conversation", "mensagens/inbox"), ("multiplix", "multiplix"), ("catalog", "catalogo"),
        ("rate_limit", "catalogo"), ("singu", "singu"), ("feature_flag", "ia/flags"), ("ai_", "ia"),
        ("chatbot", "ia"), ("sentiment", "ia"), ("profile", "perfis/diretorio"), ("department", "perfis/diretorio"),
        ("member", "perfis/diretorio"), ("index", "desempenho/indices"), ("vacuum", "desempenho/indices"),
        ("performance", "desempenho/indices"), ("privileges", "seguranca/rls"), ("settings", "configuracao")]

def area(nome):
    for chave, valor in AREA:
        if chave in nome.lower():
            return valor
    return "nao classificada por nome"

def sem_comentario(sql):
    return re.sub(r"\s+", " ", re.sub(r"--[^\n]*", "", sql).lower())

def classifica(sql, nome):
    corpo = sem_comentario(sql)
    if not re.search(r"\b(create|alter|drop|grant|revoke|insert|update|delete|truncate|comment|do|call|set|notify|refresh)\b", corpo):
        return "NO-OP", ["sem DDL/DML executavel"]
    d = [r for rx, r in DESTRUTIVO if re.search(rx, corpo)]
    c = [r for rx, r in CONTRATIVO if re.search(rx, corpo)]
    a = [r for rx, r in ADITIVO if re.search(rx, corpo)]
    e = [r for rx, r in CORRETIVO if re.search(rx, corpo)]
    if d:
        return "DESTRUTIVA", d + c + e + a
    if c:
        return "CONTRATIVA", c + e + a
    if e or NOME_CONSERTO.search(nome):
        return "CORRETIVA", e + a
    if a:
        return "ADITIVA", a
    return "CORRETIVA", ["efeito nao casado pelas regras (revisar)"]

RX_OBJ = [(r"create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)", "fn"),
          (r"create\s+function\s+(?:public\.)?([a-z0-9_]+)", "fn"),
          (r"create\s+or\s+replace\s+view\s+(?:public\.)?([a-z0-9_]+)", "view"),
          (r"create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-z0-9_]+)", "tabela"),
          (r"alter\s+table(?:\s+if\s+exists)?\s+(?:public\.)?([a-z0-9_]+)", "tabela"),
          (r"create\s+(?:unique\s+)?index(?:\s+concurrently)?(?:\s+if\s+not\s+exists)?\s+([a-z0-9_]+)\s+on\s+(?:public\.)?([a-z0-9_]+)", "indice"),
          (r"create\s+policy\s+\"?([a-z0-9_ ]+)\"?\s+on\s+(?:public\.)?([a-z0-9_]+)", "policy"),
          (r"create\s+trigger\s+([a-z0-9_]+)\s+.*?on\s+(?:public\.)?([a-z0-9_]+)", "trigger"),
          (r"drop\s+(?:function|table|policy|trigger|type|index)\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)", "drop"),
          (r"insert\s+into\s+(?:public\.)?([a-z0-9_]+)", "insert"),
          (r"update\s+(?:public\.)?([a-z0-9_]+)\s+set", "update"),
          (r"delete\s+from\s+(?:public\.)?([a-z0-9_]+)", "delete"),
          (r"create\s+type\s+(?:public\.)?([a-z0-9_]+)", "tipo")]

def objetos(sql):
    corpo = sem_comentario(sql)
    achados = []
    for rx, tipo in RX_OBJ:
        for m in re.finditer(rx, corpo):
            nome = [g for g in m.groups() if g][-1]
            par = f"{tipo}:{nome}"
            if par not in achados:
                achados.append(par)
    return achados

linhas = []
for v in sorted(dados["sem_ledger"]):
    arq = versoes[v][0]
    sql = open(os.path.join(ROOT, arq), encoding="utf-8", errors="replace").read()
    diretorio = os.path.dirname(arq).replace("supabase/migrations", "").strip("/") or "raiz"
    classe, motivos = classifica(sql, os.path.basename(arq))
    arquivada = diretorio.split("/")[0] in ("_superseded", "_foreign", "archive")
    if arquivada:
        classe += "/ARQUIVADA"
    corpo = sem_comentario(sql)
    linhas.append({
        "versao": v, "arquivo": os.path.basename(arq), "diretorio": diretorio, "area": area(os.path.basename(arq)),
        "classificacao": classe, "motivos": "|".join(dict.fromkeys(motivos)),
        "objetos": "|".join(objetos(sql)[:8]), "toca_dado": "sim" if re.search(r"\b(insert|update|delete|truncate)\b", corpo) else "nao",
        "mexe_acl": "sim" if re.search(r"\b(grant|revoke)\b", corpo) else "nao",
        "mexe_rls": "sim" if re.search(r"row\s+level\s+security|create\s+policy|drop\s+policy", corpo) else "nao",
        "idempotente": "sim" if re.search(r"if\s+not\s+exists|or\s+replace|if\s+exists|to_regclass|to_regprocedure", corpo) else "nao",
        "tem_rollback": "sim" if re.search(r"--\s*rollback", sql, re.I) else "nao",
        "entra_no_replay": "nao (subdir nao lido pelo replay)" if arquivada else "sim",
        "linhas_sql": sql.count("\n") + 1,
    })

with open("scripts/db-audit/SYNC20-23-153-CLASSIFICACAO-2026-10-17.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(linhas[0].keys()))
    w.writeheader(); w.writerows(linhas)

print("total", len(linhas))
print("por classe:", dict(collections.Counter(l["classificacao"] for l in linhas).most_common()))
print("por diretorio:", dict(collections.Counter(l["diretorio"] for l in linhas)))
print("rollback explicito:", sum(1 for l in linhas if l["tem_rollback"] == "sim"),
      "| idempotentes:", sum(1 for l in linhas if l["idempotente"] == "sim"),
      "| toca_dado:", sum(1 for l in linhas if l["toca_dado"] == "sim"),
      "| mexe_acl:", sum(1 for l in linhas if l["mexe_acl"] == "sim"),
      "| mexe_rls:", sum(1 for l in linhas if l["mexe_rls"] == "sim"))
print("--- por area ---")
for k, n in collections.Counter(l["area"] for l in linhas).most_common():
    print(f"  {n:3d} {k}")
print("--- as 4 de IA citadas pelo coordenador ---")
for v in ("20261015211127", "20261006203249", "20261011150527", "20261013213816"):
    alvo = [l for l in linhas if l["versao"] == v]
    print(v, alvo[0]["classificacao"] if alvo else "NAO ESTA NAS 153",
          (alvo[0]["motivos"] if alvo else ""), (alvo[0]["objetos"] if alvo else ""))
