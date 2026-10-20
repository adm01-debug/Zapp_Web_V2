// Contrato da autorização de reatribuição do copiloto de voz — lacuna L4 da
// matriz docs/ia/IA-004-matriz-autorizacao.md (caso de aceite N19).
//
// Prova o recorte: agente comum reivindica para si, mas NÃO move a conversa para
// outra pessoa; admin/supervisor movem; chamador sem perfil e destino inexistente
// são recusados (fail-closed).
//
// Run with: deno test supabase/functions/_shared/__tests__/voice-copilot-authz.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  decideReassignConversation,
  isReassignManager,
  REASSIGN_ALLOWED_ROLES,
  REASSIGN_DENIED_MESSAGE,
} from "../voice-copilot-authz.ts";

const AGENTE_A = 'b0000000-0000-0000-0000-000000000001';
const AGENTE_B = 'c0000000-0000-0000-0000-000000000001';

Deno.test("agente comum (sem papel) reivindica a conversa para SI — permitido", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_A,
      callerProfileId: AGENTE_A,
      callerRoles: [],
    }),
    { allowed: true, mode: 'self' },
  );
});

Deno.test("agente comum (sem papel) NÃO move a conversa para OUTRO agente — recusado (L4/N19)", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_B,
      callerProfileId: AGENTE_A,
      callerRoles: [],
    }),
    { allowed: false, reason: 'reassign_requires_admin' },
  );
});

Deno.test("agent com papel 'agent' continua sem poder reatribuir para outro", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_B,
      callerProfileId: AGENTE_A,
      callerRoles: ['agent'],
    }),
    { allowed: false, reason: 'reassign_requires_admin' },
  );
});

Deno.test("admin reatribui para outro agente — permitido", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_B,
      callerProfileId: AGENTE_A,
      callerRoles: ['admin'],
    }),
    { allowed: true, mode: 'admin' },
  );
});

Deno.test("supervisor reatribui para outro agente — permitido", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_B,
      callerProfileId: AGENTE_A,
      callerRoles: ['supervisor'],
    }),
    { allowed: true, mode: 'admin' },
  );
});

Deno.test("admin reivindicando para si continua permitido (mode admin)", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_A,
      callerProfileId: AGENTE_A,
      callerRoles: ['admin'],
    }),
    { allowed: true, mode: 'admin' },
  );
});

Deno.test("chamador sem perfil associado é recusado (fail-closed)", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_B,
      callerProfileId: null,
      callerRoles: ['admin'],
    }),
    { allowed: false, reason: 'caller_without_profile' },
  );
});

Deno.test("destino inexistente é recusado (fail-closed)", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: null,
      callerProfileId: AGENTE_A,
      callerRoles: ['admin'],
    }),
    { allowed: false, reason: 'agent_not_found' },
  );
});

Deno.test("papéis ausentes/undefined não concedem reatribuição", () => {
  assertEquals(
    decideReassignConversation({
      targetProfileId: AGENTE_B,
      callerProfileId: AGENTE_A,
      callerRoles: undefined,
    }),
    { allowed: false, reason: 'reassign_requires_admin' },
  );
});

Deno.test("isReassignManager: só admin e supervisor habilitam", () => {
  assertEquals(REASSIGN_ALLOWED_ROLES, ['admin', 'supervisor'] as const);
  assertEquals(isReassignManager(['admin']), true);
  assertEquals(isReassignManager(['supervisor']), true);
  assertEquals(isReassignManager(['agent', 'admin']), true);
  assertEquals(isReassignManager(['agent']), false);
  assertEquals(isReassignManager([]), false);
  assertEquals(isReassignManager(null), false);
  assertEquals(isReassignManager(undefined), false);
});

Deno.test("mensagem de recusa é estável (o handler devolve success:false com ela)", () => {
  assertEquals(REASSIGN_DENIED_MESSAGE, 'Sem permissão para reatribuir conversa para outro agente.');
});
