Especialista: Edgar (area-edge-api)

t_8d3ddc95 — ajuste da atribuicao do zapp-verify para drift pre-existente, entregue como artefato
install-ready (a guarda do Hermes reserva ~/.local/bin ao Joaquim; a escrita la e recusada, testado
ao vivo). Diff confinado AO arquivo zapp-verify, bloco banco_local: 2 hunks, linhas 1-64 identicas
(`cmp`). Nova `drift_canonico()` deixa de debitar ao cartao a diferenca que ja existe no retrato
canonico da copia (`$W/supabase/schema-manifest.json`) OU vem de migration ja aplicada, quando
nenhuma pendente cita o objeto; `explicada()` e os caminhos fail-closed ficam intactos.

Prova medida (repro.py + testa-ramos.sh; so arquivos, sem banco/producao): as 9 residuais debitadas
HOJE=2 -> NOVO=0; execucao crua HOJE rc=1 (FALHOU) / NOVO rc=0 (ok|drift=2 -> AVISO); controle
negativo `indexes|sonda_cartao.sonda_cartao_pkey` (objeto novo do cartao) continua SEM -> drift novo
segue detectado. Artefato sha256 c95e371a... (`bash -n` OK); instalado hoje segue 70c0b223... (intacto).

Limite honesto: cumpre o cartao mas nao muda o veredito do cartao real — com o retrato velho sobram 8
linhas sem prova e em rodada de agente o zapp-db-ler e bloqueado (rc=77/R1) -> LEDGER_OK=0 -> o
explicador nem roda. O destravamento do caso real e portar o retrato canonico (t_fc85d10a).
