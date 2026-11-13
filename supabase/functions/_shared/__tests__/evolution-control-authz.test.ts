import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyEvolutionAction,
  decideControlAuthz,
  decideSendAuthz,
  decideMessageAuthorAuthz,
  extractTargetMessageExternalId,
  CONTROL_ACTIONS,
  MESSAGE_AUTHOR_ACTIONS,
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
  ]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
  }
});

Deno.test("classifyEvolutionAction - pareamento e logout são control", () => {
  // 'connect' emite o QR (permite parear outro aparelho na instância) e, no
  // caminho de sessão órfã, recria a instância na GO — nunca livre para agente.
  // 'disconnect' é o logout da sessão.
  for (const action of ["connect", "disconnect"]) {
    assertEquals(classifyEvolutionAction(action), "control", `${action} deve ser control`);
    assert(CONTROL_ACTIONS.has(action), `${action} deve estar em CONTROL_ACTIONS`);
  }
});

Deno.test("P1-GO-5: editar/apagar mensagem é 'message' (autor ou admin/supervisor), não control", () => {
  for (const action of ["delete-message", "update-message", "edit-message", "delete-for-everyone"]) {
    assertEquals(classifyEvolutionAction(action), "message", `${action} deve ser message`);
    assert(MESSAGE_AUTHOR_ACTIONS.has(action));
    assert(!CONTROL_ACTIONS.has(action), `${action} saiu de CONTROL_ACTIONS`);
  }
});

Deno.test("P1-GO-5: extractTargetMessageExternalId lê messageId, id e key.id; rejeita lixo", () => {
  assertEquals(extractTargetMessageExternalId({ messageId: "ABC" }), "ABC");
  assertEquals(extractTargetMessageExternalId({ id: "XYZ" }), "XYZ");
  assertEquals(extractTargetMessageExternalId({ key: { id: "K1", remoteJid: "x@s.whatsapp.net" } }), "K1");
  assertEquals(extractTargetMessageExternalId({ messageId: "A", id: "A", key: { id: "A" } }), "A");
  assertEquals(extractTargetMessageExternalId({ messageId: "", id: 123, key: { id: null } }), null);
  assertEquals(extractTargetMessageExternalId({ id: " XYZ " }), null, "espaço vira id diferente no provedor: nega");
  assertEquals(extractTargetMessageExternalId({ id: "x".repeat(513) }), null);
  assertEquals(extractTargetMessageExternalId({}), null);
});

Deno.test("P1-GO-5 (revisão): ids divergentes entre campos são negados — o id checado é o que sai", () => {
  // PoC do revisor: autoria checada em `messageId` e provedor recebendo `id`/`key.id`.
  assertEquals(extractTargetMessageExternalId({ messageId: "OWN", id: "VICTIM" }), null);
  assertEquals(extractTargetMessageExternalId({ messageId: "OWN", key: { id: "VICTIM" } }), null);
  assertEquals(extractTargetMessageExternalId({ id: "OWN", key: { id: "VICTIM" } }), null);
  assertEquals(extractTargetMessageExternalId({ messageId: "OWN", key: { id: "VICTIM" }, id: "VICTIM" }), null);
  assertEquals(extractTargetMessageExternalId({ messageId: "OWN", id: { $ne: null } }), null);
});

Deno.test("P1-GO-5: decideMessageAuthorAuthz — autor edita/apaga a própria; o resto é 403", () => {
  const own = { sender: "agent", agent_id: "p1", connection_instance: "main" };
  assert(decideMessageAuthorAuthz({ isAdminOrSupervisor: false, callerProfileId: "p1", instance: "main", message: own }).allowed);
  // admin/supervisor mantém acesso total, mesmo sem linha
  assert(decideMessageAuthorAuthz({ isAdminOrSupervisor: true, callerProfileId: null, instance: "main", message: null }).allowed);
  const negados = [
    { callerProfileId: "p2", instance: "main", message: own },                                   // outro autor
    { callerProfileId: "p1", instance: "main", message: { ...own, sender: "contact" } },         // mensagem do cliente
    { callerProfileId: "p1", instance: "outra", message: own },                                  // outra instância
    { callerProfileId: "p1", instance: "main", message: { ...own, connection_instance: null } },  // sem conexão
    { callerProfileId: "p1", instance: "main", message: null },                                  // id inexistente
    { callerProfileId: null, instance: "main", message: own },                                   // sem perfil
  ];
  for (const caso of negados) {
    const d = decideMessageAuthorAuthz({ isAdminOrSupervisor: false, ...caso });
    assert(!d.allowed, JSON.stringify(caso));
    assertEquals(d.status, 403);
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
    "send-reaction", "send-chat-presence",
    "mark-read", "archive-chat",
  ]) {
    assertEquals(classifyEvolutionAction(action), "send", `${action} deve ser send`);
  }
  assert(SEND_ACTIONS.has("send-text"));
  assert(SEND_ACTIONS.has("send-ptv"));
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
    "list-groups", "group-info", "group-participants", "group-invite-code",
  ]) {
    assertEquals(classifyEvolutionAction(action), "read", `${action} deve ser read`);
    assert(READ_ACTIONS.has(action), `${action} deve estar em READ_ACTIONS`);
  }
});

Deno.test("R2EXT-AGENDA: leitura instance-wide e configuração do provedor exigem control", () => {
  // find-contacts/find-messages devolvem a instância inteira (sem alvo de
  // conversa para gate por visibilidade) e as demais expõem configuração ou
  // credencial do provedor: todas restritas a admin/supervisor.
  // (SL-075 removeu integrações e rotas legadas do handler.)
  const movedToControl = [
    "find-contacts", "find-messages",
    "get-media-base64",
    "fetch-profile", "fetch-profile-picture", "fetch-business-profile",
    "find-labels",
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
  assert(handlerActions.size > 50, `sanidade: handler deve ter >50 ações (achou ${handlerActions.size})`);

  const sets = { CONTROL_ACTIONS, MESSAGE_AUTHOR_ACTIONS, SEND_ACTIONS, READ_ACTIONS };
  for (const [name, set] of Object.entries(sets)) {
    for (const action of set) {
      assert(handlerActions.has(action), `${name} contém '${action}' que não existe no handler`);
    }
  }
  for (const action of handlerActions) {
    const membership = Object.values(sets).filter((s) => s.has(action)).length;
    assertEquals(membership, 1, `'${action}' deve estar em exatamente um dos quatro conjuntos`);
  }
});
