/**
 * Grupos no webhook — renomear/criar grupo no celular grava em `whatsapp_groups`
 * na hora, SEM depender do botão 'Sincronizar' (que só admin/supervisor tem).
 *
 * Prova o corpo REALMENTE gravado: cada evento atravessa o roteador de verdade
 * (handleEvolutionWebhook) contra um Supabase FALSO em 127.0.0.1, que registra
 * cada escrita. Nenhum banco real, nenhuma rede fora de 127.0.0.1 — o JID e a
 * conexão são sintéticos.
 *
 * Cobre as duas formas que a Evolution manda: v2 (`{id, subject, size}`) e GO
 * (`{JID, Name, Participants}`, traduzido por translateGoPayload). O contador de
 * membros só é sobrescrito quando o payload traz o tamanho; um rename sem
 * tamanho NÃO pode zerar `participant_count`.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-webhook-groups-upsert.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handleEvolutionWebhook } from "../../evolution-webhook/index.ts";
import { invalidateConnectionCache } from "../evolution-helpers.ts";

/** JID sintético: número de exemplo, nunca de cliente. */
const GRUPO = "120363000000000000@g.us";
const CONEXAO_ID = "00000000-0000-0000-0000-0000000000c1";
const TOKEN = "tok-grupos-do-teste";

interface Escrita {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
}

/**
 * PostgREST falso. As leituras devolvem o que a opção pedir (respeitando o
 * `Accept` de `.maybeSingle()`); as escritas são registradas — é o que o teste
 * confere. Sem linha de conexão, os handlers retornam cedo (instância não
 * cadastrada): é assim que se prova o "ignora sem escrever".
 */
function iniciarSupabaseFalso(opcoes: {
  conexoes?: Record<string, unknown>[] | null;
  grupos?: Record<string, unknown>[] | null;
}) {
  const escritas: Escrita[] = [];
  const servidor = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const url = new URL(req.url);
    const aceitaObjeto = (req.headers.get("accept") ?? "").includes("vnd.pgrst.object+json");
    let resposta: string;
    if (req.method === "GET") {
      await req.body?.cancel();
      const linhas = url.pathname.endsWith("/whatsapp_connections")
        ? (opcoes.conexoes ?? null)
        : url.pathname.endsWith("/whatsapp_groups")
        ? (opcoes.grupos ?? null)
        : null;
      resposta = linhas && linhas.length > 0
        ? (aceitaObjeto ? JSON.stringify(linhas[0]) : JSON.stringify(linhas))
        : (aceitaObjeto ? "null" : "[]");
    } else {
      const texto = await req.text();
      escritas.push({
        metodo: req.method,
        caminho: `${url.pathname}${url.search}`,
        corpo: texto ? JSON.parse(texto) : null,
      });
      resposta = aceitaObjeto ? "null" : "[]";
    }
    return new Response(resposta, { status: 200, headers: { "content-type": "application/json" } });
  });
  const porta = (servidor.addr as Deno.NetAddr).port;
  return {
    url: `http://127.0.0.1:${porta}`,
    escritas,
    parar: () => servidor.shutdown(),
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  return fn().finally(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  });
}

async function despachar(url: string, payload: Record<string, unknown>) {
  invalidateConnectionCache();
  return await handleEvolutionWebhook(
    new Request("http://localhost/functions/v1/evolution-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

function escritaEmGrupos(escritas: Escrita[], metodo: string): Escrita {
  const escrita = escritas.find((e) =>
    e.metodo === metodo && e.caminho.startsWith("/rest/v1/whatsapp_groups")
  );
  assert(escrita, `nenhuma escrita ${metodo} em whatsapp_groups (foi: ${
    JSON.stringify(escritas.map((e) => `${e.metodo} ${e.caminho}`))
  })`);
  return escrita;
}

/** O corpo do upsert é um objeto; normaliza caso o supabase-js mande um array. */
function corpoUnico(escrita: Escrita): Record<string, unknown> {
  const corpo = escrita.corpo;
  if (Array.isArray(corpo)) return corpo[0] as Record<string, unknown>;
  return corpo ?? {};
}

function ambiente(url: string): Record<string, string | undefined> {
  return {
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
    EVOLUTION_INSTANCE_TOKEN: TOKEN,
    EVOLUTION_WEBHOOK_SECRET: undefined,
    WEBHOOK_SECRET: undefined,
    EVOLUTION_WEBHOOK_ENFORCE: undefined,
  };
}

Deno.test("grupos: renomear no celular (v2 group.update) grava o nome sem clique em Sincronizar", async () => {
  const falso = iniciarSupabaseFalso({ conexoes: [{ id: CONEXAO_ID }] });
  try {
    await withEnv(ambiente(falso.url), async () => {
      const res = await despachar(falso.url, {
        event: "group.update",
        instance: "INST-GRUPOS-1",
        instanceToken: TOKEN,
        data: { id: GRUPO, subject: "Grupo Renomeado no Celular", size: 7 },
      });
      assertEquals(res.status, 200);

      const escrita = escritaEmGrupos(falso.escritas, "POST");
      assert(
        escrita.caminho.includes("on_conflict=group_id"),
        `upsert sem a UNIQUE group_id: ${escrita.caminho}`,
      );
      const corpo = corpoUnico(escrita);
      assertEquals(corpo.group_id, GRUPO);
      assertEquals(corpo.name, "Grupo Renomeado no Celular");
      assertEquals(corpo.participant_count, 7);
      assertEquals(corpo.whatsapp_connection_id, CONEXAO_ID);
    });
  } finally {
    await falso.parar();
  }
});

Deno.test("grupos: payload da GO (groupinfo → group.update) grava Name/Topic/Participants", async () => {
  const falso = iniciarSupabaseFalso({ conexoes: [{ id: CONEXAO_ID }] });
  try {
    await withEnv(ambiente(falso.url), async () => {
      const res = await despachar(falso.url, {
        event: "groupinfo",
        instanceName: "INST-GRUPOS-2",
        instanceToken: TOKEN,
        data: {
          JID: GRUPO,
          Name: "Grupo da GO",
          Topic: "Descrição da GO",
          Participants: [{}, {}, {}],
        },
      });
      assertEquals(res.status, 200);

      const corpo = corpoUnico(escritaEmGrupos(falso.escritas, "POST"));
      assertEquals(corpo.group_id, GRUPO);
      assertEquals(corpo.name, "Grupo da GO");
      assertEquals(corpo.description, "Descrição da GO");
      assertEquals(corpo.participant_count, 3);
      assertEquals(corpo.whatsapp_connection_id, CONEXAO_ID);
    });
  } finally {
    await falso.parar();
  }
});

Deno.test("grupos: rename sem tamanho no payload não zera participant_count", async () => {
  const falso = iniciarSupabaseFalso({ conexoes: [{ id: CONEXAO_ID }] });
  try {
    await withEnv(ambiente(falso.url), async () => {
      await despachar(falso.url, {
        event: "groups.upsert",
        instance: "INST-GRUPOS-3",
        instanceToken: TOKEN,
        data: { id: GRUPO, subject: "Só o nome mudou" },
      });

      const corpo = corpoUnico(escritaEmGrupos(falso.escritas, "POST"));
      assertEquals(corpo.name, "Só o nome mudou");
      assert(
        !("participant_count" in corpo),
        `rename sem tamanho sobrescreveu participant_count: ${JSON.stringify(corpo)}`,
      );
    });
  } finally {
    await falso.parar();
  }
});

Deno.test("grupos: group.participants.update recalcula participant_count e não mexe no nome", async () => {
  const falso = iniciarSupabaseFalso({
    conexoes: [{ id: CONEXAO_ID }],
    grupos: [{ participant_count: 4 }],
  });
  try {
    await withEnv(ambiente(falso.url), async () => {
      const res = await despachar(falso.url, {
        event: "group.participants.update",
        instance: "INST-GRUPOS-4",
        instanceToken: TOKEN,
        data: {
          id: GRUPO,
          action: "add",
          participants: ["5511900000001@s.whatsapp.net", "5511900000002@s.whatsapp.net"],
        },
      });
      assertEquals(res.status, 200);

      const bodyPATCH = corpoUnico(escritaEmGrupos(falso.escritas, "PATCH"));
      assertEquals(bodyPATCH.participant_count, 6);
      assert(!("name" in bodyPATCH), `participants.update sobrescreveu o nome: ${JSON.stringify(bodyPATCH)}`);
    });
  } finally {
    await falso.parar();
  }
});

Deno.test("grupos: instância sem conexão cadastrada é ignorada (nenhuma escrita)", async () => {
  const falso = iniciarSupabaseFalso({ conexoes: null });
  try {
    await withEnv(ambiente(falso.url), async () => {
      const res = await despachar(falso.url, {
        event: "group.update",
        instance: "INST-GRUPOS-5",
        instanceToken: TOKEN,
        data: { id: GRUPO, subject: "Grupo de instância desconhecida" },
      });
      assertEquals(res.status, 200);
      assertEquals(
        falso.escritas.filter((e) => e.caminho.startsWith("/rest/v1/whatsapp_groups")),
        [],
        "instância não cadastrada não pode escrever em whatsapp_groups",
      );
    });
  } finally {
    await falso.parar();
  }
});
