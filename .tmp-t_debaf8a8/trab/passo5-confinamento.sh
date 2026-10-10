#!/usr/bin/env bash
# t_debaf8a8 - passo 5: confinamento do artefato sob prova (o que eu estou verificando)
set -u
SB=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_debaf8a8
E8=/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA
OUT="$SB/saida"
{
  echo "== hashes =="
  sha256sum "$E8/zapp-verify.original" "$E8/zapp-verify.novo" /home/joaquim_ataides/.local/bin/zapp-verify
  echo
  echo "== semantica (bash -n) =="
  for f in "$E8/zapp-verify.original" "$E8/zapp-verify.novo"; do
    bash -n "$f" && echo "bash -n OK  $f"
  done
  echo
  echo "== hunks do diff =="
  diff -u "$E8/zapp-verify.original" "$E8/zapp-verify.novo" > "$OUT/artefato.diff" || true
  echo "linhas do diff: $(wc -l < "$OUT/artefato.diff")"
  echo "hunks: $(grep -c '^@@' "$OUT/artefato.diff")"
  grep '^@@' "$OUT/artefato.diff"
  echo
  echo "== cabecalho (1-64) identico? =="
  cmp <(head -64 "$E8/zapp-verify.original") <(head -64 "$E8/zapp-verify.novo") && echo "IDEM linhas 1-64"
  echo "tamanho: original=$(wc -l < "$E8/zapp-verify.original") novo=$(wc -l < "$E8/zapp-verify.novo") linhas"
  echo
  echo "== a mudanca toca quais passos do portao? =="
  diff "$E8/zapp-verify.original" "$E8/zapp-verify.novo" | grep -nE '^[<>].*(passo |explicada|drift_canonico|AVISO|FALHOU|MOTIVO)' | head -30
} 2>&1 | tee "$OUT/passo5-confinamento.out"
