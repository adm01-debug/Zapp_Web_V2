import pathlib,sys,json
root=pathlib.Path("/workspace/scratch/f8f9b9cbce53/reaudit/source")
log=pathlib.Path(__file__).with_name("read-journal.jsonl")
for arg in sys.argv[1:]:
    parts=arg.split(":"); path=parts[0]; text=(root/path).read_text(); lines=text.splitlines(); start=int(parts[1]) if len(parts)>1 else 1; end=min(int(parts[2]),len(lines)) if len(parts)>2 else len(lines)
    print("\nFILE",path, "LINES",start,end)
    for n in range(start,end+1): print(f"{n:4d} {lines[n-1]}")
    with log.open("a") as f:f.write(json.dumps({"path":path,"start":start,"end":end,"total_lines":len(lines)})+"\n")
