import sqlite3, pathlib
db = "/home/joaquim_ataides/.hermes/cache/kb-read/kanban.db"
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
out = pathlib.Path(".tmp")
row = con.execute("select title, body from tasks where id='t_a8be1908'").fetchone()
out.joinpath("card.md").write_text("# " + row["title"] + "\n\n" + (row["body"] or ""), encoding="utf-8")
for i, c in enumerate(con.execute("select author, body, created_at from task_comments where task_id='t_a8be1908' order by id")):
    out.joinpath("comment_%02d.md" % i).write_text(c["author"] + "\n" + c["body"], encoding="utf-8")
print("ok", row["title"], len(row["body"] or ""))
