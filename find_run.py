import json, sys
data = json.load(sys.stdin)
target = None
if len(sys.argv) > 1:
    target = int(sys.argv[1])
for r in data:
    num = r.get('number')
    if target is None or num == target:
        print(r.get('number'), r.get('databaseId'), (r.get('headSha') or '')[:10], r.get('event'), r.get('status'), r.get('conclusion'), r.get('createdAt'))
