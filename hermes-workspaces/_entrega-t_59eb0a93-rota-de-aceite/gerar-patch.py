#!/usr/bin/env python3
# t_59eb0a93 (run 2094) — gera integrar.sh.novo (rota de aceite) a partir do integrar.sh VIVO,
# sem escrever nada na fabrica. Falha alto se qualquer ancora nao casar exatamente.
# Entrega: integrar-aceite.diff (patch p1 contra ~/arquitetura-v2) + integrar.sh.novo + sha256.
import difflib, hashlib, pathlib, re, sys

DEST = pathlib.Path("/home/joaquim_ataides/hermes-workspaces/_entrega-t_59eb0a93-rota-de-aceite")
VIVO = pathlib.Path("/home/joaquim_ataides/arquitetura-v2/integrador/integrar.sh")
SHA_ESPERADO = "aa79c4a099e5502dc0f41837477e50fd8d469c7527a8d7962eb4d7daeef21e2c"  # medido 07/10 16:52

orig = VIVO.read_text(encoding="utf-8")
sha = hashlib.sha256(orig.encode()).hexdigest()
if sha != SHA_ESPERADO:
    sys.exit(f"ABORTA: integrar.sh vivo divergente. esperado {SHA_ESPERADO} / lido {sha}")

ANCORA = '  if [ $PREVER = 1 ]; then VRC=0    # mesma árvore que o lote verificou: não repete\n'
if orig.count(ANCORA) != 1:
    sys.exit("ABORTA: ancora do portao PREVER nao aparece exatamente 1x")

BLOCO = '''  # 07/10 (t_59eb0a93): ROTA DE ACEITE. O `zapp-verify` já aceita `--aceitar <arq>` (linhas 13-15) e repassa ao
  # `zapp-db-local check`, que compara a estrutura do conjunto com o retrato da produção: toda diferença listada no
  # arquivo deixa de reprovar. A lista é POR CARTÃO ($DIRLOG/aceitar/<id>.txt), montada a partir do estado real daquele
  # cartão, e só é usada quando (a) o cartão traz migration e (b) nenhuma migration pendente está em falhas.tsv — o
  # `--aceitar` pula a conferência de `falhas.tsv` que o caminho estrito faz, então ela é refeita aqui antes. Sem o
  # arquivo, o portão é exatamente o de antes: nenhum cartão que não tenha lista própria muda de comportamento.
  ACE_OPT=()
  if [ -n "$NOMEBD" ] && [ -f "$DIRLOG/aceitar/$ID.txt" ]; then
    OK_ACE=1
    if [ -f "$FAL" ]; then
      FALHAS_MIG="$(cut -f1 "$FAL")"
      for m in $MIGS; do echo "$FALHAS_MIG" | grep -qxF "$(basename "$m")" && OK_ACE=0; done
    else OK_ACE=0; fi
    if [ "$OK_ACE" = 1 ]; then
      ACE_OPT=(--aceitar "$DIRLOG/aceitar/$ID.txt")
      log "$ID: portão final COM lista de aceite ($DIRLOG/aceitar/$ID.txt, $(grep -cvE '^[[:space:]]*(#|$)' "$DIRLOG/aceitar/$ID.txt" 2>/dev/null) diferença(s) esperada(s))"
    else
      log "$ID: lista de aceite presente, mas migration pendente em falhas.tsv (ou estado indisponível): sigo na regra estrita"
    fi
  fi
'''

novo = orig.replace(ANCORA, BLOCO + ANCORA, 1)
assert novo != orig

# as duas chamadas do portao passam a levar a lista (exatamente 2)
alvo = '$NOMEBD >"$DIRLOG/.ultima-verificacao.log"'
sub = '$NOMEBD "${ACE_OPT[@]}" >"$DIRLOG/.ultima-verificacao.log"'
if novo.count(alvo) != 2:
    sys.exit(f"ABORTA: esperava 2 chamadas do portao sem a lista, achei {novo.count(alvo)}")
novo = novo.replace(alvo, sub)

# invariantes do resultado
n_ace = novo.count('"${ACE_OPT[@]}"')
n_gate = len(re.findall(r'zapp-verify full "\$INT" \$NOMEBD', novo))
n_estrito = len(re.findall(r'zapp-verify full "\$INT" \$NOMEBD >', novo))
print(f"invariantes: chamadas do portao={n_gate}  com a lista={n_ace}  sem a lista={n_estrito}")
if (n_gate, n_ace, n_estrito) != (2, 2, 0):
    sys.exit("ABORTA: invariantes quebradas")

(DEST / "integrar.sh.novo").write_text(novo, encoding="utf-8")
sha_novo = hashlib.sha256(novo.encode()).hexdigest()

# patch no formato p1 aplicavel a partir de ~/arquitetura-v2
diff = difflib.unified_diff(
    orig.splitlines(keepends=True), novo.splitlines(keepends=True),
    fromfile="a/integrador/integrar.sh", tofile="b/integrador/integrar.sh", n=3)
(DEST / "integrar-aceite.diff").write_text("".join(diff), encoding="utf-8")

# bloco efetivamente gravado, extraido DO arquivo gerado (para a prova do comportamento)
lin = novo.splitlines(keepends=True)
i0 = next(i for i, l in enumerate(lin) if "# 07/10 (t_59eb0a93): ROTA DE ACEITE" in l)
i1 = next(i for i, l in enumerate(lin) if l == ANCORA)
extraido = "".join(lin[i0:i1])
(DEST / "bloco-no-arquivo.txt").write_text(extraido, encoding="utf-8")
if extraido != BLOCO:
    sys.exit("ABORTA: o bloco extraido do arquivo gerado difere do bloco pretendido")

print(f"base : {VIVO}  {sha}")
print(f"novo : sha256 {sha_novo}  ({len(lin)} linhas, base tinha {len(orig.splitlines())})")
print(f"bloco: {len(BLOCO.splitlines())} linhas, extraido do arquivo gerado = idêntico")
