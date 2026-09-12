import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { liveTalkXInstanceId } from "../talkx-delivery-connection.ts";

Deno.test("Talk X only accepts a connected Evolution instance with a nonblank ID", () => {
  assertEquals(
    liveTalkXInstanceId({ status: "connected", instance_id: "  evolution-principal  " }),
    "evolution-principal",
  );

  for (const connection of [
    undefined,
    null,
    { status: "disconnected", instance_id: "evolution-principal" },
    { status: "connecting", instance_id: "evolution-principal" },
    { status: "connected", instance_id: null },
    { status: "connected", instance_id: "   " },
    { status: "connected", instance_id: 42 },
  ]) {
    assertEquals(liveTalkXInstanceId(connection), null);
  }
});
