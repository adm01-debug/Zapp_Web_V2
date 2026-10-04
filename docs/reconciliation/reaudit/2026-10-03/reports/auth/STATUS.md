# Checkpoint reauditoria Auth/usuários/Team Chat/Contatos

Fonte: HEAD da307ba5626dce892f0b37cb6762463f55d14a96. Só análise; nenhuma alteração na fonte, chamada ao banco vivo ou leitura de segredo.

Revisão semântica em andamento: fluxos Auth/MFA/Passkeys/reset, controles admin, papel/permissão, sessão/perfil, consumidores Team Chat, Contatos e ponte CRM/Singu. Achados materiais comunicados ao coordenador; probes offline em preparação. Este checkpoint não é o relatório final.

Confirmados por leitura: verificador WebAuthn ignora prova criptográfica; handoff de passkey só inicia OTP; guardas não aplicam AAL; logout forçado/sessões públicas não revogam Auth; corrida de fetchProfile; reset anônimo incompatível com profiles RLS e aprovação que não envia email; troca de role não atômica; sucesso falso PermissionMatrix; rascunho Team Chat atravessa conversas; ações sidebar VIP/archive/block são somente toasts; tags em lote ignoram erros.

A integração CRM360 antiga requer sucessão por tarefa: componentes T1/T2/T5 existem, gate/contrato migraram de telefone externo para ID canônico via gateway. Não abrir automaticamente seis achados novos.
