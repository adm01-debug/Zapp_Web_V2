#!/usr/bin/env python3
import sys, json
p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
txt = d['result']['content'][0]['text']
lines = txt.split('\n')
a = int(sys.argv[2]) if len(sys.argv) > 2 else 0
b = int(sys.argv[3]) if len(sys.argv) > 3 else len(lines)
for l in lines[a:b]:
    print(l)
