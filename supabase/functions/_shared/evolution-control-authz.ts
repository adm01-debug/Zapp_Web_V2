/**
 * Matriz de autorização das ações de controle da Evolution (R2-API-001, P1).
 *
 * Defeito que este módulo fecha: `evolution-api` tinha um gate global que só
 * validava `getUser` — qualquer usuário autenticado (inclusive `agent` sem
 * nenhum papel de gestão) executava ações de CONTROLE (set-webhook, disconnect,
 * restart-instance, update-privacy, alterações de perfil/grupos, integrações)
 * e envios diretos, sem checar papel nem escopo de conexão.
 *
 * Regra agora:
 *   - `control` → exige papel admin/supervisor (`is_admin_or_supervisor`). No
 *     modelo single-tenant (IA-004 §5) esse papel é, por definição, o escopo
 *     de conexão global (§6.5: ver/editar conexão é admin/supervisor), então a
 *     exigência simultânea "papel + escopo da conexão" é satisfeita por um só
 *     predicado.
 *   - `send`    → exige admin/supervisor OU visibilidade do contato alvo
 *     (`is_contact_visible_to_user`), resolvida pelo chamador.
 *   - `read`    → qualquer usuário autenticado (comportamento atual preservado;
 *     a leitura sensível de diagnóstico é tratada separadamente em
 *     `webhook-diagnostic`).
 *
 * A matriz vive aqui, em função pura, para ser testada sem subir o handler e
 * para o gate de catálogo continuar vendo os literais de RPC no chamador.
 */

export type EvolutionActionKind = 'control' | 'send' | 'read';

/**
 * Ações que mudam estado/configuração da conexão, da instância, da conta ou das
 * integrações do provedor. Toda escrita de configuração passa a exigir
 * admin/supervisor — leitura (`get-*`) continua liberada para autenticados.
 */
export const CONTROL_ACTIONS: ReadonlySet<string> = new Set([
  // instância / conexão
  'bootstrap-instance-token',
  'create-instance',
  'create-connection',
  'delete-instance',
  'restart-instance',
  'disconnect',
  'set-presence',
  'set-settings',
  'set-webhook',
  // perfil da conta
  'update-profile-name',
  'update-profile-status',
  'update-profile-picture',
  'remove-profile-picture',
  'update-privacy',
  // grupos
  'create-group',
  'update-group-name',
  'update-group-description',
  'update-participants',
  'update-group-setting',
  'revoke-invite-code',
  'accept-invite',
  'leave-group',
  'update-group-picture',
  'toggle-ephemeral',
  // etiquetas / templates / bloqueio
  'handle-label',
  'update-block-status',
  'create-template',
  'delete-template',
  // integrações (set/delete configuram o provedor)
  'set-chatwoot', 'delete-chatwoot',
  'set-typebot', 'delete-typebot',
  'set-openai', 'delete-openai',
  'set-dify', 'delete-dify',
  'set-flowise', 'delete-flowise',
  'set-evolution-bot', 'delete-evolution-bot',
  'set-rabbitmq', 'set-sqs', 'set-proxy',
  'set-evoai', 'delete-evoai',
  'set-n8n', 'delete-n8n',
  'set-kafka', 'set-nats', 'set-pusher',
]);

/**
 * Envios diretos com destinatário (número). Exigem acesso ao contato/conexão —
 * a decisão de autorização/entrega canônica (`enqueue_outbound_message`) já
 * valida o contato no caminho normal do navegador; aqui a action deixa de ser
 * um bypass para disparar no provedor sem esse gate.
 */
export const SEND_ACTIONS: ReadonlySet<string> = new Set([
  'send-text',
  'send-media',
  'send-audio',
  'send-sticker',
  'send-location',
  'send-contact',
  'send-poll',
  'send-list',
  'send-buttons',
  'send-template',
  'send-ptv',
  'offer-call',
  'send-chat-presence',
]);

export function classifyEvolutionAction(action: string): EvolutionActionKind {
  if (CONTROL_ACTIONS.has(action)) return 'control';
  if (SEND_ACTIONS.has(action)) return 'send';
  return 'read';
}

export type EvolutionAuthzDecision =
  | { allowed: true }
  | { allowed: false; status: 403; message: string };

/** Decisão de autorização de uma ação de CONTROLE (papel admin/supervisor). */
export function decideControlAuthz(isAdminOrSupervisor: boolean): EvolutionAuthzDecision {
  if (isAdminOrSupervisor) return { allowed: true };
  return {
    allowed: false,
    status: 403,
    message: 'Apenas administradores ou supervisores podem executar esta ação.',
  };
}

/** Decisão de autorização de um ENVIO direto (admin/supervisor OU contato visível). */
export function decideSendAuthz(opts: {
  isAdminOrSupervisor: boolean;
  contactVisible: boolean;
}): EvolutionAuthzDecision {
  if (opts.isAdminOrSupervisor || opts.contactVisible) return { allowed: true };
  return {
    allowed: false,
    status: 403,
    message: 'Sem permissão para enviar para este contato/conexão.',
  };
}
