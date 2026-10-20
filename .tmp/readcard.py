import sqlite3, sys
db = "/home/joaquim_ataides/.hermes/cache/kb-read/kanban.db"
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
try:
    cur = con.execute("select id,title,status,assignee,body from tasks where id='t_a8be1908'")
    r = cur.fetchone()
    if not r:
        print("NO ROW; tasks:", con.execute("select count(*) from tasks").fetchone()[0])
    else:
        print("TITLE:", r["title"])
        print("STATUS:", r["status"], "ASSIGNEE:", r["assignee"])
        print("BODY:")
        print(r["body"])
except Exception as e:
    print("ERR", e)
    print([x[0] for x in con.execute("select name from sqlite_master where type='table'")])
