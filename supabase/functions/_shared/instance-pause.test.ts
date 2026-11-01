import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isInstancePaused, type PauseRpcClient } from "./instance-pause.ts";

const client = (result: { data: unknown; error: { code?: string } | null } | Error): PauseRpcClient => ({
  rpc: () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
});

Deno.test("C121: pausada somente quando a RPC devolve true", async () => {
  assertEquals(await isInstancePaused(client({ data: true, error: null }), "inst"), true);
  assertEquals(await isInstancePaused(client({ data: false, error: null }), "inst"), false);
  assertEquals(await isInstancePaused(client({ data: null, error: null }), "inst"), false);
});

Deno.test("C121: erro da RPC ou exceção = fail-open e avisa o chamador", async () => {
  const codes: Array<string | undefined> = [];
  assertEquals(await isInstancePaused(client({ data: null, error: { code: "42501" } }), "inst", (c) => codes.push(c)), false);
  assertEquals(await isInstancePaused(client(new Error("rede")), "inst", (c) => codes.push(c)), false);
  assertEquals(codes, ["42501", "Error"]);
});

Deno.test("C121: instância vazia não consulta nada", async () => {
  let chamou = false;
  const c: PauseRpcClient = { rpc: () => { chamou = true; return Promise.resolve({ data: true, error: null }); } };
  assertEquals(await isInstancePaused(c, ""), false);
  assertEquals(chamou, false);
});
