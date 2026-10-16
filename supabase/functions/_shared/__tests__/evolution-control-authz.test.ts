import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyEvolutionAction,
  decideControlAuthz,
  decideSendAuthz,
  CONTROL_ACTIONS,
  SEND_ACTIONS,
  READ_ACTIONS,
} from "../evolution-control-authz.ts";

// R2-API-001 (P1): a matriz de autorização das ações de controle Evolution.
// Antes da correção, `set-webhook`/`disconnect`/`update-privacy` etc. eram
// classificados como leitura (nenhum gate além do JWT global) — um `agent`
// autenticado disparava I/O no provedor sem papel nem escopo de conexão.
// A matriz é DENY BY DEFAULT: ação fora dos três conjuntos ⇒ 'control'.

Deno.test("classifyEvolutionAction - ações de controle exigem papel (RED→GREEN)", () => {
  // Cada ação citada no aceite do R2-API-001 é de controle.
  for (const action of ["set-webhook", "disconnect", "restart-instance", "update-privacy"]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
  }
  // Alterações de perfil/grupos também são controle.
  for (const action of [
    "update-profile-name", "update-profile-picture", "remove-profile-picture",
    "create-group", "update-participants", "leave-group",
    "handle-label", "update-block-status",
  ]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
  }
});

Deno.test("classifyEvolutionAction - pareamento, logout e edição/exclusão de mensagem são control", () => {
  // 'connect' emite o QR (permite parear outro aparelho na instância) e, no
  // caminho de sessão órfã, recria a instância na GO — nunca livre para agente.
  // 'disconnect' é o logout da sessão. Editar/apagar mensagem destrói a trilha.
  for (const action of ["connect", "disconnect", "delete-message", "update-message", "edit-message", "delete-for-everyone"]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
    assert(CONTROL_ACTIONS.has(action), `${action} deve estar em CONTROL_ACTIONS`);
  }
});

Deno.test("classifyEvolutionAction - ação desconhecida cai em control (deny by default)", () => {
  // Qualquer ação fora dos três conjuntos — inclusive uma ação NOVA adicionada
  // ao handler e ainda não classificada — exige admin/supervisor.
  for (const action of ["acao-que-nao-existe", "delete-everything", "", "GET"]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve cair em control`);
  }
});

Deno.test("classifyEvolutionAction - envios diretos e mutações de conversa são send", () => {
  for (const action of [
    "send-text", "send-media", "send-audio", "send-ptv",
    "send-reaction", "send-status", "send-chat-presence",
    "mark-read", "archive-chat",
  ]) {
    assertEquals(classifyEvolutionAction(action), "send", `${action} deve ser send`);
  }
  assert(SEND_ACTIONS.has("send-text"));
  assert(SEND_ACTIONS.has("send-ptv"));
});

Deno.test("classifyEvolutionAction - leituras com consumidor no front seguem liberadas a autenticados", () => {
  for (const action of [
    "status", "get-settings", "get-webhook", "find-status-messages",
    "list-instances", "fetch-profile", "instance-info", "list-groups",
    "group-info", "invite-info", "fetch-business-profile", "find-labels",
  ]) {
    assertEquals(classifyEvolutionAction(action), "read", `${action} deve ser read`);
    assert(READ_ACTIONS.has(action), `${action} deve estar em READ_ACTIONS`);
  }
});

Deno.test("classifyEvolutionAction - ações removidas no E43 caem em control (deny by default)", () => {
  // SL-075 E43: as ações sem equivalente na GO saíram dos três conjuntos.
  for (const action of [
    "set-chatwoot", "get-typebot", "delete-openai", "set-proxy",
    "find-chats", "get-settings", "send-template", "offer-call",
    "mark-unread", "toggle-ephemeral", "invite-info", "get-catalog",
  ]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve cair em control`);
    assert(!CONTROL_ACTIONS.has(action), `${action} não deve estar em CONTROL_ACTIONS`);
    assert(!SEND_ACTIONS.has(action), `${action} não deve estar em SEND_ACTIONS`);
    assert(!READ_ACTIONS.has(action), `${action} não deve estar em READ_ACTIONS`);

Deno.test("R2EXT-AGENDA: leitura instance-wide e configuração do provedor exigem control", () => {
  // find-chats/find-contacts/find-messages devolvem a instância inteira (sem
  // alvo de conversa para gate por visibilidade) e as demais expõem configuração
  // ou credencial do provedor: todas restritas a admin/supervisor.
  const movedToControl = [
    "find-chats", "find-contacts", "find-messages", "find-status-messages",
    "get-media-base64",
    "get-settings", "get-webhook",
    "fetch-profile", "fetch-profile-picture", "fetch-business-profile",
    "find-labels", "find-templates",
    "get-chatwoot", "get-typebot", "typebot-sessions",
    "get-openai", "get-dify", "get-flowise", "get-evolution-bot",
    "get-rabbitmq", "get-sqs", "get-proxy", "get-evoai", "get-n8n",
    "get-kafka", "get-nats", "get-pusher",
    "get-catalog", "get-collections",
  ];
  for (const action of movedToControl) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
    assert(CONTROL_ACTIONS.has(action), `${action} deve estar em CONTROL_ACTIONS`);
    assert(!READ_ACTIONS.has(action), `${action} não pode continuar em READ_ACTIONS`);
  }
});


Deno.test("classifyEvolutionAction - leituras SEM tela consumidora viram control (agent 403, admin 200)", () => {
  // get-* de integração devolvem credenciais configuradas (apiKey/secret) e as
  // consultas abaixo não têm nenhuma tela de atendente consumidora (prova por
  // `git grep` em src/). Antes eram 'read' — qualquer autenticado as disparava.
  for (const action of [
    "get-chatwoot", "get-typebot", "typebot-sessions", "get-openai",
    "get-dify", "get-flowise", "get-evolution-bot", "get-rabbitmq", "get-sqs",
    "get-proxy", "get-evoai", "get-n8n", "get-kafka", "get-nats", "get-pusher",
    "find-chats", "find-messages", "find-templates", "find-contacts",
    "get-catalog", "get-collections", "get-media-base64", "check-numbers",
    "group-participants",
  ]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
    assert(CONTROL_ACTIONS.has(action), `${action} deve estar em CONTROL_ACTIONS`);
    assert(!READ_ACTIONS.has(action), `${action} não pode estar em READ_ACTIONS`);
    // Agente sem papel: 403. Admin/supervisor: conserva a operação.
    // `assert(!denied.allowed)` vem ANTES de ler `.status`: só o estreitamento
    // da união (asserts expr) torna o campo visível para o type-check do deno.
    const denied = decideControlAuthz(false);
    assert(!denied.allowed, `${action}: agent deve ser negado`);
    assertEquals(denied.status, 403);
    assert(decideControlAuthz(true).allowed, `${action}: admin deve passar`);
  }
});

Deno.test("classifyEvolutionAction - reconcile-instances é control (admin 200, agent 403)", () => {
  // A tela de Conexões só oferece a reconciliação ao admin; a ação enxerga a
  // topologia de todas as conexões, então entra em CONTROL_ACTIONS.
  assertEquals(classifyEvolutionAction("reconcile-instances"), "control");
  assert(CONTROL_ACTIONS.has("reconcile-instances"));
  assert(!READ_ACTIONS.has("reconcile-instances"));
  const denied = decideControlAuthz(false);
  assert(!denied.allowed);
  assertEquals(denied.status, 403);
  assert(decideControlAuthz(true).allowed);
});

Deno.test("decideControlAuthz - admin/supervisor conserva a operação", () => {
  const d = decideControlAuthz(true);
  assert(d.allowed, "admin/supervisor deve passar");
});

Deno.test("decideControlAuthz - agente sem papel recebe 403", () => {
  const d = decideControlAuthz(false);
  assert(!d.allowed);
  assertEquals(d.status, 403);
  assertEquals(typeof d.message, "string");
});

Deno.test("decideSendAuthz - admin passa; agente exige contato visível", () => {
  assert(decideSendAuthz({ isAdminOrSupervisor: true, contactVisible: false }).allowed);
  assert(decideSendAuthz({ isAdminOrSupervisor: false, contactVisible: true }).allowed);
  const denied = decideSendAuthz({ isAdminOrSupervisor: false, contactVisible: false });
  assert(!denied.allowed);
  assertEquals(denied.status, 403);
});

Deno.test("matriz é exaustiva: toda ação do handler está em exatamente um conjunto", async () => {
  // Extrai todos os `if (action === '...')` do handler real — a matriz deve ser
  // uma bijecção com esse conjunto: nenhuma ação sem classificação (cairia em
  // control por padrão, mas a classificação explícita é o contrato) e nenhum
  // item morto nos conjuntos.
  const handlerSource = await Deno.readTextFile(
    new URL("../../evolution-api/index.ts", import.meta.url),
  );
  const handlerActions = new Set(
    [...handlerSource.matchAll(/action === '([^']+)'/g)].map((m) => m[1]),
  );
  assert(handlerActions.size > 50, `sanidade: handler deve ter >50 ações (achou ${handlerActions.size})`);

  const sets = { CONTROL_ACTIONS, SEND_ACTIONS, READ_ACTIONS };
  for (const [name, set] of Object.entries(sets)) {
    for (const action of set) {
      assert(handlerActions.has(action), `${name} contém '${action}' que não existe no handler`);
    }
  }
  for (const action of handlerActions) {
    const membership = Object.values(sets).filter((s) => s.has(action)).length;
    assertEquals(membership, 1, `'${action}' deve estar em exatamente um dos três conjuntos`);
  }
});
