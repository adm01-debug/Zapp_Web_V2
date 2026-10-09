import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// R2-INF-012 — prova de orçamento/rate limit terminava com `FIM_PROVA=ok` sem
// conferir comportamento: a função `chamar` imprimia status/corpo e não os
// validava, o script não usava errexit e nada correlacionava as chamadas aos
// registros. Três erros HTTP ou uma falha de transporte bastavam para "passar".
//
// R2-INF-012 (recusa #359) — a correlação era FALSA: o `RUN_ID` existia no
// roteiro, mas não era enviado às chamadas nem usado na consulta. Filtrar só por
// `function_name` + `created_at` conta registros de qualquer execução concorrente
// na mesma janela e aprova sem provar o consumo DESTE run.
//
// Aqui o script é executado de VERDADE (bash, processo filho) contra um servidor
// local que faz o papel do Supabase. O servidor HONRA os filtros da query, como o
// PostgREST, e guarda o que recebeu — só assim o teste consegue provar três
// coisas diferentes: (a) o identificador do run VAI nas chamadas verificadas,
// (b) a leitura de `ai_usage_logs` FILTRA por ele e (c) linhas de OUTRO run não
// satisfazem o critério de consumo (prova negativa).

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(RAIZ, 'scripts', 'qa', 'prova-orcamento-rate-limit.sh');
const FUNCAO = 'classify-audio-meme';
const RUN_ID = '00000000-0000-4000-8000-000000000000';
const OUTRO_RUN_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORIA = { category: 'risada' };
const ROTA_FUNCAO = `/functions/v1/${FUNCAO}`;
const ROTA_CONSUMO = '/rest/v1/ai_usage_logs';
/** IA-051 — header em que o cliente manda o id opaco da execução de IA. */
const HEADER_RUN = 'x-ai-request-id';

/** Linhas de `ai_usage_logs` de UM run, como o servidor as devolveria. */
function linhasDeConsumo(quantidade, runId = RUN_ID) {
  return Array.from({ length: quantidade }, (_, i) => ({
    id: `${runId}:${i}`,
    request_id: runId,
    function_name: FUNCAO,
    status: 'success',
    model: 'modelo-stub',
  }));
}

/**
 * Aplica os filtros da query como o PostgREST: `eq.` é igualdade e `gte.` é
 * comparação de INSTANTE (numérica, não texto — `2026-10-06T18:00:00.123Z` é
 * maior que `2026-10-06T18:00:00Z`, embora o texto ordene ao contrário).
 * Parâmetro que não é filtro (`select=...`) é ignorado. É esta função que dá
 * dentes à prova negativa: sem o filtro por `request_id` o script recebe as
 * linhas alheias.
 */
function filtrarPorBusca(linhas, busca) {
  return linhas.filter((linha) => {
    for (const [campo, valor] of busca) {
      const atual = String(linha[campo] ?? '');
      if (valor.startsWith('eq.') && atual !== valor.slice(3)) return false;
      if (valor.startsWith('gte.') && !(Date.parse(atual) >= Date.parse(valor.slice(4)))) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Sobe o "Supabase" local. Cada rota casa por prefixo de URL e responde com a
 * resposta da vez (`respostas` é consumida uma por acerto; a última se repete).
 * Uma rota com `linhas` se comporta como a tabela `ai_usage_logs`: filtra o
 * conjunto pelo que a query pediu. `pedidos` guarda método, caminho, query e
 * headers de tudo que chegou, para o teste conferir o que o script ENVIOU.
 */
function subirServidor(rotas) {
  const pedidos = [];
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    pedidos.push({ metodo: req.method, caminho: url.pathname, busca: url.search, headers: req.headers });
    const rota = rotas.find((r) => req.url.startsWith(r.prefixo));
    if (!rota) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    if (rota.destruirSocket) {
      req.socket.destroy();
      return;
    }
    if (rota.linhas) {
      // Como no banco: a linha guarda o instante em que nasceu. Carimbar aqui
      // garante que ela esteja dentro da janela `created_at >= RUN_INICIO`.
      const agora = new Date().toISOString();
      const linhas = rota.linhas.map((linha) => ({ ...linha, created_at: agora }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(filtrarPorBusca(linhas, url.searchParams)));
      return;
    }
    const lista = rota.respostas ?? [{ status: rota.status ?? 200, corpo: rota.corpo ?? {} }];
    const acertos = rota.acertos ?? 0;
    rota.acertos = acertos + 1;
    const escolhida = lista[Math.min(acertos, lista.length - 1)];
    res.writeHead(escolhida.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(escolhida.corpo));
  });
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${servidor.address().port}`,
        pedidos,
        fechar: () => new Promise((r) => servidor.close(() => r())),
      });
    });
  });
}

// Credenciais sintéticas: o teste nunca toca produção nem lê segredo de disco.
const CREDENCIAIS = {
  PROVA_PRODUCAO: 'sim',
  SUPABASE_ANON_KEY: 'chave-publicavel-de-teste',
  ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_EMAIL: 'qa@stub.invalid',
  ZAPP_MULTIPLIX_MULTIPLIX_COMPRAS_PASSWORD: 'senha-de-teste',
  ZAPP_PROVA_RUN_ID: RUN_ID,
  ZAPP_PROVA_ESPERA: '0',
};

function rodarProva(base, extra = {}) {
  const saida = mkdtempSync(join(tmpdir(), 'prova-orcamento-'));
  return new Promise((resolve) => {
    const proc = spawn('bash', [SCRIPT, saida], {
      env: { ...process.env, ...CREDENCIAIS, ZAPP_SUPABASE_URL: base, ...extra },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d;
    });
    proc.stderr.on('data', (d) => {
      stderr += d;
    });
    proc.on('error', (err) => {
      rmSync(saida, { recursive: true, force: true });
      resolve({ code: -1, stdout, stderr: `${stderr}${err.message}` });
    });
    proc.on('close', (code) => {
      rmSync(saida, { recursive: true, force: true });
      resolve({ code, stdout, stderr });
    });
  });
}

const CONTEXTO = (r) => `\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`;

/** Cenário feliz: login, 3 chamadas 200 e o consumo do run no ledger. */
function rotasFelizes(linhas = linhasDeConsumo(3)) {
  return [
    { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
    { prefixo: ROTA_FUNCAO, corpo: CATEGORIA },
    { prefixo: ROTA_CONSUMO, linhas },
  ];
}

describe('prova-orcamento-rate-limit: veredito medido (R2-INF-012)', () => {
  it('só emite FIM_PROVA=aprovado quando login, chamadas e consumo foram medidos', async () => {
    const s = await subirServidor(rotasFelizes());
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, `esperava exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /FIM_PROVA=aprovado/);
      assert.match(r.stdout, /CONSUMO_REGISTRADO=sim/);
    } finally {
      await s.fechar();
    }
  });

  it('manda o identificador do run nas chamadas verificadas e filtra a leitura por ele', async () => {
    const s = await subirServidor(rotasFelizes());
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, CONTEXTO(r));

      const chamadas = s.pedidos.filter((p) => p.caminho === ROTA_FUNCAO);
      assert.equal(chamadas.length, 3, `esperava 3 chamadas à função${CONTEXTO(r)}`);
      for (const [i, chamada] of chamadas.entries()) {
        assert.equal(
          chamada.headers[HEADER_RUN],
          RUN_ID,
          `chamada ${i + 1} foi ao provedor sem ${HEADER_RUN}: a correlação volta a ser só janela de horário`,
        );
      }

      const leituras = s.pedidos.filter((p) => p.caminho.startsWith(ROTA_CONSUMO));
      assert.ok(leituras.length > 0, `a prova tem de ler ${ROTA_CONSUMO}${CONTEXTO(r)}`);
      for (const leitura of leituras) {
        assert.ok(
          leitura.busca.includes(`request_id=eq.${RUN_ID}`),
          `leitura de ai_usage_logs sem filtro pelo run (busca=${leitura.busca})`,
        );
      }

      assert.match(r.stdout, new RegExp(`RUN_ID=${RUN_ID}`), CONTEXTO(r));
    } finally {
      await s.fechar();
    }
  });

  it('registros de OUTRA execução não satisfazem o critério de consumo do run', async () => {
    // Ledger com a mesma função e a mesma janela de horário, mas de outro run —
    // exatamente o caso que a recusa aponta como aprovação falsa.
    const s = await subirServidor(
      rotasFelizes([
        ...linhasDeConsumo(2, OUTRO_RUN_ID),
        { ...linhasDeConsumo(1, OUTRO_RUN_ID)[0], request_id: null },
      ]),
    );
    try {
      const r = await rodarProva(s.url);
      assert.notEqual(r.code, 0, `consumo de outro run não pode aprovar${CONTEXTO(r)}`);
      assert.match(r.stdout, /consumo nao registrado/, CONTEXTO(r));
      assert.match(r.stdout, /FIM_PROVA=falha/, CONTEXTO(r));
      assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('conta apenas as linhas do run quando há execução concorrente na mesma janela', async () => {
    const s = await subirServidor(
      rotasFelizes([...linhasDeConsumo(5, OUTRO_RUN_ID), ...linhasDeConsumo(3)]),
    );
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, CONTEXTO(r));
      assert.match(r.stdout, /FIM_PROVA=aprovado/, CONTEXTO(r));
      assert.match(
        r.stdout,
        /linhas_do_run=3\b/,
        `esperava contar só as 3 linhas do run, não as alheias${CONTEXTO(r)}`,
      );
    } finally {
      await s.fechar();
    }
  });

  it('derruba o veredito quando uma chamada responde erro HTTP', async () => {
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      {
        prefixo: ROTA_FUNCAO,
        respostas: [
          { status: 200, corpo: CATEGORIA },
          { status: 500, corpo: { error: 'boom' } },
          { status: 200, corpo: CATEGORIA },
        ],
      },
      { prefixo: ROTA_CONSUMO, linhas: linhasDeConsumo(3) },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.notEqual(r.code, 0, `erro HTTP não pode terminar com exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /CHAMADA2_HTTP=500/);
      assert.match(r.stdout, /FIM_PROVA=falha/, CONTEXTO(r));
      assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('derruba o veredito em falha de transporte (curl sem resposta)', async () => {
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      { prefixo: ROTA_FUNCAO, destruirSocket: true },
      { prefixo: ROTA_CONSUMO, linhas: linhasDeConsumo(3) },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.notEqual(r.code, 0, `falha de transporte não pode terminar com exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /transporte falhou/, CONTEXTO(r));
      assert.match(r.stdout, /FIM_PROVA=falha/);
      assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('vira inconclusivo — nunca aprovado — quando a leitura do consumo é negada', async () => {
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      { prefixo: ROTA_FUNCAO, corpo: CATEGORIA },
      {
        prefixo: ROTA_CONSUMO,
        respostas: [{ status: 403, corpo: { message: 'sem escopo para o papel' } }],
      },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.notEqual(r.code, 0, `inconclusivo não pode terminar com exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /FIM_PROVA=inconclusivo/, CONTEXTO(r));
      assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('vira falha quando o consumo do run não aparece (leitura funcionou, faltou a linha)', async () => {
    const s = await subirServidor(rotasFelizes([]));
    try {
      const r = await rodarProva(s.url);
      assert.notEqual(r.code, 0, JSON.stringify(r));
      assert.match(r.stdout, /consumo nao registrado/, CONTEXTO(r));
      assert.match(r.stdout, /FIM_PROVA=falha/);
      assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('vira inconclusivo quando ai_usage_logs responde HTTP 200 com corpo que não é array', async () => {
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      { prefixo: ROTA_FUNCAO, corpo: CATEGORIA },
      { prefixo: ROTA_CONSUMO, corpo: { message: 'resposta inesperada' } },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.notEqual(r.code, 0, `corpo não-array não pode terminar com exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /FIM_PROVA=inconclusivo/, CONTEXTO(r));
      assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('preserva os marcadores de status no roteiro SQL sem substituição de comando', async () => {
    const s = await subirServidor(rotasFelizes());
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, CONTEXTO(r));
      assert.match(r.stdout, /'status=success'/, CONTEXTO(r));
      assert.match(r.stdout, /'status=error'/, CONTEXTO(r));
      assert.match(r.stdout, new RegExp(`request_id = '${RUN_ID}'`), CONTEXTO(r));
      assert.doesNotMatch(r.stderr, /command not found/, CONTEXTO(r));
    } finally {
      await s.fechar();
    }
  });

  it('429 é resultado válido (prova do limite) e não derruba o veredito', async () => {
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      {
        prefixo: ROTA_FUNCAO,
        respostas: [
          { status: 200, corpo: CATEGORIA },
          { status: 429, corpo: { error: 'rate limit' } },
          { status: 429, corpo: { error: 'rate limit' } },
        ],
      },
      { prefixo: ROTA_CONSUMO, linhas: linhasDeConsumo(1) },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, `esperava exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /429 = rejeicao por rate limit/);
      assert.match(r.stdout, /FIM_PROVA=aprovado/);
    } finally {
      await s.fechar();
    }
  });

  it('recusa rodar com identificador de run que não é UUID (nunca mediria o consumo)', async () => {
    const r = await rodarProva('http://127.0.0.1:1', { ZAPP_PROVA_RUN_ID: 'run-1234-5678' });
    assert.equal(r.code, 2, CONTEXTO(r));
    assert.match(r.stdout, /FIM_PROVA=inconclusivo/, CONTEXTO(r));
    assert.doesNotMatch(r.stdout, /FIM_PROVA=aprovado/);
  });

  it('recusa rodar sem a confirmação explícita de produção', async () => {
    const r = await rodarProva('http://127.0.0.1:1', { PROVA_PRODUCAO: 'nao' });
    assert.equal(r.code, 2, CONTEXTO(r));
    assert.match(r.stdout, /RECUSADO/);
  });
});
