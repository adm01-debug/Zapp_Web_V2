/**
 * Contrato: o retrato do ambiente versionado no repo (`public/version.json`) não anuncia
 * a Evolution da infra antiga (SL-212).
 *
 * O item aponta a linha 6 deste arquivo (docs/audits/AUDITORIA_REFERENCIAS_DB_2026-08-28.md,
 * seção "Porta ... não é banco de dados (Evolution API), mas é inconsistência do mesmo tipo").
 * Ele dizia `https://evolution.atomicabr.com.br` — a Evolution v2 da infra antiga — enquanto
 * `.env.production`, `.env.example` e o `CLAUDE.md` (seção "Evolution GO — Hostinger") apontam
 * a Evolution GO em `https://evolution-go-rxj2.srv1481814.hstgr.cloud`. Eram dois retratos do
 * MESMO ambiente discordando entre si: quem abria o arquivo (suporte, diagnóstico de
 * incidente, quem lê o retrato do ambiente) era mandado para o host errado.
 *
 * (Medido com `bun run build`: o Vite emite o SEU `dist/version.json` = `{"buildId"}` e o
 * arquivo de `public/` NÃO chega ao `dist/` — o retrato que a Vercel publica é o do plugin.
 * Ou seja, o defeito deste cartão é o do arquivo versionado, não o do artefato publicado.)
 *
 * O contrato pina três coisas, todas sobre o campo `evolution`:
 *   1. ele é exatamente o `VITE_EVOLUTION_API_URL` que o app publica (`.env.production`);
 *   2. ele é exatamente o `EVOLUTION_API_URL` documentado em `.env.example`;
 *   3. nenhum host da infra antiga (`atomicabr`) sobrevive no retrato público.
 *
 * Alinhar para BAIXO (copiar um host legado para as envs) não passa: a asserção 4 pega o host
 * antigo dos DOIS lados — o retrato e as envs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..', '..');

const VERSION_JSON = 'public/version.json';
const ENV_PRODUCAO = '.env.production';
const ENV_EXEMPLO = '.env.example';

/** Host da Evolution da infra antiga (v2/Portainer). Nao pode voltar ao retrato publico. */
const HOST_LEGADO = 'atomicabr';

function ler(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf8');
}

/** Valor de uma variavel de ambiente declarada (linha `CHAVE=valor`, nao comentada). */
function env(rel: string, chave: string): string {
  const linha = ler(rel)
    .split('\n')
    .find((l) => l.startsWith(`${chave}=`));
  if (!linha) throw new Error(`${rel} nao declara ${chave}`);
  return linha.slice(chave.length + 1).trim();
}

const retrato = JSON.parse(ler(VERSION_JSON)) as { evolution?: string };

describe('contrato: /version.json publicado anuncia a Evolution que o app usa', () => {
  it(`declara o mesmo VITE_EVOLUTION_API_URL de ${ENV_PRODUCAO}`, () => {
    expect(retrato.evolution).toBe(env(ENV_PRODUCAO, 'VITE_EVOLUTION_API_URL'));
  });

  it(`declara o mesmo EVOLUTION_API_URL de ${ENV_EXEMPLO}`, () => {
    expect(retrato.evolution).toBe(env(ENV_EXEMPLO, 'EVOLUTION_API_URL'));
  });

  it('nao guarda o host da Evolution da infra antiga', () => {
    expect(retrato.evolution ?? '').not.toContain(HOST_LEGADO);
  });

  it(`as envs de referencia tambem nao apontam o host antigo (nao alinhar para baixo)`, () => {
    expect(env(ENV_PRODUCAO, 'VITE_EVOLUTION_API_URL')).not.toContain(HOST_LEGADO);
    expect(env(ENV_EXEMPLO, 'EVOLUTION_API_URL')).not.toContain(HOST_LEGADO);
  });

  it('declara uma URL https (retrato vazio/relativo nao serve)', () => {
    expect(retrato.evolution).toMatch(/^https:\/\/[^\s/]+/);
  });
});
