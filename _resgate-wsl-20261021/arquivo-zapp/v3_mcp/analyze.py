#!/usr/bin/env python3
"""Analise local dos corpos das funcoes candidatas (somente leitura)."""
import re, glob, json, sys

SENS = re.compile(r'(?i)\b(evolution_[a-z0-9_]*|profiles|contacts|contact_notes|cookies_config|cookie_probe_log|whatsapp_connections|login_attempts|gmail_accounts|decrypted_secrets|evolution_instance_credentials)\b')
COLS = re.compile(r'(?i)\b(phone|telefone|email|e_mail|full_name|push_name|nome|cpf|documento|content|message|payload|token|api_key|secret|remote_jid|jid|participants)\b')
FROM = re.compile(r'(?i)\b(from|join|update|insert\s+into|delete\s+from)\s+([a-z_][a-z0-9_]*[.][a-z_][a-z0-9_]*|[a-z_][a-z0-9_]*)')

def load():
    funcs = {}
    for f in sorted(glob.glob('/home/joaquim_ataides/projetos/_arquivo_zapp/v3_mcp/batches/t*.jstn')):
        txt = open(f, encoding='utf-8').read()
        parts = txt.split('=== ')
        for p in parts[1:]:
            head, _, body = p.partition('\n')
            funcs[head.strip()] = body
    return funcs

if __name__ == '__main__':
    funcs = load()
    mode = sys.argv[1] if len(sys.argv) > 1 else 'index'
    if mode == 'index':
        print('TOTAL', len(funcs))
        for h in sorted(funcs):
            b = funcs[h]
            rels = sorted(set(m[1] for m in FROM.findall(b)))
            sens = sorted(set(r[0] for r in SENS.findall(b)))
            wr = sorted(set(m[1] for m in re.findall(r'(?i)\b(insert\s+into|update|delete\s+from)\s+([a-z_][a-z0-9_]*[.][a-z_][a-z0-9_]*|[a-z_][a-z0-9_]*)', b)))
            cols = sorted(set(c.lower() for c in COLS.findall(b)))
            print(f'{h} | read={",".join(sens) or "-"} | write={",".join(wr) or "-"} | cols={",".join(cols)}')
    elif mode == 'show':
        for h in sys.argv[2:]:
            for k in funcs:
                if k.startswith(h):
                    print('=== ' + k)
                    print(funcs[k])
