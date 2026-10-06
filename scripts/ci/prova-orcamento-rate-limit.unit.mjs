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
// Aqui o script é executado de VERDADE (bash, processo filho) contra um servidor
// local que faz o papel do Supabase — a lógica não é reimplementada no teste.
// Cada cenário mede o que faltava: transporte, código HTTP, corpo e o registro de
// consumo correlacionado ao run.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(RAIZ, 'scripts', 'qa', 'prova-orcamento-rate-limit.sh');
const FUNCAO = 'classify-audio-meme';
const CATEGORIA = { category: 'risada' };
const ROTA_FUNCAO = `/functions/v1/${FUNCAO}`;

function linhasDeConsumo(quantidade) {
  return Array.from({ length: quantidade }, () => ({
    request_id: null,
    function_name: FUNCAO,
    status: 'success',
    model: 'modelo-stub',
  }));
}

/**
 * Sobe o "Supabase" local. Cada rota casa por prefixo de URL e responde com a
 * resposta da vez (`respostas` é consumida uma por acerto; a última se repete).
 * Isso permite montar cenários onde a 2ª chamada falha, sem depender de rede.
 */
function subirServidor(rotas) {
  const pedidos = [];
  const servidor = http.createServer((req, res) => {
    pedidos.push(`${req.method} ${req.url}`);
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
  ZAPP_PROVA_RUN_ID: '00000000-0000-4000-8000-000000000000',
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

describe('prova-orcamento-rate-limit: veredito medido (R2-INF-012)', () => {
  it('só emite FIM_PROVA=aprovado quando login, chamadas e consumo foram medidos', async () => {
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      { prefixo: ROTA_FUNCAO, corpo: CATEGORIA },
      { prefixo: '/rest/v1/ai_usage_logs', corpo: linhasDeConsumo(3) },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, `esperava exit 0${CONTEXTO(r)}`);
      assert.match(r.stdout, /FIM_PROVA=aprovado/);
      assert.match(r.stdout, /CONSUMO_REGISTRADO=sim/);
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
      { prefixo: '/rest/v1/ai_usage_logs', corpo: linhasDeConsumo(3) },
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
      { prefixo: '/rest/v1/ai_usage_logs', corpo: linhasDeConsumo(3) },
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
        prefixo: '/rest/v1/ai_usage_logs',
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
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      { prefixo: ROTA_FUNCAO, corpo: CATEGORIA },
      { prefixo: '/rest/v1/ai_usage_logs', corpo: [] },
    ]);
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
      { prefixo: '/rest/v1/ai_usage_logs', corpo: { message: 'resposta inesperada' } },
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
    const s = await subirServidor([
      { prefixo: '/auth/v1/token', corpo: { access_token: 'jwt-de-teste' } },
      { prefixo: ROTA_FUNCAO, corpo: CATEGORIA },
      { prefixo: '/rest/v1/ai_usage_logs', corpo: linhasDeConsumo(3) },
    ]);
    try {
      const r = await rodarProva(s.url);
      assert.equal(r.code, 0, CONTEXTO(r));
      assert.match(r.stdout, /'status=success'/, CONTEXTO(r));
      assert.match(r.stdout, /'status=error'/, CONTEXTO(r));
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
      { prefixo: '/rest/v1/ai_usage_logs', corpo: linhasDeConsumo(1) },
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

  it('recusa rodar sem a confirmação explícita de produção', async () => {
    const r = await rodarProva('http://127.0.0.1:1', { PROVA_PRODUCAO: 'nao' });
    assert.equal(r.code, 2, CONTEXTO(r));
    assert.match(r.stdout, /RECUSADO/);
  });
});
