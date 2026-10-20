# feat(db): trilha de auditoria da configuração operacional (filas, membros, vínculo canal-fila, rate limit)

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
