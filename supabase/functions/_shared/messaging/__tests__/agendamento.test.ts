// Contrato da fila de agendamento (`scheduled_messages`) — item #196 (R2-API-017).
//
// O defeito auditado e a AUSENCIA de executor versionado: o produtor insere pendencia,
// lista e cancela, os estados existem na tabela, e nenhum codigo versionado entrega. Este
// teste faz tres coisas, todas contra o codigo REAL:
//
//   1. prova o defeito — varre `supabase/functions` e exige ZERO consumidor da tabela;
//   2. prova que o registro versionado diz a verdade sobre isso (nao declara executor
//      que nao existe) e que ele carrega os quatro requisitos do aceite;
//   3. guarda o futuro — se um consumidor aparecer sem o registro ser atualizado, o
//      teste cai (a fila nao volta a ser meio-ligada em silencio).
//
// O teste 3 e o que falha se o registro mentir: basta declarar um executor inexistente
// (ou remover o modulo, que e o estado anterior a correcao) para a suite ficar vermelha.

import { assertEquals, assertFalse, assert, assertMatch } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  AGENDAMENTO_VERSION,
  CONTRATO_DO_EXECUTOR,
  ESTADOS_DA_FILA,
  EXECUTOR_DE_AGENDAMENTO,
  PREREQUISITOS_ABERTOS,
  TABELA_DA_FILA,
  agendamentoTemExecutorVersionado,
  descreverAgendamento,
  descreverEstadoDaFila,
  estadoDaFilaConhecido,
  estadosAlcancadosPorExecutor,
} from "../agendamento.ts";

// Raiz do repositorio a partir do proprio arquivo de teste:
// supabase/functions/_shared/messaging/__tests__/ -> 5 niveis acima.
const RAIZ = new URL("../../../../../", import.meta.url);

async function arquivosDe(caminho: string): Promise<string[]> {
  const encontrados: string[] = [];
  for await (const entrada of Deno.readDir(caminho)) {
    const filho = `${caminho}/${entrada.name}`;
    if (entrada.isDirectory) encontrados.push(...(await arquivosDe(filho)));
    else if (entrada.isFile) encontrados.push(filho);
  }
  return encontrados;
}

/** Arquivos versionados de Edge Function que leem a tabela da fila (o consumidor). */
async function consumidoresVersionadosDaFila(): Promise<string[]> {
  const raizFuncoes = decodeURIComponent(new URL("supabase/functions", RAIZ).pathname);
  const arquivos = await arquivosDe(raizFuncoes);
  const consumidores: string[] = [];
  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".ts") && !arquivo.endsWith(".tsx")) continue;
    // O proprio registro e este teste citam a tabela de proposito.
    if (arquivo.includes("agendamento")) continue;
    const conteudo = await Deno.readTextFile(arquivo);
    if (conteudo.includes(TABELA_DA_FILA)) consumidores.push(arquivo.replace(`${raizFuncoes}/`, ""));
  }
  return consumidores;
}

Deno.test("#196 prova do defeito: nenhuma Edge Function versionada consome a fila", async () => {
  const consumidores = await consumidoresVersionadosDaFila();
  assertEquals(
    consumidores,
    [],
    `ha consumidor versionado da fila: ${consumidores.join(", ")} — atualize o registro de execucao (agendamento.ts) no mesmo commit`,
  );
});

Deno.test("#196 registro: a fila nao tem executor versionado e a versao esta pinada", () => {
  assertFalse(agendamentoTemExecutorVersionado());
  assertEquals(EXECUTOR_DE_AGENDAMENTO, null);
  assertEquals(TABELA_DA_FILA, "scheduled_messages");
  assertMatch(AGENDAMENTO_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
});

Deno.test("#196 guarda: o registro de execucao bate com a arvore versionada", async () => {
  const consumidores = await consumidoresVersionadosDaFila();
  assertEquals(
    agendamentoTemExecutorVersionado(),
    consumidores.length > 0,
    consumidores.length > 0
      ? `ha consumidor versionado (${consumidores.join(", ")}) mas o registro diz que nao ha executor`
      : "nao ha consumidor versionado em supabase/functions, mas o registro declara um executor — o registro mentiria para a tela",
  );
});

Deno.test("#196 registro: os quatro requisitos do aceite estao declarados", () => {
  assert(CONTRATO_DO_EXECUTOR.claim.length > 0, "claim vazio");
  assert(CONTRATO_DO_EXECUTOR.autorizacao.length > 0, "autorizacao vazia");
  assert(CONTRATO_DO_EXECUTOR.reconciliacao.length > 0, "reconciliacao vazia");
  assert(CONTRATO_DO_EXECUTOR.estadosRecuperaveis.length > 0, "estados recuperaveis vazios");
  assert(PREREQUISITOS_ABERTOS.length > 0, "prerequisitos abertos vazios");
});

Deno.test("#196 registro: os estados declarados sao os da tabela", () => {
  assertEquals([...ESTADOS_DA_FILA], ["pending", "sent", "failed", "cancelled"]);
  assert(estadoDaFilaConhecido("pending"));
  assertFalse(estadoDaFilaConhecido("sending"));
  // Sem executor, nenhum estado terminal e alcancado por codigo versionado.
  assertEquals([...estadosAlcancadosPorExecutor()], []);
});

Deno.test("#196 registro: o texto operacional nao promete entrega", () => {
  const texto = descreverAgendamento();
  assert(texto.includes("nenhum executor versionado"), "texto nao declara a ausencia de executor");
  assert(texto.includes(AGENDAMENTO_VERSION), "texto nao carrega a versao do registro");
  assertFalse(texto.includes("entregue"), "texto promete entrega");
  assertFalse(texto.includes("enviada"), "texto promete envio");
  assert(descreverEstadoDaFila("sent").includes("nao sao escritos"));
  assert(descreverEstadoDaFila("inventado").includes("desconhecido"));
});
