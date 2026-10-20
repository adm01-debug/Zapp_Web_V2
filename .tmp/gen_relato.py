# -*- coding: utf-8 -*-
import re
from pathlib import Path

W = Path("/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/a2e44b38-2610152334b8a8")
T = W / ".tmp"
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def ler(nome):
    return ANSI.sub("", (T / nome).read_text(encoding="utf-8")).rstrip("\n")


guarda = ler("saida-guarda.txt")
base = ler("saida-guarda-base.txt")
vermelho = ler("saida-guarda-vermelho.txt")
diffestado = ler("diff-estado.txt")
linhas = ler("estado-linhas.txt")
diffant = ler("diff-vs-anterior.txt")
deno = ler("deno.txt")

MARKS = ("\u2714", "\u2716", "\u2139")
guarda_curto = "\n".join(l for l in guarda.splitlines() if l[:1] in MARKS or "AssertionError" in l)
verm_top = "\n".join(l for l in vermelho.splitlines() if l[:1] in MARKS)
base_curto = "\n".join(l for l in base.splitlines() if l[:1] in MARKS)
i = vermelho.find("AssertionError [ERR_ASSERTION]: ESTADO.md não tem linha")
verm_msg = vermelho[i:i + 240].split("\n      at ")[0].rstrip()
deno_sum = [l for l in deno.splitlines() if l.startswith("ok |")][-1]

relato = f"""Especialista: senior (area-edge-api)

RESPOSTA CURTA, NA ORDEM DOS PONTOS

Recusa anterior (a que numerou 1 a 4):
- Ponto 1: RESOLVIDO — a recusa pediu para mover a linha do `ESTADO.md` para a posição alfabética e colar a saída literal da guarda. Antes a linha ficava entre `ai-suggest-reply` (ESTADO.md:60) e `ai-transcribe-audio` (ESTADO.md:61). Agora está em ESTADO.md:65, depois de `auto-close-conversations` (ESTADO.md:64) e antes de `batch-fetch-avatars` (ESTADO.md:66).
- Ponto 2: RESOLVIDO — nenhuma lista de órfãs foi alterada. O diff de ESTADO.md é 4 inserções e 3 remoções (`git diff --numstat`: `4 3 ESTADO.md`), nas linhas 7 (Base: 81→82), 40 (grupo A: 54→55), 45 (total: 81→82) e 65 (linha nova) — as quatro linhas estão impressas no bloco D. `## Órfãs (17) — GATE B` (ESTADO.md:134) NÃO aparece no diff.
- Ponto 3: RESOLVIDO — arquivo:linha citados nos Pontos 1 e 2 e provados no bloco D, com o diff literal do ESTADO.md no bloco E.
- Ponto 4: RESOLVIDO — a frase "10 casos de teste novos medidos pelo juiz" saiu do relato. O número real: 13 casos em `supabase/functions/automation-suggest-reply/index.test.ts` (Deno.test nas linhas 135, 148, 168, 183, 203, 227, 241, 262, 280, 297, 312, 331, 343) e `deno test` → `{deno_sum}` (bloco F).

Recusa atual (rodada 2 de 2), itens 1 a 5 do cartão:
1. Ponto 4 da recusa: 13 casos — feito (Ponto 4 acima, bloco F).
2. Ponto 3 da recusa: arquivo:linha do ESTADO.md — feito: ESTADO.md:7, ESTADO.md:40, ESTADO.md:45, ESTADO.md:65 (bloco D).
3. Ponto 1 da recusa: posição alfabética, dito de forma explícita — feito (Ponto 1 acima).
4. Ponto 2 da recusa: nenhuma lista de órfãs alterada — feito (Ponto 2 acima).
5. Recusa respondida ponto a ponto ("Ponto k: resolvido") + `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` rodado de novo com a saída literal — feito (acima e bloco A).
Escopo: só o relato mudou nesta rodada. Os outros 3 arquivos do diff vieram inteiros do trabalho anterior (`git cherry-pick cb6557bb0`) e não foram editados (bloco G).

A) SAÍDA LITERAL — `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` (diff final desta entrega)
{guarda_curto}

A guarda fecha `pass 9` / `fail 2`, e as 2 falhas são de OUTRAS edges, não desta:
  * `âncora desatualizada: src/hooks/integrations/useKnowledgeBase.ts:99 não cita ai-kb-ingest` (linha do ESTADO.md que eu não toco)
  * `grupo de create-user divergiu dos chamadores reais: {{"A":[],"B":[],"C":[],"D":[]}}`
As duas já existem na base `dia/2026-10-15` SEM o meu diff (bloco C). O teste que cobre esta entrega — `ESTADO.md lista exatamente as edges que existem no repositório` — passa aqui e falha sem a linha nova (bloco B).

B) VERMELHO SEM A CORREÇÃO — linha de `automation-suggest-reply` removida do ESTADO.md (edge presente no disco)
{verm_top}

Asserção literal do teste que cobre esta entrega:
{verm_msg}
(no vermelho os contadores são `pass 7` / `fail 4`; as outras 2 falhas são as mesmas do bloco A)

C) AS 2 FALHAS SÃO PRÉ-EXISTENTES NA BASE — a mesma guarda sem o meu diff (edge removida do disco e ESTADO.md restaurado para `dia/2026-10-15`), mesmos nomes de teste, mesmos contadores:
{base_curto}

D) AS QUATRO LINHAS CITADAS, impressas por número (`awk 'NR==7||NR==40||NR==45||NR==65' ESTADO.md`):
{linhas}

E) DIFF LITERAL DO ESTADO.md (`git diff dia/2026-10-15...HEAD -- ESTADO.md`) — 4 inserções, 3 remoções:
{diffestado}
Cabeçalhos dos blocos: `@@ -4,7 +4,7 @@` (Base), `@@ -37,12 +37,12 @@` (grupo A e total) e `@@ -62,6 +62,7 @@` (linha nova). O bloco `-37,12` cobre as linhas 37 a 48, logo as duas linhas trocadas são a 40 (`| A | 55 |`) e a 45 (`| **total** | **82** |`); o bloco `-62,6` acrescenta a linha 65. Não há bloco entre 48 e 62 nem depois de 68: nada mais do ESTADO.md mudou nesta entrega.

F) 13 CASOS — `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/automation-suggest-reply/index.test.ts`, última linha da saída:
{deno_sum}
O teste importa o handler real (`./index.ts`, linhas 25-29 do arquivo de teste); nenhum caso é mock do comportamento testado.

G) NADA ALÉM DO RELATO (conferido contra o trabalho anterior):
- `git diff cb6557bb0 HEAD -- supabase/functions/automation-suggest-reply/` → VAZIO: index.ts e index.test.ts byte a byte iguais aos da entrega anterior.
- `git diff cb6557bb0 HEAD -- ESTADO.md` → 1 linha, e ela NÃO é minha: a base `dia/2026-10-15` já trazia `AudioMessagePlayer.tsx:62` (outro cartão atualizou o número da âncora). O cherry-pick não tocou essa linha; a versão do dia é a que fica. As 4 linhas do meu escopo estão no bloco E.

H) CRITÉRIO DE PRONTO 2 — `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (120s)`: OK dependencias, OK db_guard, OK tipos (114s), OK lint, OK migrations.

ARQUIVOS DO DIFF (`git diff --name-only dia/2026-10-15...HEAD`, colado):
.tmp/relato.md
ESTADO.md
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts
`git diff --numstat`: 123/0 .tmp/relato.md · 4/3 ESTADO.md · 355/0 index.test.ts · 348/0 index.ts — 41.181 caracteres (limite 90.000).

ACHADO FORA DO ESCOPO (não corrigido): a guarda `docs-estado-registry-convention` está vermelha na base `dia/2026-10-15` por duas edges de outros cartões — âncora de `ai-kb-ingest` em `src/hooks/integrations/useKnowledgeBase.ts:99` e o grupo publicado de `create-user` (o bloco C prova que é anterior ao meu diff). Corrigir isso exige mexer no ESTADO.md, que esta recusa proíbe. Registrado em comentário no cartão.
"""

(T / "relato.md").write_text(relato, encoding="utf-8")
print("bytes:", len(relato.encode("utf-8")))
print("linhas:", relato.count("\n") + 1)
