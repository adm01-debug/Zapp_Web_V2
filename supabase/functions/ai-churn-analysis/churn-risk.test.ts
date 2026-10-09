// IA-111 — conceito de inatividade do risco de churn (Edge Function `ai-churn-analysis`).
//
// Defeito (docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md, IA-111): quando o contato
// não tinha mensagem, a idade de engajamento caía para `contacts.updated_at`. Como
// qualquer edição de cadastro grava `updated_at`, editar o contato "reiniciava" a
// inatividade e o risco despencava sem nenhuma interação nova.
//
// O aceite do item: "Editar um cadastro não reinicia artificialmente a contagem de
// engajamento do cliente."
//
// Estes testes provam:
//   (a) `analyzeChurnContacts` — o MESMO caminho de dados do handler, com um client
//       do banco de mentira que registra cada consulta: a linha do contato chega com
//       `updated_at` de HOJE e, mesmo assim, a idade vem da última mensagem; contato
//       sem mensagem devolve a lacuna explícita (`null`); a ordenação é por risco;
//       nenhuma consulta à tabela de cadastro acontece.
//   (b) `computeChurnSignal` — as bordas de corte (14/30/60/90 dias), o clock skew,
//       a saturação em 100 e as faixas de nível.
//
// Sem a correção (a) reprova: com o fallback antigo (`lastMsg?.created_at || contact.updated_at`)
// o contato editado devolve 0 dia e o teste do aceite falha (prova negativa por mutação).
//
// Roda sem rede, sem banco e sem env.
// Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env
//   supabase/functions/ai-churn-analysis/churn-risk.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analyzeChurnContacts,
  computeChurnSignal,
  getRiskLevel,
  type ChurnContactRow,
  type ChurnEngagement,
} from "./churn-risk.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** "Agora" fixo: o cálculo é determinístico e não depende do relógio da máquina. */
const NOW = new Date("2026-10-08T12:00:00.000Z");

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

const CONTATO_ID = "11111111-1111-4111-8111-111111111111";

/** Linha como o handler a recebe: `updated_at` presente (o cadastro foi editado). */
function contatoEditadoAgora(): ChurnContactRow {
  return {
    id: CONTATO_ID,
    name: "Contato de teste",
    created_at: isoDaysAgo(900),
    updated_at: NOW.toISOString(),
  };
}

function engajamento(overrides: Partial<ChurnEngagement>): ChurnEngagement {
  return { lastMessageAt: null, recentMessageCount: 0, totalMessageCount: 0, ...overrides };
}

// ---------------------------------------------------------------------------
// Client do banco de mentira: registra cada consulta e responde a cadeia
// PostgREST que `analyzeChurnContacts` usa (última mensagem + contagens).
// ---------------------------------------------------------------------------
interface LinhaMensagens {
  lastMessageAt: string | null;
  recent: number;
  total: number;
}
interface Captura {
  tabela: string;
  colunas: string;
}

function fakeAdmin(porContato: Record<string, LinhaMensagens>) {
  const capturas: Captura[] = [];

  function from(tabela: string) {
    const estado = { tabela, colunas: "", contato: "", comJanela: false };
    const q: Record<string, unknown> = {
      select(colunas: string) {
        estado.colunas = colunas;
        capturas.push({ tabela: estado.tabela, colunas });
        return q;
      },
      eq(_coluna: string, valor: unknown) {
        if (!estado.contato) estado.contato = String(valor);
        return q;
      },
      gte() {
        estado.comJanela = true;
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return q;
      },
      maybeSingle() {
        const linha = porContato[estado.contato];
        return Promise.resolve({
          data: linha?.lastMessageAt ? { created_at: linha.lastMessageAt, updated_at: NOW.toISOString() } : null,
          error: null,
        });
      },
      then(resolve: (valor: { count: number; error: null }) => unknown) {
        const linha = porContato[estado.contato];
        const count = estado.comJanela ? (linha?.recent ?? 0) : (linha?.total ?? 0);
        return Promise.resolve({ count, error: null }).then(resolve);
      },
    };
    return q;
  }

  return { client: { from }, capturas };
}

// ---------------------------------------------------------------------------
// (a) o aceite: editar o cadastro não reinicia a contagem de engajamento
// ---------------------------------------------------------------------------
Deno.test("IA-111: cadastro editado HOJE não reinicia a inatividade (última mensagem há 100 dias)", async () => {
  // 20 mensagens no histórico, 20 nos últimos 30 dias, nenhuma há 100 dias.
  // Antes da correção a idade vinha de `updated_at` (= agora) e o risco sumia.
  const { client } = fakeAdmin({
    [CONTATO_ID]: { lastMessageAt: isoDaysAgo(100), recent: 20, total: 20 },
  });

  const resultados = await analyzeChurnContacts(client, [contatoEditadoAgora()], NOW);

  assertEquals(resultados.length, 1);
  const sinal = resultados[0];
  assertEquals(sinal.daysSinceLastMessage, 100, "a idade de engajamento tem de vir da última mensagem");
  assertEquals(sinal.hasInteractionHistory, true);
  // Inatividade > 90 dias = 40 pontos; sem queda de ritmo e sem baixo total.
  assertEquals(sinal.riskScore, 40, "o `updated_at` do cadastro não pode pontuar nem zerar");
  assertEquals(sinal.riskLevel, "medium");
  assert(
    sinal.reasons.includes("100 dias sem interação"),
    `motivo da inatividade ausente: ${JSON.stringify(sinal.reasons)}`,
  );
});

Deno.test("IA-111: contato sem NENHUMA mensagem declara a lacuna (não herda o cadastro)", async () => {
  const { client } = fakeAdmin({ [CONTATO_ID]: { lastMessageAt: null, recent: 0, total: 0 } });

  const [sinal] = await analyzeChurnContacts(client, [contatoEditadoAgora()], NOW);

  assertEquals(sinal.daysSinceLastMessage, null, "sem mensagem não existe 'dias desde a última interação'");
  assertEquals(sinal.hasInteractionHistory, false, "a lacuna de histórico tem de ser explícita");
  // Único fator aplicável: totalMessageCount <= 1 → 30 pontos.
  assertEquals(sinal.riskScore, 30);
  assert(
    sinal.reasons.includes("Sem histórico de interação registrado"),
    `motivo da lacuna ausente: ${JSON.stringify(sinal.reasons)}`,
  );
});

Deno.test("IA-111: a análise só consulta as MENSAGENS (o cadastro não é entrada)", async () => {
  const { client, capturas } = fakeAdmin({
    [CONTATO_ID]: { lastMessageAt: isoDaysAgo(3), recent: 5, total: 5 },
  });

  await analyzeChurnContacts(client, [contatoEditadoAgora()], NOW);

  assertEquals(capturas.length, 3, "uma consulta de última mensagem e duas contagens por contato");
  for (const captura of capturas) {
    assertEquals(captura.tabela, "messages", `consulta inesperada à tabela ${captura.tabela}`);
    assert(!captura.colunas.includes("updated_at"), `a consulta voltou a ler updated_at: ${captura.colunas}`);
  }
});

Deno.test("IA-111: o resultado é ordenado do maior risco para o menor", async () => {
  const outroId = "22222222-2222-4222-8222-222222222222";
  const { client } = fakeAdmin({
    [CONTATO_ID]: { lastMessageAt: isoDaysAgo(100), recent: 0, total: 2 },
    [outroId]: { lastMessageAt: isoDaysAgo(2), recent: 30, total: 30 },
  });

  const resultados = await analyzeChurnContacts(
    client,
    [{ id: outroId, name: "Recente", created_at: isoDaysAgo(900) }, contatoEditadoAgora()],
    NOW,
  );

  assertEquals(resultados.map((r) => r.contactId), [CONTATO_ID, outroId]);
  assert(resultados[0].riskScore > resultados[1].riskScore, "a ordem tem de seguir o risco");
});

// ---------------------------------------------------------------------------
// (a) bordas de número dos cortes de inatividade (14/30/60/90 dias)
// ---------------------------------------------------------------------------
// Total e recente altos: a única fonte de pontos é a inatividade (>14 → 10,
// >30 → 20, >60 → 30, >90 → 40). O limite é ESTRITO — o dia exato do corte não
// pontua no degrau seguinte.
const BORDAS: Array<[dias: number, score: number]> = [
  [14, 0],
  [15, 10],
  [30, 10],
  [31, 20],
  [60, 20],
  [61, 30],
  [90, 30],
  [91, 40],
];

for (const [dias, score] of BORDAS) {
  Deno.test(`IA-111: ${dias} dias de inatividade → ${score} pontos (corte estrito)`, () => {
    const sinal = computeChurnSignal(
      { id: CONTATO_ID, name: "Contato de teste", created_at: isoDaysAgo(900) },
      engajamento({ lastMessageAt: isoDaysAgo(dias), recentMessageCount: 20, totalMessageCount: 20 }),
      NOW,
    );
    assertEquals(sinal.daysSinceLastMessage, dias);
    assertEquals(sinal.riskScore, score);
  });
}

Deno.test("IA-111: mensagem com carimbo futuro (clock skew) não gera dias negativos", () => {
  const sinal = computeChurnSignal(
    { id: CONTATO_ID, name: "Contato de teste", created_at: isoDaysAgo(900) },
    engajamento({
      lastMessageAt: new Date(NOW.getTime() + 3 * DAY_MS).toISOString(),
      recentMessageCount: 20,
      totalMessageCount: 20,
    }),
    NOW,
  );

  assertEquals(sinal.daysSinceLastMessage, 0, "dias negativos viram 0, nunca -3");
  assertEquals(sinal.hasInteractionHistory, true);
});

Deno.test("IA-111: o score satura em 100 (índice de risco, não probabilidade)", () => {
  const sinal = computeChurnSignal(
    { id: CONTATO_ID, name: "Contato de teste", created_at: isoDaysAgo(900) },
    engajamento({ lastMessageAt: isoDaysAgo(365), recentMessageCount: 0, totalMessageCount: 1 }),
    NOW,
  );

  // 40 (inatividade) + 30 (queda de ritmo) + 30 (total <= 1) = 100.
  assertEquals(sinal.riskScore, 100);
  assertEquals(sinal.riskLevel, "critical");
});

Deno.test("getRiskLevel: faixas do índice de risco", () => {
  assertEquals(getRiskLevel(0), "low");
  assertEquals(getRiskLevel(39), "low");
  assertEquals(getRiskLevel(40), "medium");
  assertEquals(getRiskLevel(59), "medium");
  assertEquals(getRiskLevel(60), "high");
  assertEquals(getRiskLevel(79), "high");
  assertEquals(getRiskLevel(80), "critical");
  assertEquals(getRiskLevel(100), "critical");
});
