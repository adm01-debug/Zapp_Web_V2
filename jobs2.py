#!/usr/bin/env python3
import json, sys
data = json.load(sys.stdin)
for j in data:
    print(j.get('name'), '|', j.get('conclusion'), '|', j.get('databaseId'))
