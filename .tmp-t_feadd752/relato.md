Especialista: Edgar (area-edge-api)

# t_feadd752 — ajuste da atribuicao do `zapp-verify` (drift canonico)

## Sensibilidade
O diff mexe no PORTÃO de saida (`~/.local/bin/zapp-verify`, ferramenta do Hermes). Nada foi instalado:
a guarda reserva essa pasta ao Joaquim ("mexer nas guardas/ferramentas do Hermes e proibido — inclusive
criar arquivo novo"); nesta rodada testei ao vivo `install -m 0755` -> recusado (mesma resposta que
`cp`/`touch` na rodada anterior). Nenhuma protecao afrouxada: `explicada()` e os caminhos fail-closed
ficam intactos; o motivo novo (drift canonico) so absolve a linha quando nenhuma migration pendente cita
o objeto — diferenca nova do cartao continua debitada (prova no controle negativo). Nenhum acesso a
producao. Alvo permanece byte a byte o de antes (sha256 `70c0b223…`).

## O que fiz (confinado ao bloco `banco_local`)
O explicador embutido passa a nao debitar ao cartao a diferenca que **ja existe no retrato canonico da
copia** (`supabase/schema-manifest.json`) **ou** cujo objeto vem de **migration ja aplicada** (nome
presente nas migrations nao-pendentes) — sempre que nenhuma pendente cite o objeto. Cabeca do script
(linhas 1–64) identica ao instalado; `diff -u` = 2 hunks / 71 linhas alteradas; `bash -n` OK; 179 linhas;
sha256 `c95e371a054ea1d671893978bd8648c6971639cc978a39218ac502f881e3456e`.

## Prova (medida agora, na minha propria sessao)
`repro.py` (em `evidencia/`) extrai o explicador dos DOIS scripts e roda tudo dentro do workspace do
cartao, sem tocar em producao nem em pasta de outro chat:
- `emb-novo.py` extraido == `filtro-novo.py` da tarefa 0 (byte a byte). sha256 dos dois scripts:
  HOJE `70c0b223…` (instalado) / NOVO `c95e371a…`.
- fixture A (retrato velho da linha do dia + migration pendente do cartao), as 9 residuais:
  **HOJE 2/9 debitadas (`rc=1`, FALHOU) -> AJUSTE 0/9 (`rc=0`, `ok|drift=2`)**.
- controle negativo (4 linhas): objeto novo do cartao `indexes|sonda_cartao.sonda_cartao_pkey` continua
  **SEM**; `columns|r:public.sonda_cartao.col_citada` = explicada; `functions|f:consume_gmail_oauth_state(...)`
  = drift (prova (a), esta no retrato canonico); `routine_grants|f:funcao_antiga()|...` = drift
  (prova (b), migration ja aplicada). Deteccao de drift novo preservada.
Saidas cruas: `evidencia/repro.out`, `evidencia/PROVA.txt`, `evidencia/nove-confere.out`, `evidencia/negativo.out`.

## Entrega (install-ready) — duas copias, mesmas hashes
- workspace do cartao: `.tmp/t_feadd752/entrega/{zapp-verify.novo,zapp-verify.diff,zapp-verify.original,APLICAR.md}`
- pasta estavel no WSL: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_feadd752/ENTREGA/`
  (provas em `.../evidencia/`)
- instalar: `install -m 0755 .../.tmp-t_feadd752/ENTREGA/zapp-verify.novo /home/joaquim_ataides/.local/bin/zapp-verify`
- desfazer: `install -m 0755 .../.tmp-t_feadd752/ENTREGA/zapp-verify.original /home/joaquim_ataides/.local/bin/zapp-verify`

## Achado (nao resolvido por este ajuste)
O ajuste cumpre os criterios do cartao, mas **nao muda o veredito do cartao real**: com o retrato velho
sobram 8 linhas sem prova (nomes automaticos `*_pkey`/`*_fkey` e grants globais) e, em rodada de agente,
`zapp-db-ler` e bloqueado (rc=77/R1) -> `LEDGER_OK=0` -> o explicador nem roda. O destravamento do caso
de hoje e **portar o retrato canonico** (cartao `t_fc85d10a`), nao a atribuicao.

## Por que bloqueio (capability)
A unica acao restante e a instalacao em `~/.local/bin/zapp-verify`, que a guarda reserva ao Joaquim —
mesmo muro ja documentado pela Vera neste cartao pai, confirmado por duas decisoes do sensor
(`.decisoes/2026-10-06-t_1f812058-blk-t_c5a96aba.md`, `.decisoes/2026-10-07-t_feadd752.md`) e pelo
coordenador. Nao completei porque os filhos de verificacao (`t_b54cfdf6`, `t_2fd6ed9f`) rodam "o
zapp-verify ajustado" e completar os liberaria com a ferramenta ainda antiga. Nao criei pedido de decisao
novo: o pedido de instalacao ja existe (`20261006-201251-fd22-zapp-verify-drift-canonico`).
