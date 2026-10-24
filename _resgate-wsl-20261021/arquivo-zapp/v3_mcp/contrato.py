import re
import subprocess

# ---- contratos VIVOS (catalogo) ----
live = {}
for v in ["zapp_dash_daily","zapp_dash_heatmap","zapp_dash_overview","zapp_dash_top_contacts","zapp_inbox_threads","v_cookie_health"]:
    sql = ("SELECT string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod), ',' ORDER BY a.attnum) "
           "FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
           "WHERE n.nspname='zapp' AND c.relname='%s' AND a.attnum>0 AND NOT a.attisdropped" % v)
    out = subprocess.run(["python3","q.py","-e",sql],
        cwd="/home/joaquim_ataides/projetos/_arquivo_zapp/v3_mcp",
        capture_output=True, text=True).stdout
    m = re.search(r'\{"string_agg": "([^"]*)"\}', out)
    live[v] = m.group(1) if m else "(NAO MEDIDO)"

snap = "/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V3/views-security-invoker-26092814221805/scripts/decouple/snapshots/zapp_schema_snapshot.sql"
txt = open(snap, encoding="utf-8").read()

# ---- contratos do snapshot PRE-mudanca (aspas duplas, ex: 'day'::date) ----
def snap_cols(view):
    i = txt.find("CREATE OR REPLACE VIEW zapp.%s WITH" % view)
    if i < 0:
        return "(nao encontrado)"
    j = txt.find(";", i)
    blk = txt[i:j]
    return blk

print("=== CONTRATO VIVO (catalogo) ===")
for k, v in live.items():
    print("%-22s %s" % (k, v))

print()
print("=== CONTRATO PRE-MUDANCA (snapshot do repo) ===")
pre = {
 "zapp_dash_daily": "day:date,total:bigint,sent:bigint,received:bigint,chats:bigint",
 "zapp_dash_heatmap": "dow:integer,hour:integer,n:bigint",
 "zapp_dash_overview": "data_until:timestamptz,msgs_7d:bigint,msgs_prev_7d:bigint,chats_7d:bigint,chats_prev_7d:bigint,sent_7d:bigint,recv_7d:bigint,contacts_total:bigint",
 "zapp_dash_top_contacts": "remote_jid:text,full_name:varchar(255),push_name:varchar(255),profile_picture_url:text,msg_count:bigint,last_msg_at:timestamptz",
 "zapp_inbox_threads": "remote_jid:text,content:text,message_type:varchar(50),from_me:boolean,created_at:timestamptz,msg_push_name:text,full_name:varchar(255),push_name:varchar(255),company:varchar(255),tags:text[],profile_picture_url:text,total_messages:integer",
}
norm = lambda s: s.replace("timestamp with time zone","timestamptz").replace("character varying","varchar").replace("integer","integer")
for k, v in pre.items():
    lv = norm(live[k])
    pv = norm(v)
    print("%-22s igual=%s" % (k, lv == pv))
    if lv != pv:
        print("   vivo:", lv)
        print("   pre :", pv)

# ---- baseline: entradas efetivas como o workflow monta ----
b = open("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V3/views-security-invoker-26092814221805/scripts/sql/views-security-invoker.baseline", encoding="utf-8").read()
entries = [l for l in b.splitlines() if l.strip() and not l.startswith("#")]
print()
print("baseline entradas efetivas (como o workflow monta):", len(entries), entries)
