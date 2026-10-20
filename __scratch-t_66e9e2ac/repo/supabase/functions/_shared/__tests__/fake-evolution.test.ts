/**
 * X034 — teste do provedor falso (fake-evolution.ts).
 *
 * Exercita os cinco modos e o registro de POSTs sem rede externa: só
 * 127.0.0.1 (a permissão do gate Deno é `--allow-net=127.0.0.1`).
 */
import { createFakeEvolution } from "./fake-evolution.ts";

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("fake-evolution: modo ok devolve id único e registra o POST de mensagem", async () => {
  const fake = createFakeEvolution();
  try {
    const first = await fetch(`${fake.url}/message/sendText/PRINCIPAL`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: "5511999990001", text: "oi" }),
    });
    assertEquals(first.status, 200, "status");
    const body = await first.json() as { key?: { id?: string } };
    assert(typeof body.key?.id === "string" && body.key.id.length > 0, "deveria devolver key.id");

    const second = await fetch(`${fake.url}/message/sendText/PRINCIPAL`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: "5511999990002", text: "oi" }),
    });
    const body2 = await second.json() as { key?: { id?: string } };
    assert(body2.key?.id !== body.key?.id, "cada POST deveria ter um id distinto");

    assertEquals(fake.posts.length, 2, "POSTs registrados");
    assertEquals(fake.messagePosts().length, 2, "POSTs de mensagem");
    assertEquals(fake.messagePosts()[0].body.number, "5511999990001", "corpo registrado");
  } finally {
    await fake.stop();
  }
});

Deno.test("fake-evolution: presença (updatePresence) responde 200 e não conta como mensagem", async () => {
  const fake = createFakeEvolution();
  try {
    const res = await fetch(`${fake.url}/chat/updatePresence/PRINCIPAL`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: "5511999990001", presence: "composing" }),
    });
    assertEquals(res.status, 200, "status da presença");
    assertEquals(fake.messagePosts().length, 0, "presença não é POST de mensagem");
  } finally {
    await fake.stop();
  }
});

Deno.test("fake-evolution: modos 500, sem_id e 400_interativo", async () => {
  const fake = createFakeEvolution();
  const post = (n: number) =>
    fetch(`${fake.url}/message/sendText/PRINCIPAL`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: `55119999910${n}`, text: "oi" }),
    });
  try {
    fake.setMode("500");
    assertEquals((await post(1)).status, 500, "modo 500");

    fake.setMode("sem_id");
    const semId = await post(2);
    assertEquals(semId.status, 200, "modo sem_id: 200");
    const semIdBody = await semId.json() as { key?: { id?: string } };
    assert(!semIdBody.key?.id, "modo sem_id não pode devolver key.id");

    fake.setMode("400_interativo");
    assertEquals((await post(3)).status, 400, "modo 400 interativo");

    assertEquals(fake.messagePosts().length, 3, "os três POSTs foram registrados");
  } finally {
    await fake.stop();
  }
});

Deno.test("fake-evolution: modo timeout segura a resposta até o cliente abortar", async () => {
  const fake = createFakeEvolution({ mode: "timeout", timeoutDelayMs: 300 });
  try {
    let abortou = false;
    try {
      await fetch(`${fake.url}/message/sendText/PRINCIPAL`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: "5511999990001", text: "oi" }),
        signal: AbortSignal.timeout(100),
      });
    } catch {
      abortou = true;
    }
    assert(abortou, "o modo timeout deveria estourar o AbortSignal do cliente");
    assertEquals(fake.messagePosts().length, 1, "o POST que travou ainda é registrado");
  } finally {
    await fake.stop();
  }
});
