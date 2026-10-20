import sqlite3
db = "/home/joaquim_ataides/.hermes/cache/kb-read/kanban.db"
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
print([x[0] for x in con.execute("select name from sqlite_master where type='table'")])
for t in ("comments","task_comments"):
    try:
        rows = list(con.execute(f"select * from {t} where task_id='t_a8be1908' order by rowid"))
        print("==",t,len(rows))
        for r in rows:
            print({k: (str(r[k])[:1500]) for k in r.keys()})
    except Exception as e:
        print(t, "ERR", e)
