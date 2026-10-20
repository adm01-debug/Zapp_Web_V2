Task t_a8be1908: feat(db): trilha de auditoria da configuração operacional (filas, membros, vínculo canal-fila, rate limit)
  status:    running
  assignee:  workersql
  workspace: scratch @ C:\Users\Joaquim Ataides\AppData\Local\hermes\kanban\boards\zapp-web-v2\workspaces\t_a8be1908
  max-retries: 2 (default)
  created:   2026-10-13 08:52 by claude
  started:   2026-10-13 16:35

Body:
ESPECIALISTA DA ÁREA: workersql (banco de dados, migrations e RLS). Abra a skill de área do seu perfil antes de editar. Comece o relato com a linha `Especialista: workersql`.
Origem: SEGUNDA passada da auditoria de paridade V3 -> V2 do documento docs/estado/25-hooks-raiz-3.md da V3 (13/10/2026; a primeira passada é da sessão dos cartões PE-nn; comparação função por função, evidência arquivo:linha nos dois lados) e pedido do Joaquim ("crie os cards, delegue aos agentes especializados"). Antes de mexer, confira no código ATUAL da branch do dia o que já existe; reaproveite e relate. Se a lacuna já estiver resolvida, escreva isso em .tmp/relato.md com a prova e feche sem commit de código. Regras do dono: a função de TAGS/ETIQUETAS foi retirada de todas as implementações (nunca use nem crie etiqueta); nenhuma informação sai do sistema (sem exportar, baixar, copiar para fora ou imprimir); Zapp não importa nem exporta contatos e edição de contato é do Singu; toda tela nova só para os papéis indicados e com RLS no banco; módulo Pagamentos removido; IMAP/SMTP fora.

REGRAS DE BANCO: migration ADITIVA em supabase/migrations/ (timestamp posterior ao último). RLS ligada em toda tabela nova, com política explícita (nada de USING (true)). Funções SECURITY DEFINER com SET search_path = pg_catalog, public e checagem de auth.uid(); GRANT só ao papel necessário (REVOKE do público). Papéis: usar is_admin(), is_admin_or_supervisor() ou has_role(). Nenhum dado pessoal (telefone, texto de mensagem) em log ou auditoria. Siga o fluxo de banco do repositório (docs/hermes/FLUXO-HERMES.md, scripts/db-audit, db:guard, ledger de migrations) e atualize os tipos gerados no mesmo cartão. Teste de permissão obrigatório: quem pode, quem não pode e anônimo.

PROBLEMA
FATOS: components/security/AuditLogDashboard.tsx:41-44 só filtra contact/message/campaign/user/settings; lib/audit.ts:5-24 declara connection_created, connection_deleted, transfer e settings_changed, mas grep desses nomes em src não acha nenhum emissor. Os únicos gatilhos de auditoria no banco são user_roles, role_permissions, endereço/exclusão de contatos e department_audit_logs: mudança de fila, de membros, de regra de roteamento, de rate_limit_configs e de conexão não deixa rastro. A V3 audita service_channel, queue, channel_queue, sticky_assignment e message_reaction (hooks/useOpsAuditLogs.ts:16-22). Coordenar com PE-19 (allowlist do log_audit_event): as novas ações entram na lista. Não depende de service_channels (fora por DE6). ANTES de codar, confira nos cartões abertos e na branch do dia se algo já cobre isto; se cobrir, relate com a prova e ajuste só o que faltar.

O QUE FAZER
1. Gatilhos (ou RPC de escopo fechado) gravam em audit_logs para queues, queue_members, vínculo conexão-fila e rate_limit_configs, com autor, ação e diff mínimo sem dado sensível; ações novas na allowlist.
2. Teste db-audit: cada mudança gera uma linha com o autor certo; usuário comum não forja.

ARQUIVOS QUE PODE TOCAR
- supabase/migrations/ (novo)
- supabase/tests/ ou scripts/db-audit/
- src/integrations/supabase/types.ts (gerado)

CRITÉRIO DE PRONTO
1. Mudança operacional deixa rastro confiável.
2. zapp-verify . --rapido verde.


Latest summary:
Infra do dono: o marcador ~/.local/libexec/hermes-guard/MODO_V2 está ausente (só CONGELADO, desde 04/10), então hermes-tarefa-iniciar e hermes-tarefa-fechar saem com exit 75 "CONGELADO" — sem workspace não há como editar nem entregar. A fábrica inteira está parada desde 14/10 ~10:45 (último workspace 10:39). Não contornei o guard (é do Claude/Joaquim). Até as 18 tentativas anteriores deste cartão foram rotuladas "rate-limited", mas 75 aqui é o exit do CONGELADO. Já há várias decisões abertas (11:13–11:30) e o diagnóstico completo no cartão t_bbf7a369. Falta: restaurar MODO_V2 ou confirmar congelamento. Cartão pronto para executar assim que liberado: migration aditiva + gatilhos de auditoria (queues, queue_members, vínculo canal-fila, rate_limit_configs) + teste db-audit.

Comments (3):
  [2026-10-14 11:31] workersql: BLOQUEIO DE INFRA (verificado agora, somente leitura, nada alterado) — worker (sql).

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
  [2026-10-15 14:15] default: UNBLOCK: guarda restaurada (MODO_V2 voltou): retomar a abertura/fechamento do cartao
  [2026-10-15 18:31] workersql: Handoff (fora da minha area) — allowlist do `log_audit_event` (cartao PE-19).

O cartao pede que as acoes novas entrem na allowlist do `log_audit_event`, que e do PE-19. As 11 acoes que os gatilhos desta entrega gravam (vocabulario documentado no cabecalho da migration `20261015211601_auditoria_config_operacional.sql`):

- queues: `queue_created`, `queue_updated`, `queue_deleted`
- queue_members: `queue_member_created`, `queue_member_updated`, `queue_member_deleted`
- whatsapp_connection_queues: `connection_queue_linked`, `connection_queue_unlinked`, `connection_queue_updated`
- rate_limit_configs: `rate_limit_config_created`, `rate_limit_config_updated`, `rate_limit_config_deleted`

Quem edita o `src/lib/audit.ts`/allowlist: incluir essas acoes. Nao toquei em `src/**` (fora da minha area) nem no `log_audit_event` (o registrador generico do cliente).

Events (241):
  [2026-10-15 18:12] [run 18640] heartbeat
  [2026-10-15 18:13] [run 18640] heartbeat
  [2026-10-15 18:14] [run 18640] heartbeat
  [2026-10-15 18:15] [run 18640] heartbeat
  [2026-10-15 18:16] [run 18640] heartbeat
  [2026-10-15 18:17] [run 18640] heartbeat
  [2026-10-15 18:18] [run 18640] heartbeat
  [2026-10-15 18:19] [run 18640] heartbeat
  [2026-10-15 18:20] [run 18640] heartbeat
  [2026-10-15 18:21] [run 18640] heartbeat
  [2026-10-15 18:22] [run 18640] heartbeat
  [2026-10-15 18:23] [run 18640] heartbeat
  [2026-10-15 18:24] [run 18640] heartbeat
  [2026-10-15 18:25] [run 18640] heartbeat
  [2026-10-15 18:26] [run 18640] heartbeat
  [2026-10-15 18:27] [run 18640] heartbeat
  [2026-10-15 18:28] [run 18640] heartbeat
  [2026-10-15 18:29] [run 18640] heartbeat
  [2026-10-15 18:30] [run 18640] heartbeat
  [2026-10-15 18:31] commented {'author': 'workersql', 'len': 862}

Runs (20):
  #12737 rate_limited @workersql  39s  2026-10-13 16:35
        ! pid 41728 exited rate-limited (quota wall) — requeued without counting a failure
  #12909 rate_limited @workersql  46s  2026-10-13 16:42
        ! pid 36780 exited rate-limited (quota wall) — requeued without counting a failure
  #13073 rate_limited @workersql  34s  2026-10-13 16:48
        ! pid 29500 exited rate-limited (quota wall) — requeued without counting a failure
  #13299 rate_limited @workersql  35s  2026-10-13 16:55
        ! pid 40100 exited rate-limited (quota wall) — requeued without counting a failure
  #13526 rate_limited @workersql  55s  2026-10-13 17:03
        ! pid 8708 exited rate-limited (quota wall) — requeued without counting a failure
  #13707 rate_limited @workersql  36s  2026-10-13 17:09
        ! pid 32596 exited rate-limited (quota wall) — requeued without counting a failure
  #13880 rate_limited @workersql  28s  2026-10-13 17:15
        ! pid 43908 exited rate-limited (quota wall) — requeued without counting a failure
  #14044 rate_limited @workersql  38s  2026-10-13 17:20
        ! pid 43328 exited rate-limited (quota wall) — requeued without counting a failure
  #14223 rate_limited @workersql  34s  2026-10-13 17:26
        ! pid 41972 exited rate-limited (quota wall) — requeued without counting a failure
  #14396 rate_limited @workersql  34s  2026-10-13 17:32
        ! pid 41452 exited rate-limited (quota wall) — requeued without counting a failure
  #14573 rate_limited @workersql  45s  2026-10-13 17:38
        ! pid 37156 exited rate-limited (quota wall) — requeued without counting a failure
  #14752 rate_limited @workersql  34s  2026-10-13 17:44
        ! pid 26272 exited rate-limited (quota wall) — requeued without counting a failure
  #14933 rate_limited @workersql  35s  2026-10-13 17:50
        ! pid 32496 exited rate-limited (quota wall) — requeued without counting a failure
  #15143 rate_limited @workersql  35s  2026-10-13 17:57
        ! pid 31120 exited rate-limited (quota wall) — requeued without counting a failure
  #15339 rate_limited @workersql  22s  2026-10-13 18:03
        ! pid 17932 exited rate-limited (quota wall) — requeued without counting a failure
  #15531 rate_limited @workersql  67s  2026-10-13 18:10
        ! pid 40828 exited rate-limited (quota wall) — requeued without counting a failure
  #15738 rate_limited @workersql  34s  2026-10-13 18:17
        ! pid 38128 exited rate-limited (quota wall) — requeued without counting a failure
  #15918 rate_limited @workersql  38s  2026-10-13 18:23
        ! pid 31144 exited rate-limited (quota wall) — requeued without counting a failure
  #16612 blocked      @workersql  116s  2026-10-14 11:29
        → Infra do dono: o marcador ~/.local/libexec/hermes-guard/MODO_V2 está ausente (só CONGELADO, desde 04/10), então hermes-tarefa-iniciar e hermes-tarefa-fechar sae
  #18640 running      @workersql  active  2026-10-15 18:08
