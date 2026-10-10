#!/usr/bin/env bash
# Prova (offline, deterministica) do ajuste de atribuicao do zapp-verify.
# Nao edita ~/.local/bin (guardado ao Joaquim): trabalha sobre as copias originais e ajustadas.
# Reusa o MESMO ambiente de ensaio da tarefa 0 (t_4df2fc8d): arvore-A (retrato velho),
# arvore-B (retrato fresco), st-A/st-B (check-diferencas real), fixtures.
set -u
ED=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-baseline-t_4df2fc8d/t_feadd752
EV=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-baseline-t_4df2fc8d
P=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/zapp-verify-drift-canonico-261006193749e2
NOVA=20261006204953_multiplix_cascata_bloco_terminal.sql
E="$ED/evidencia"
mkdir -p "$E"

echo "######## 0. entradas ########"
cp -f "$P/.tmp/zapp-verify.original" "$ED/zapp-verify.original"
cp -f "$P/.tmp/zapp-verify.novo"     "$ED/zapp-verify.novo"
sha256sum "$ED/zapp-verify.original" "$ED/zapp-verify.novo" /home/joaquim_ataides/.local/bin/zapp-verify | tee "$E/entradas-e-sha256.txt"
echo "-- bash -n no ajuste --"; bash -n "$ED/zapp-verify.novo" && echo SINTAXE_OK
diff -u "$ED/zapp-verify.original" "$ED/zapp-verify.novo" > "$ED/zapp-verify.diff"; echo "diff-linhas=$(wc -l < "$ED/zapp-verify.diff")"

echo
echo "######## 1. extracao verbatim dos dois explicadores (heredoc do MOTIVO) ########"
python3 - "$ED/zapp-verify.original" "$E/emb-hoje.py" "$ED/zapp-verify.novo" "$E/emb-novo.py" <<'PY'
import sys
src_o, dst_o, src_n, dst_n = sys.argv[1:5]
def extrato(src, dst):
    t = open(src, encoding='utf-8').read().split('\n')
    ini = next(i for i, l in enumerate(t) if 'MOTIVO="$(NOVAS=' in l)
    j = ini
    while "<<'PY'" not in t[j]:
        j += 1
    start = j + 1
    k = start
    while t[k].strip() != 'PY':
        k += 1
    open(dst, 'w', encoding='utf-8').write('\n'.join(t[start:k]) + '\n')
    print('%s -> %s (%d linhas)' % (src, dst, k - start))
extrato(src_o, dst_o)
extrato(src_n, dst_n)
PY
sha256sum "$E/emb-hoje.py" "$E/emb-novo.py" | tee -a "$E/entradas-e-sha256.txt"

echo
echo "######## 2. classificacao POR LINHA (HOJE x AJUSTE) sobre o MESMO check real ########"
W="$EV/arvore-A" ST="$EV/st-A" NOVAS="$NOVA" python3 "$E/classifica.py" "$E/emb-hoje.py" > "$E/A-hoje.out"
W="$EV/arvore-A" ST="$EV/st-A" NOVAS="$NOVA" python3 "$E/classifica.py" "$E/emb-novo.py" > "$E/A-novo.out"
W="$EV/arvore-B" ST="$EV/st-B" NOVAS="$NOVA" python3 "$E/classifica.py" "$E/emb-hoje.py" > "$E/B-hoje.out"
W="$EV/arvore-B" ST="$EV/st-B" NOVAS="$NOVA" python3 "$E/classifica.py" "$E/emb-novo.py" > "$E/B-novo.out"
for f in A-hoje A-novo B-hoje B-novo; do echo "--- $f ---"; head -4 "$E/$f.out"; done

echo
echo "######## 3. as 9 residuais: HOJE debitadas x AJUSTE nao debitadas ########"
python3 "$E/confere-nove.py" "$E/A-hoje.out" "$E/A-novo.out" "$EV/nove-residuais.txt" | tee "$E/nove-confere.out"

echo
echo "######## 4. bloco banco_local REAL extraido dos dois scripts (bash -n) ########"
sed -n '8,29p'  "$ED/zapp-verify.original" >  "$E/bloco-hoje.sh"
sed -n '35,124p' "$ED/zapp-verify.original" >> "$E/bloco-hoje.sh"
bash -n "$E/bloco-hoje.sh" && echo "bloco-hoje SINTAXE_OK ($(wc -l < "$E/bloco-hoje.sh") linhas)"
sed -n '8,29p'  "$ED/zapp-verify.novo" >  "$E/bloco-novo.sh"
sed -n '35,173p' "$ED/zapp-verify.novo" >> "$E/bloco-novo.sh"
bash -n "$E/bloco-novo.sh" && echo "bloco-novo SINTAXE_OK ($(wc -l < "$E/bloco-novo.sh") linhas)"
echo "cabeca original x novo (1..34) identica?"
diff <(sed -n '1,34p' "$ED/zapp-verify.original") <(sed -n '1,34p' "$ED/zapp-verify.novo") && echo "CABECA IDENTICA"
