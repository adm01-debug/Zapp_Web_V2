/**
 * Teste do contrato das ações de gerenciamento de marcadores do Gmail
 * (`create-label` / `update-label` / `delete-label`) na `gmail-sync`.
 *
 * Prova que o schema (`GmailSyncActionSchema`) rejeita — antes de qualquer
 * chamada ao Gmail — nome vazio/com espaços nas pontas, nome acima de 225
 * caracteres, cor fora do formato hex e as exigências por ação (name no
 * create, label_id no update/delete, e um campo a atualizar no update).
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GmailSyncActionSchema } from "./index.ts";

const CONTA = "11111111-1111-4111-8111-111111111111";

function errosDe(body: Record<string, unknown>): string[] {
  const parsed = GmailSyncActionSchema.safeParse(body);
  if (parsed.success) return [];
  const flat = parsed.error.flatten();
  return Object.values(flat.fieldErrors).flat() as string[];
}

Deno.test("create-label: nome válido é aceito e a cor é preservada", () => {
  const parsed = GmailSyncActionSchema.safeParse({
    action: "create-label",
    account_id: CONTA,
    name: "Clientes",
    color: { backgroundColor: "#42d692", textColor: "#ffffff" },
    label_list_visibility: "labelShow",
  });
  assert(parsed.success);
  assertEquals(parsed.data.name, "Clientes");
  assertEquals(parsed.data.color?.backgroundColor, "#42d692");
});

Deno.test("create-label: sem nome é recusado", () => {
  const erros = errosDe({ action: "create-label", account_id: CONTA });
  assert(erros.some((e) => e.includes("name é obrigatório")), JSON.stringify(erros));
});

Deno.test("create-label: nome só com espaços e nome com espaços nas pontas são recusados", () => {
  assertEquals(errosDe({ action: "create-label", account_id: CONTA, name: "   " }).some((e) => e.includes("name é obrigatório")), true);
  const erros = errosDe({ action: "create-label", account_id: CONTA, name: " Clientes " });
  assert(erros.some((e) => e.includes("não pode ter espaços nas pontas")), JSON.stringify(erros));
});

Deno.test("create-label: nome acima de 225 caracteres é recusado", () => {
  const erros = errosDe({ action: "create-label", account_id: CONTA, name: "a".repeat(226) });
  assert(erros.length > 0, "nome de 226 caracteres deve ser recusado");
  assertEquals(GmailSyncActionSchema.safeParse({ action: "create-label", account_id: CONTA, name: "a".repeat(225) }).success, true);
});

Deno.test("create-label: cor fora do formato hex é recusada", () => {
  assertEquals(errosDe({ action: "create-label", account_id: CONTA, name: "X", color: { backgroundColor: "red", textColor: "#ffffff" } }).length > 0, true);
  assertEquals(errosDe({ action: "create-label", account_id: CONTA, name: "X", color: { backgroundColor: "#42d692" } }).length > 0, true);
});

Deno.test("update-label: exige label_id e ao menos um campo a atualizar", () => {
  const semId = errosDe({ action: "update-label", account_id: CONTA, name: "Novo" });
  assert(semId.some((e) => e.includes("label_id é obrigatório")), JSON.stringify(semId));

  const semCampo = errosDe({ action: "update-label", account_id: CONTA, label_id: "Label_42" });
  assert(semCampo.some((e) => e.includes("nada para atualizar")), JSON.stringify(semCampo));

  assertEquals(GmailSyncActionSchema.safeParse({ action: "update-label", account_id: CONTA, label_id: "Label_42", name: "Novo" }).success, true);
});

Deno.test("update-label: nome vazio é recusado", () => {
  const erros = errosDe({ action: "update-label", account_id: CONTA, label_id: "Label_42", name: "" });
  assert(erros.some((e) => e.includes("não pode ser vazio")), JSON.stringify(erros));
});

Deno.test("update-label: nome só com espaços é recusado", () => {
  const erros = errosDe({ action: "update-label", account_id: CONTA, label_id: "Label_42", name: "   " });
  assert(erros.some((e) => e.includes("não pode ser vazio")), JSON.stringify(erros));
});

Deno.test("update-label: nome com espaços nas pontas é recusado", () => {
  const erros = errosDe({ action: "update-label", account_id: CONTA, label_id: "Label_42", name: " Clientes " });
  assert(erros.some((e) => e.includes("não pode ter espaços nas pontas")), JSON.stringify(erros));
});

Deno.test("update-label: nome acima de 225 caracteres é recusado (225 passa)", () => {
  const erros = errosDe({ action: "update-label", account_id: CONTA, label_id: "Label_42", name: "a".repeat(226) });
  assert(erros.length > 0, "nome de 226 caracteres deve ser recusado no update");
  assertEquals(GmailSyncActionSchema.safeParse({ action: "update-label", account_id: CONTA, label_id: "Label_42", name: "a".repeat(225) }).success, true);
});

Deno.test("update-label: sem name (só cor) continua aceito", () => {
  assertEquals(GmailSyncActionSchema.safeParse({ action: "update-label", account_id: CONTA, label_id: "Label_42", color: { backgroundColor: "#42d692", textColor: "#ffffff" } }).success, true);
});

Deno.test("delete-label: exige label_id e aceita id válido", () => {
  const erros = errosDe({ action: "delete-label", account_id: CONTA });
  assert(erros.some((e) => e.includes("label_id é obrigatório")), JSON.stringify(erros));
  assertEquals(GmailSyncActionSchema.safeParse({ action: "delete-label", account_id: CONTA, label_id: "Label_42" }).success, true);
});

Deno.test("ação de marcador desconhecida continua recusada", () => {
  assertEquals(GmailSyncActionSchema.safeParse({ action: "remove-label", account_id: CONTA, label_id: "Label_42" }).success, false);
});
