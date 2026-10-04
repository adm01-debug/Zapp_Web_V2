import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyEvolutionAction,
  decideControlAuthz,
  decideSendAuthz,
  CONTROL_ACTIONS,
  SEND_ACTIONS,
} from "../evolution-control-authz.ts";

// R2-API-001 (P1): a matriz de autorização das ações de controle Evolution.
// Antes da correção, `set-webhook`/`disconnect`/`update-privacy` etc. eram
// classificados como leitura (nenhum gate além do JWT global) — um `agent`
// autenticado disparava I/O no provedor sem papel nem escopo de conexão.

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

Deno.test("classifyEvolutionAction - envios diretos são send", () => {
  for (const action of ["send-text", "send-media", "send-audio", "send-template", "send-ptv"]) {
    assertEquals(classifyEvolutionAction(action), "send", `${action} deve ser send`);
  }
  assert(SEND_ACTIONS.has("send-text"));
  assert(SEND_ACTIONS.has("offer-call"));
});

Deno.test("classifyEvolutionAction - leituras seguem liberadas a autenticados", () => {
  for (const action of ["status", "get-settings", "get-webhook", "find-chats", "list-instances", "fetch-profile"]) {
    assertEquals(classifyEvolutionAction(action), "read", `${action} deve ser read`);
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

Deno.test("matriz cobre explicitamente o conjunto fechado de ações do handler", () => {
  // Ações de controle listadas por nome no index.ts (não exaustivo de leitura).
  const controlas = [
    "set-webhook", "disconnect", "restart-instance", "update-privacy",
    "set-settings", "set-presence", "update-profile-name", "update-profile-status",
    "create-group", "update-group-name", "update-group-description", "update-participants",
    "update-group-setting", "revoke-invite-code", "accept-invite", "leave-group",
    "update-group-picture", "toggle-ephemeral", "handle-label", "update-block-status",
    "create-template", "delete-template", "set-chatwoot", "delete-chatwoot",
    "set-typebot", "delete-typebot", "set-openai", "delete-openai", "set-dify",
    "delete-dify", "set-flowise", "delete-flowise", "set-evolution-bot",
    "delete-evolution-bot", "set-rabbitmq", "set-sqs", "set-proxy", "set-evoai",
    "delete-evoai", "set-n8n", "delete-n8n", "set-kafka", "set-nats", "set-pusher",
  ];
  for (const action of controlas) {
    assert(CONTROL_ACTIONS.has(action), `${action} deve estar em CONTROL_ACTIONS`);
  }
});
