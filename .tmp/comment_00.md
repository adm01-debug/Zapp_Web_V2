workersql
BLOQUEIO DE INFRA (verificado agora, somente leitura, nada alterado) — worker (sql).

SINTOMA
`hermes-tarefa-iniciar Zapp_Web_V2 auditoria-config-operacional` sai com exit 75 e a mensagem:
"CONGELADO: o modo V1 (push/PR/merge/migration/deploy por tarefa) está suspenso pela Arquitetura V2. Estacione... e pare."
Logo não consigo abrir workspace nem, pelo mesmo guard, rodar `hermes-tarefa-fechar`.

CAUSA APURADA (primeira mão)
- `hermes-tarefa-iniciar` aborta cedo quando o marcador `~/.local/libexec/hermes-guard/MODO_V2` está ausente e `CONGELADO` presente.
- `MODO_V2`: ausente. `CONGELADO`: presente desde 04/10 11:22.
- Último workspace de qualquer agente nasceu 10:39; o diretório do guard mudou às 10:45 -> a fábrica inteira parou, não é defeito deste cartão.

EFEITO NESTE CARTÃO
As 18 tentativas anteriores e esta registram `exit_code 75` rotulado pelo dispatcher como "rate-limited (quota wall)". Aqui 75 é o exit do CONGELADO: parte dessas mortes é o bloqueio de infra, não cota do provedor.

JÁ REGISTRADO (não duplico a decisão)
Várias decisões abertas hoje entre 11:13 e 11:30 (ex.: 20261014-111329-2607, 20261014-113055-1263-sem-tarefa) pedem ao dono restaurar `MODO_V2` ou confirmar congelamento intencional. Também o cartão t_bbf7a369 (hugo) já traz o diagnóstico completo.

NÃO CONTORNEI: não recriei o marcador nem burlei o guard (proibido: mexer no kit de guardas é do Claude/Joaquim).
O cartão em si está pronto para executar: migration aditiva + gatilhos de auditoria (queues, queue_members, vínculo canal-fila, rate_limit_configs) + teste db-audit, nos arquivos que o cartão permite.