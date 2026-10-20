import assert from "node:assert/strict";
import test from "node:test";

import { LIMITE_COMENTARIOS, contarComentarios, encontrarIssue, abrirOuRotacionar, fecharSeAberta } from "./issue-rotativa.mjs";

// --- utilidades de mock ---

function mkGh(handlers) {
  return async (method, path, body) => {
    const key = `${method} ${path.replace(/\?.*$/u, "")}`;
    // exact match first
    const exactFn = handlers[key];
    if (exactFn) return exactFn(body, path);
    // then regex
    for (const [pattern, fn] of Object.entries(handlers)) {
      if (key === pattern || new RegExp(pattern, "u").test(key)) {
        return fn(body, path);
      }
    }
    throw new Error(`gh mock não coberto: ${method} ${path}`);
  };
}

test("LIMITE_COMENTARIOS é 20", () => {
  assert.equal(LIMITE_COMENTARIOS, 20);
});

// --- contarComentarios ---

test("contarComentarios: retorna 0 para lista vazia", async () => {
  const gh = mkGh({ "GET /repos/o/r/issues/1/comments": () => [] });
  assert.equal(await contarComentarios(gh, "o", "r", 1), 0);
});

test("contarComentarios: retorna total de página única", async () => {
  const gh = mkGh({ "GET /repos/o/r/issues/1/comments": () => Array(5).fill({}) });
  assert.equal(await contarComentarios(gh, "o", "r", 1), 5);
});

test("contarComentarios: pagina quando retorna 100 itens", async () => {
  let page = 0;
  const gh = mkGh({
    "GET /repos/o/r/issues/1/comments": (_, path) => {
      page++;
      if (page === 1) return Array(100).fill({});
      if (page === 2) return Array(7).fill({});
      return [];
    },
  });
  assert.equal(await contarComentarios(gh, "o", "r", 1), 107);
});

// --- encontrarIssue ---

test("encontrarIssue: retorna null quando lista não é array", async () => {
  const gh = mkGh({ "GET /repos/o/r/issues": () => null });
  assert.equal(await encontrarIssue(gh, "o", "r", "bot-alert", "Alerta"), null);
});

test("encontrarIssue: retorna null quando nenhum título bate", async () => {
  const gh = mkGh({ "GET /repos/o/r/issues": () => [{ title: "Outro" }] });
  assert.equal(await encontrarIssue(gh, "o", "r", "bot-alert", "Alerta"), null);
});

test("encontrarIssue: retorna a issue com título correto", async () => {
  const issue = { number: 42, title: "Alerta" };
  const gh = mkGh({ "GET /repos/o/r/issues": () => [{ title: "Outro" }, issue] });
  assert.deepEqual(await encontrarIssue(gh, "o", "r", "bot-alert", "Alerta"), issue);
});

// --- abrirOuRotacionar ---

test("abrirOuRotacionar: cria issue quando não existe", async () => {
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [],
    "POST /repos/o/r/labels": () => ({}),
    "POST /repos/o/r/issues": (body) => { calls.push({ op: "criar", body }); return { number: 10 }; },
  });
  const num = await abrirOuRotacionar({ gh, owner: "o", repo: "r", label: "L", title: "T", body: "B" });
  assert.equal(num, 10);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.title, "T");
});

test("abrirOuRotacionar: adiciona comentário quando issue existe com ≤ 20 comentários", async () => {
  const issue = { number: 5, title: "T" };
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "GET /repos/o/r/issues/5/comments": () => Array(15).fill({}),
    "POST /repos/o/r/issues/5/comments": (body) => { calls.push(body); return {}; },
  });
  const num = await abrirOuRotacionar({ gh, owner: "o", repo: "r", label: "L", title: "T", body: "B" });
  assert.equal(num, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body, "B");
});

test("abrirOuRotacionar: rotaciona quando issue tem 21 comentários (> LIMITE)", async () => {
  const issue = { number: 7, title: "T" };
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "GET /repos/o/r/issues/7/comments": () => Array(21).fill({}),
    "POST /repos/o/r/issues/7/comments": (body) => { calls.push({ op: "resumo", issue: 7, body }); return {}; },
    "PATCH /repos/o/r/issues/7": (body) => { calls.push({ op: "fechar", body }); return {}; },
    "POST /repos/o/r/labels": () => ({}),
    "POST /repos/o/r/issues": (body) => { calls.push({ op: "nova", body }); return { number: 99 }; },
  });
  const num = await abrirOuRotacionar({ gh, owner: "o", repo: "r", label: "L", title: "T", body: "ALERTA" });
  assert.equal(num, 99);
  const ops = calls.map((c) => c.op);
  assert.deepEqual(ops, ["resumo", "fechar", "nova"]);
  assert.ok(calls[0].body.body.includes("rotacionada"), "comentário de resumo deve mencionar rotacionada");
  assert.equal(calls[1].body.state, "closed");
  assert.ok(calls[2].body.body.includes("#7"), "nova issue deve linkar para a anterior");
});

test("abrirOuRotacionar: não rotaciona com exatamente 20 comentários (= LIMITE)", async () => {
  const issue = { number: 8, title: "T" };
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "GET /repos/o/r/issues/8/comments": () => Array(20).fill({}),
    "POST /repos/o/r/issues/8/comments": (body) => { calls.push({ op: "comentario", body }); return {}; },
  });
  const num = await abrirOuRotacionar({ gh, owner: "o", repo: "r", label: "L", title: "T", body: "B" });
  assert.equal(num, 8);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "comentario");
});

// --- fecharSeAberta ---

test("fecharSeAberta: não faz nada se issue não existe", async () => {
  let fechou = false;
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [],
    "PATCH /repos/o/r/issues/1": () => { fechou = true; return {}; },
  });
  await fecharSeAberta(gh, "o", "r", "L", "T");
  assert.equal(fechou, false);
});

test("fecharSeAberta: fecha com mensagem padrão se issue existe", async () => {
  const issue = { number: 3, title: "T" };
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "POST /repos/o/r/issues/3/comments": (body) => { calls.push({ op: "comentario", body }); return {}; },
    "PATCH /repos/o/r/issues/3": (body) => { calls.push({ op: "fechar", body }); return {}; },
  });
  await fecharSeAberta(gh, "o", "r", "L", "T");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].op, "fechar");
  assert.equal(calls[1].body.state, "closed");
});

test("fecharSeAberta: fecha com mensagem personalizada", async () => {
  const issue = { number: 4, title: "T" };
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "POST /repos/o/r/issues/4/comments": (body) => { calls.push(body.body); return {}; },
    "PATCH /repos/o/r/issues/4": () => ({}),
  });
  await fecharSeAberta(gh, "o", "r", "L", "T", "Tudo OK.");
  assert.equal(calls[0], "Tudo OK.");
});

// --- GA78: rotacao fecha como not_planned + dedupe por marcador ---

test("GA78: issue rotacionada fecha como not_planned (nao completed)", async () => {
  const issue = { number: 7, title: "T" };
  const calls = [];
  const gh = mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "GET /repos/o/r/issues/7/comments": () => Array(21).fill({}),
    "POST /repos/o/r/issues/7/comments": (body) => { calls.push({ op: "resumo", body }); return {}; },
    "PATCH /repos/o/r/issues/7": (body) => { calls.push({ op: "fechar", body }); return {}; },
    "POST /repos/o/r/labels": () => ({}),
    "POST /repos/o/r/issues": (body) => { calls.push({ op: "nova", body }); return { number: 99 }; },
  });
  await abrirOuRotacionar({ gh, owner: "o", repo: "r", label: "L", title: "T", body: "ALERTA" });
  const fechar = calls.find((c) => c.op === "fechar");
  assert.equal(fechar.body.state, "closed");
  assert.equal(fechar.body.state_reason, "not_planned");
});

function mkDedupeGh(comentarios, calls) {
  const issue = { number: 42, title: "T", comments: comentarios.length };
  return mkGh({
    "GET /repos/o/r/issues": () => [issue],
    "GET /repos/o/r/issues/42/comments": () => comentarios,
    "POST /repos/o/r/issues/42/comments": (body) => { calls.push(body); return {}; },
    "POST /repos/o/r/labels": () => ({}),
    "POST /repos/o/r/issues": () => ({ number: 43 }),
  });
}

const AGORA = Date.now();
const iso = (ms) => new Date(ms).toISOString();

test("GA78: dedupe suprime comentario com mesma causa dentro da janela", async () => {
  const calls = [];
  const gh = mkDedupeGh(
    [{ body: "<!-- causa:abc--> alerta", created_at: iso(AGORA - 60_000), user: { login: "guard" } }],
    calls,
  );
  const r = await abrirOuRotacionar({
    gh, owner: "o", repo: "r", label: "L", title: "T", body: "novo",
    marcador: "<!-- causa:abc-->", janelaMs: 6 * 3600_000, autor: "guard", detalhar: true,
  });
  assert.deepEqual(r, { numero: 42, suprimido: true });
  assert.equal(calls.length, 0);
});

test("GA78: dedupe volta a comentar apos a janela", async () => {
  const calls = [];
  const gh = mkDedupeGh(
    [{ body: "<!-- causa:abc--> alerta", created_at: iso(AGORA - 8 * 3600_000), user: { login: "guard" } }],
    calls,
  );
  const r = await abrirOuRotacionar({
    gh, owner: "o", repo: "r", label: "L", title: "T", body: "novo",
    marcador: "<!-- causa:abc-->", janelaMs: 6 * 3600_000, autor: "guard", detalhar: true,
  });
  assert.deepEqual(r, { numero: 42, suprimido: false });
  assert.equal(calls.length, 1);
});

test("GA78: dedupe ignora marcador colado por outro autor", async () => {
  const calls = [];
  const gh = mkDedupeGh(
    [{ body: "<!-- causa:abc--> forjado", created_at: iso(AGORA - 60_000), user: { login: "curioso" } }],
    calls,
  );
  const r = await abrirOuRotacionar({
    gh, owner: "o", repo: "r", label: "L", title: "T", body: "novo",
    marcador: "<!-- causa:abc-->", janelaMs: 6 * 3600_000, autor: "guard", detalhar: true,
  });
  assert.deepEqual(r, { numero: 42, suprimido: false });
  assert.equal(calls.length, 1);
});

test("GA78: comentario alheio depois do marcador nao zera o dedupe", async () => {
  const calls = [];
  const gh = mkDedupeGh(
    [
      { body: "<!-- causa:abc--> alerta", created_at: iso(AGORA - 60_000), user: { login: "guard" } },
      { body: "humano comentou depois", created_at: iso(AGORA - 30_000), user: { login: "humano" } },
    ],
    calls,
  );
  const r = await abrirOuRotacionar({
    gh, owner: "o", repo: "r", label: "L", title: "T", body: "novo",
    marcador: "<!-- causa:abc-->", janelaMs: 6 * 3600_000, autor: "guard", detalhar: true,
  });
  assert.deepEqual(r, { numero: 42, suprimido: true });
  assert.equal(calls.length, 0);
});
