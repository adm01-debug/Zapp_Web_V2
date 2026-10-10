#!/usr/bin/env bash
# t_24415f97 — colhe a evidência (linhas reais dos logs), sem redigitar nada.
SB="/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_24415f97"
L=/home/joaquim_ataides/arquitetura-v2/integrador/integrar.sh
R=/home/joaquim_ataides/projetos/Zapp_Web_V2
OUT="$SB/out/EVIDENCIA.txt"
{
echo "EVIDENCIA — t_24415f97 — verificacao independente das rotas de conferencia da BASE"
echo "gerada em $(date -Is)"
echo
echo "1) ARQUIVO VERIFICADO"
printf '   %s\n' "$(md5sum "$L")" "$(wc -l < "$L") linhas; bash -n: $(bash -n "$L" && echo OK)"
echo "   ExecStart do servico que o roda: $(grep -h ExecStart /home/joaquim_ataides/.config/systemd/user/v2-integrador.service)"
echo "   git status: $(git -C /home/joaquim_ataides/arquitetura-v2 status --porcelain -- integrador/integrar.sh)"
printf '   referencia (anterior, sem a correcao): %s\n' "$(md5sum "$SB/pristine.sh" | cut -d' ' -f1) $(wc -l < "$SB/pristine.sh") linhas"
echo
echo "2) PONTOS QUE RODAM zapp-verify (arquivo vivo)"
grep -n 'zapp-verify full' "$L" | grep -v '^ *[0-9]*:#' | sed 's/^/   /'
echo "   pontos antigos da BASE (arquivo de referencia):"
grep -n 'zapp-verify full "\$INT"' "$SB/pristine.sh" | sed 's/^/   /'
echo
echo "3) PARES REAIS USADOS (copia de referencia, somente leitura)"
echo "   COM migration: 689345d7f -> $(git -C "$R" diff --name-only --diff-filter=AM 'dia/2026-10-04...689345d7f' -- supabase/migrations)"
echo "   SEM migration: 05859cedf -> [$(git -C "$R" diff --name-only --diff-filter=AM 'dia/2026-10-04...05859cedf' -- supabase/migrations | tr '\n' ' ')]"
echo
echo "4) MATRIZ (argv efetivo de cada cenario + rota escolhida)"
for f in "$SB"/out/p*-cmd.log; do
  n="$(basename "$f" -cmd.log)"
  echo "   --- $n ---"
  sed 's/^/      /' "$f"
  grep -hE 'conferida COM o conjunto|conferida sem banco' "$SB/out/$n-integrar.log" 2>/dev/null | sed 's/^/      log: /'
done
echo
echo "5) EFEITO DA ROTA SEM NOME (zapp-verify real, ~/.local/bin/zapp-verify linha 35-37 e 178)"
sed -n '36,37p;178p' /home/joaquim_ataides/.local/bin/zapp-verify | sed 's/^/   /'
echo "   log REAL da base de 07/10 10:52 (rodada anterior a correcao):"
grep -nE 'AVISO|VERIFY:' /home/joaquim_ataides/arquitetura-v2/integrador/.verificacao-da-base.log | sed 's/^/   /'
echo
echo "6) MANIFESTO DA EXTRACAO"
sed 's/^/   /' "$SB/extraido/MANIFESTO.txt"
} > "$OUT"
echo "escrito: $OUT ($(wc -c < "$OUT") bytes)"
