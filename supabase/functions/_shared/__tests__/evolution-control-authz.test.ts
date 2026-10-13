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
  // Alterações de perfil/grupos e integrações também são controle.
  for (const action of [
    "update-profile-name", "update-profile-picture", "remove-profile-picture",
    "create-group", "update-participants", "leave-group", "toggle-ephemeral",
    "set-settings", "set-presence", "set-chatwoot", "delete-openai", "set-proxy",
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
    "send-text", "send-media", "send-audio", "send-template", "send-ptv",
    "send-reaction", "send-chat-presence", "offer-call",
    "mark-read", "mark-unread", "archive-chat",
  ]) {
    assertEquals(classifyEvolutionAction(action), "send", `${action} deve ser send`);
  }
  assert(SEND_ACTIONS.has("send-text"));
  assert(SEND_ACTIONS.has("offer-call"));
});

Deno.test("R2EXT-STATUS: send-status é controle (não tem contato-alvo para gate por visibilidade)", () => {
  // O status vai para toda a base da conexão: não há contato-alvo. Enquanto
  // estava em `send`, o envio de não-admin era negado por falta de alvo (efeito
  // colateral) — como control, a exigência de admin/supervisor é explícita.
  assertEquals(classifyEvolutionAction("send-status"), "control");
  assert(CONTROL_ACTIONS.has("send-status"));
  assert(!SEND_ACTIONS.has("send-status"));
});

Deno.test("classifyEvolutionAction - leituras não sensíveis seguem liberadas a autenticados", () => {
  for (const action of [
    "status", "list-instances", "instance-info",
    "check-numbers",
    "list-groups", "group-info", "group-participants", "group-invite-code", "invite-info",
  ]) {
    assertEquals(classifyEvolutionAction(action), "read", `${action} deve ser read`);
    assert(READ_ACTIONS.has(action), `${action} deve estar em READ_ACTIONS`);
  }
});

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
  assert(handlerActions.size > 100, `sanidade: handler deve ter >100 ações (achou ${handlerActions.size})`);

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
