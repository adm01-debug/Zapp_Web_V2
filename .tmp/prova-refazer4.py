#!/usr/bin/env python3
"""Prova do refazer 4 (cartao t_fddcdda2) — pontos 1 e 3 da recusa.

Ponto 1: o passo novo do db-guard.yml tem de passar ASSUME_RETURN_TEST_POSTGRES_IMAGE
         a partir de ${{ env.POSTGRES_TEST_IMAGE }}, igual ao passo vizinho do TALK ME —
         sem isso o contrato roda com imagem flutuante, fora da imagem fixa do DB Guard.
Ponto 3: o cabecalho do teste tem de citar o cartao real desta linhagem
         (t_675d0cac / t_7602496c), nao o t_4e49a6dc.

Uso: prova-refazer4.py <raiz-com-.github-e-scripts>
"""
import re
import sys
from pathlib import Path

import yaml

raiz = Path(sys.argv[1]).resolve()
wf = yaml.safe_load((raiz / ".github/workflows/db-guard.yml").read_text(encoding="utf-8"))
teste_txt = (raiz / "scripts/db-audit/assume-return-conversation.test.sh").read_text(encoding="utf-8")
wf_txt = (raiz / ".github/workflows/db-guard.yml").read_text(encoding="utf-8")

falhas = []
passos = []
for jnome, job in wf.get("jobs", {}).items():
    for passo in job.get("steps", []) or []:
        passos.append((jnome, job, passo))


def passo(nome):
    for _jnome, _job, p in passos:
        if p.get("name") == nome:
            return p
    return None


def job_do_passo(nome):
    for jnome, job, p in passos:
        if p.get("name") == nome:
            return jnome, job
    return None, None


def checa(cond, rotulo):
    print(("[OK]   " if cond else "[FALHA] ") + rotulo)
    if not cond:
        falhas.append(rotulo)


# A) a imagem do JOB que roda este contrato esta fixada por digest
_alvo_nome = "Simular assumir e devolver conversa por fila"
_jnome, _job = job_do_passo(_alvo_nome)
env_job = (_job or {}).get("env", {}) or {}
pin = str(env_job.get("POSTGRES_TEST_IMAGE", ""))
checa(bool(re.fullmatch(r"[^@\s]+@sha256:[a-f0-9]{64}", pin)),
      "A) job '%s' fixa POSTGRES_TEST_IMAGE por digest: %s" % (_jnome, pin[:46] + "..."))

# B) o passo deste cartao passa a variavel que o script le
alvo = "Simular assumir e devolver conversa por fila"
p = passo(alvo)
checa(p is not None, "B0) existe o passo '%s' no db-guard.yml" % alvo)
if p:
    env_passo = p.get("env", {}) or {}
    checa(env_passo.get("ASSUME_RETURN_TEST_POSTGRES_IMAGE") == "${{ env.POSTGRES_TEST_IMAGE }}",
          "B) passo passa ASSUME_RETURN_TEST_POSTGRES_IMAGE=${{ env.POSTGRES_TEST_IMAGE }} (imagem fixa do job)")
    checa("assume-return-conversation.test.sh" in str(p.get("run", ""))
          and "retry-disposable-postgres-test.sh" in str(p.get("run", "")),
          "C) passo roda o teste deste cartao pelo wrapper retry-disposable-postgres-test.sh")

# D) paridade com o passo vizinho do TALK ME
vizinho = passo("Simular fila, autorização e aceite concorrente do TALK ME")
checa(vizinho is not None and (vizinho.get("env", {}) or {}).get("TALK_ME_TEST_POSTGRES_IMAGE")
      == "${{ env.POSTGRES_TEST_IMAGE }}",
      "D) paridade: o passo vizinho do TALK ME usa a mesma forma")

# E) o script le exatamente essa variavel
checa(bool(re.search(r'postgres_image="\$\{ASSUME_RETURN_TEST_POSTGRES_IMAGE:-', teste_txt)),
      "E) o script do teste le ASSUME_RETURN_TEST_POSTGRES_IMAGE (o nome que o passo passa)")

# F) cabecalho cita o cartao real desta linhagem
primeira_linhas = "\n".join(teste_txt.splitlines()[:3])
checa("t_675d0cac" in primeira_linhas and "t_7602496c" in primeira_linhas,
      "F) cabecalho do teste cita o cartao real da linhagem (t_675d0cac / t_7602496c)")
checa("t_4e49a6dc" not in teste_txt,
      "G) o cartao antigo t_4e49a6dc nao aparece mais no teste")

# H) a variavel aparece uma vez so no workflow (sem duplicata nem passo orfao)
checa(wf_txt.count("ASSUME_RETURN_TEST_POSTGRES_IMAGE") == 1,
      "H) ASSUME_RETURN_TEST_POSTGRES_IMAGE aparece exatamente 1x no workflow")

print("\nRESULTADO: %d falha(s)" % len(falhas))
sys.exit(1 if falhas else 0)
