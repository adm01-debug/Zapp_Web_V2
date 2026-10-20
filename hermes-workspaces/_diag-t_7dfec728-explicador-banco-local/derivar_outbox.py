#!/usr/bin/env python3
"""Fixture derivada: so as linhas do diff REAL que pertencem ao cartao do
ai_usage_outbox (as que o log de 07/10 09:11 reporta), mantendo o padrao exato
do arquivo real. Serve para comparar a assinatura com a do log medido."""
import io
import os

AQUI = os.path.dirname(os.path.abspath(__file__))
F = os.path.join(AQUI, "fixture-real")
DEST = os.path.join(AQUI, "fixture-outbox", "estado")
os.makedirs(DEST, exist_ok=True)

alvos = ("rls|ai_usage_outbox", "indexes|ai_usage_outbox.", "constraints|relation:ai_usage_outbox.",
         "columns|ai_usage_outbox.", "defaults|ai_usage_outbox.", "policies|ai_usage_outbox.",
         "relation_grants|r:public.ai_usage_outbox|")
linhas = [l for l in
          io.open(os.path.join(F, "estado", "check-diferencas.txt"), encoding="utf-8").read().split("\n")
          if l.strip()]
sel = [l for l in linhas if l.startswith(alvos)]
with io.open(os.path.join(DEST, "check-diferencas.txt"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(sel) + "\n")
print("linhas do diff real: %d; so as do ai_usage_outbox: %d" % (len(linhas), len(sel)))
for l in sel:
    print("  " + l)
