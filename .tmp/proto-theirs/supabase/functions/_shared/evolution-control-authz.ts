/**
 * Matriz de autorização das ações de controle da Evolution (R2-API-001, P1).
 *
 * Defeito que este módulo fecha: `evolution-api` tinha um gate global que só
 * validava `getUser` — qualquer usuário autenticado (inclusive `agent` sem
 * nenhum papel de gestão) executava ações de CONTROLE (set-webhook, disconnect,
 * restart-instance, update-privacy, alterações de perfil/grupos, integrações)
 * e envios diretos, sem checar papel nem escopo de conexão.
 *
 * Regra agora (DENY BY DEFAULT):
 *   - `control` → exige papel admin/supervisor (`is_admin_or_supervisor`). No
 *     modelo single-tenant (IA-004 §5) esse papel é, por definição, o escopo
 *     de conexão global (§6.5: ver/editar conexão é admin/supervisor), então a
 *     exigência simultânea "papel + escopo da conexão" é satisfeita por um só
 *     predicado.
 *   - `send`    → exige admin/supervisor OU visibilidade do contato alvo
 *     (`is_contact_visible_to_user`), resolvida pelo chamador. Cobre também as
 *     ações de conversa que não entregam conteúdo mas mutam o estado remoto de
 *     um chat (mark-read/unread, archive-chat, send-reaction): o escopo é o
 *     contato da conversa, resolvido por `number` ou pelo JID do alvo.
 *   - `read`    → qualquer usuário autenticado, mas SÓ o que não expõe dado
 *     fora da visibilidade do agente nem configuração/credencial do provedor:
 *     estado da instância (`status`/`instance-info`/`list-instances`, com o
 *     corpo limpo de token/apikey/hash — R2EXT-AGENDA), verificação de número,
 *     leitura de grupos. A leitura sensível de diagnóstico é tratada
 *     separadamente em `webhook-diagnostic`. Somente o que está em READ_ACTIONS.
 *   - Qualquer ação fora dos três conjuntos cai em `control` — ação nova no
 *     handler nasce fechada e só abre quando classificada explicitamente
 *     aqui (o teste de exaustividade em __tests__/evolution-control-authz.test.ts
 *     compara os três conjuntos com todos os `action ===` do handler).
 *
 * A matriz vive aqui, em função pura, para ser testada sem subir o handler e
 * para o gate de catálogo continuar vendo os literais de RPC no chamador.
 */

export type EvolutionActionKind = 'control' | 'send' | 'read';

/**
 * Ações que mudam estado/configuração da conexão, da instância, da conta, das
 * integrações do provedor, disparam automação ou apagam/editam conteúdo de
 * mensagem (trilha de auditoria do chat). Toda escrita de configuração passa a
 * exigir admin/supervisor.
 */
export const CONTROL_ACTIONS: ReadonlySet<string> = new Set([
  // instância / conexão — 'connect' gera o QR e permite parear outro aparelho
  // (e no caminho de sessão órfã recria a instância na GO); 'disconnect' é o
  // logout da sessão no provedor.
  'bootstrap-instance-token',
  'create-instance',
  'create-connection',
  'connect',
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
  // grupos (escrita)
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
  // mensagens — editar/apagar conteúdo (inclusive "para todos") destrói ou
  // reescreve a trilha de mensagens: restrito a admin/supervisor.
  'delete-message',
  'update-message',
  'edit-message',
  'delete-for-everyone',
  // integrações (set/delete configuram o provedor) e gatilhos de automação
  'set-chatwoot', 'delete-chatwoot',
  'set-typebot', 'delete-typebot', 'typebot-change-status', 'start-typebot',
  'set-openai', 'delete-openai',
  'set-dify', 'delete-dify',
  'set-flowise', 'delete-flowise',
  'set-evolution-bot', 'delete-evolution-bot',
  'set-rabbitmq', 'set-sqs', 'set-proxy',
  'set-evoai', 'delete-evoai',
  'set-n8n', 'delete-n8n',
  'set-kafka', 'set-nats', 'set-pusher',
  // R2EXT-AGENDA: leituras de dado instance-wide (fora da visibilidade do
  // agente) e de configuração/credencial do provedor passam a exigir
  // admin/supervisor. Diferente de `send`, não há alvo de conversa único para
  // resolver visibilidade (find-chats/find-contacts/find-messages devolvem a
  // instância inteira — ADR R1EXT-F3) e nenhuma tela da V2 as chama.
  'find-chats', 'find-contacts', 'find-messages', 'find-status-messages',
  'get-media-base64',
  // configuração da instância/conexão
  'get-settings', 'get-webhook',
  // perfil da conta/conexão (config) e de número arbitrário (fora da carteira)
  'fetch-profile', 'fetch-profile-picture', 'fetch-business-profile',
  // etiquetas/templates e integrações do provedor (config/credenciais)
  'find-labels', 'find-templates',
  'get-chatwoot', 'get-typebot', 'typebot-sessions',
  'get-openai', 'get-dify', 'get-flowise', 'get-evolution-bot',
  'get-rabbitmq', 'get-sqs', 'get-proxy', 'get-evoai', 'get-n8n',
  'get-kafka', 'get-nats', 'get-pusher',
  // catálogo de loja (configuração comercial)
  'get-catalog', 'get-collections',
  // R2EXT-STATUS: publicar Status/Story (send-status) NÃO tem contato-alvo — o
  // status vai para toda a base da conexão. Enquanto estava em `send`, a
  // ausência de alvo fazia o gate negar não-admin por acidente, mas a ação
  // seguia com o corpo inteiro (campos livres como allContacts) e sem trilha.
  // Como control, exige admin/supervisor de forma explícita.
  'send-status',
]);

/**
 * Envios diretos com destinatário (número/JID) e mutações de estado de UMA
 * conversa (lida/não-lida, arquivo, reação). Exigem acesso ao contato/conexão —
 * a decisão de autorização/entrega canônica (`enqueue_outbound_message`) já
 * valida o contato no caminho normal do navegador; aqui a action deixa de ser
 * um bypass para disparar no provedor sem esse gate. O alvo é resolvido pelo
 * chamador a partir de `number`, `remoteJid`, `chat` ou `key.remoteJid`; sem
 * alvo resolvível a decisão é negar (fail-safe).
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
  'send-reaction',
  'offer-call',
  'send-chat-presence',
  // mutações de estado da conversa no provedor (não entregam conteúdo, mas
  // seguem o mesmo escopo: o contato da conversa)
  'mark-read',
  'mark-unread',
  'archive-chat',
]);

/**
 * Leituras: GETs e consultas (POST de find/check) que não alteram estado no
 * provedor E não entregam dado fora da visibilidade do agente nem configuração
 * do provedor. Continuam liberadas para qualquer usuário autenticado —
 * inclusive `status` (sonda o estado da instância na GO e espelha em
 * whatsapp_connections; o valor gravado vem da resposta do provedor, não do
 * chamador) e `list-instances` (única ação realmente global do handler). O
 * corpo de `instance-info`/`list-instances` é higienizado de token/apikey/hash
 * antes de sair (R2EXT-AGENDA).
 */
export const READ_ACTIONS: ReadonlySet<string> = new Set([
  // instância (triagem/higienizadas no handler)
  'list-instances',
  'status',
  'instance-info',
  // consultas ao provedor sem alvo de conversa e sem configuração
  'check-numbers',
  // grupos (leitura) — consumidas pelas telas de grupo
  'list-groups',
  'group-info',
  'group-participants',
  'group-invite-code',
  'invite-info',
]);

/**
 * Deny by default: fora dos três conjuntos, a ação é tratada como `control`
 * (exige admin/supervisor). Nada novo passa "de graça" por esquecimento de
 * classificação — e o teste de exaustividade obriga o conjunto a cobrir todos
 * os cases do handler.
 */
export function classifyEvolutionAction(action: string): EvolutionActionKind {
  if (CONTROL_ACTIONS.has(action)) return 'control';
  if (SEND_ACTIONS.has(action)) return 'send';
  if (READ_ACTIONS.has(action)) return 'read';
  return 'control';
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

/**
 * R2EXT-STATUS: allowlist do corpo de `send-status`.
 *
 * O corpo ia inteiro para `/message/sendStatus/<instância>`. Como a ação não
 * tem contato-alvo, o chamador podia empurrar campos livres (ex.: `allContacts`,
 * `statusJidList` com números de fora da empresa) direto para o provedor. Aqui
 * só sobrevivem os campos que o produto usa, com limite de tamanho, e a lista
 * de destinatários é reduzida aos contatos conhecidos da conexão.
 */
export const STATUS_ALLOWED_FIELDS = ['type', 'content', 'media', 'backgroundColor'] as const;

/** Limite de caracteres do texto do status (mesmo teto das demais mensagens de texto). */
export const STATUS_CONTENT_MAX_LENGTH = 1024;

export interface StatusPayloadSanitizeResult {
  /** Corpo já filtrado, pronto para o provedor. */
  payload: Record<string, unknown>;
  /** Campos do chamador descartados por não estarem na allowlist. */
  droppedFields: string[];
  /** Quantidade de JIDs de `statusJidList` descartados por não serem da empresa. */
  droppedJids: number;
  /**
   * `statusJidList` veio preenchido mas NENHUM JID sobreviveu: publicar assim
   * cairia no broadcast para toda a base (fail-open) — o chamador deve negar.
   */
  emptyTargetList: boolean;
}

/** Normaliza JID/telefone para dígitos (mesma regra do handler). */
const normalizeStatusDigits = (value: unknown): string => {
  const raw = String(value ?? '');
  return (raw.includes('@') ? raw.split('@')[0] : raw).replace(/\D/g, '');
};

/**
 * Filtra o corpo de `send-status` pela allowlist e restringe `statusJidList`
 * aos contatos da empresa (`allowedJids`, já em dígitos).
 */
export function sanitizeStatusPayload(
  body: Record<string, unknown>,
  allowedJids: ReadonlySet<string>,
): StatusPayloadSanitizeResult {
  const allowed = new Set<string>(STATUS_ALLOWED_FIELDS);
  const payload: Record<string, unknown> = {};
  const droppedFields: string[] = [];

  for (const [key, value] of Object.entries(body)) {
    // Metadados do contrato E45: não fazem parte do corpo do provedor.
    if (key === 'action' || key === 'instance' || key === 'instanceName') continue;
    if (key === 'statusJidList') continue; // tratado abaixo
    if (!allowed.has(key)) {
      droppedFields.push(key);
      continue;
    }
    if (key === 'content') {
      if (typeof value !== 'string') {
        droppedFields.push(key);
        continue;
      }
      payload.content = value.slice(0, STATUS_CONTENT_MAX_LENGTH);
      continue;
    }
    if (typeof value === 'string') {
      payload[key] = value;
      continue;
    }
    droppedFields.push(key);
  }

  let droppedJids = 0;
  let emptyTargetList = false;
  const rawList = body.statusJidList;
  if (Array.isArray(rawList)) {
    const kept: string[] = [];
    for (const entry of rawList) {
      const jid = String(entry ?? '').trim();
      const digits = normalizeStatusDigits(jid);
      if (jid && digits && allowedJids.has(digits)) kept.push(jid);
      else droppedJids += 1;
    }
    if (kept.length > 0) payload.statusJidList = kept;
    else if (rawList.length > 0) emptyTargetList = true;
  } else if (rawList !== undefined) {
    droppedFields.push('statusJidList');
  }

  return { payload, droppedFields, droppedJids, emptyTargetList };
}
