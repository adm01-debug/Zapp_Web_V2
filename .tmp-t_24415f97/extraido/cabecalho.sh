log() { echo "$(date -Is) $*" | cut -c1-600 | tee -a "$LOG"; }
campo() { python3 -c "import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2],''))
except Exception: print('')" "$1" "$2"; }
