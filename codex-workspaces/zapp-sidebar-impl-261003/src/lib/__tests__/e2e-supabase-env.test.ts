import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// O vitest do CI coleta apenas src/**, e nao transforma arquivo fora de src/.
// Entao o modulo real e exercitado em processo filho (bun), com o ambiente que
// cada cenario pede. Nunca imprimimos a chave: so o md5.
const FIXTURE = resolve(process.cwd(), 'e2e/fixtures/supabase-env.ts');
const ENV_FILE = resolve(process.cwd(), '.env.production');

const md5 = (s: string) => createHash('md5').update(s).digest('hex').slice(0, 12);

function valorDoArquivo(nome: string): string {
  const conteudo = readFileSync(ENV_FILE, 'utf8');
  const linha = conteudo.split('\n').find((l) => l.trim().startsWith(`${nome}=`));
  return (linha ?? '')
    .split('=')
    .slice(1)
    .join('=')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/** Importa a fixture num processo bun limpo e devolve url + md5 da chave. */
function carregar(extraEnv: Record<string, string>) {
  const script = `
    const m = await import(${JSON.stringify(FIXTURE)});
    const { createHash } = await import('node:crypto');
    const md5 = (s) => createHash('md5').update(s).digest('hex').slice(0, 12);
    console.log(JSON.stringify({ url: m.SUPABASE_URL, key: md5(m.SUPABASE_ANON_KEY) }));
  `;
  const env = { ...process.env };
  for (const nome of [
    'E2E_SUPABASE_URL_OVERRIDE',
    'E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    delete env[nome];
  }
  const proc = spawnSync('bun', ['-e', script], {
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  if (proc.status !== 0) {
    return { erro: (proc.stderr || proc.stdout || '').split('\n')[0] };
  }
  return JSON.parse(proc.stdout.trim());
}

const URL_OFICIAL = valorDoArquivo('VITE_SUPABASE_URL');
const MD5_OFICIAL = md5(valorDoArquivo('VITE_SUPABASE_PUBLISHABLE_KEY'));

describe('e2e/fixtures/supabase-env — precedencia', () => {
  afterEach(() => {
    // nada a limpar: cada caso roda em processo proprio
  });

  it('usa o .env.production quando nao ha override', () => {
    const r = carregar({});
    expect(r.url).toBe(URL_OFICIAL);
    expect(r.key).toBe(MD5_OFICIAL);
  });

  it('IGNORA as variaveis VITE_* (o Supabase Cloud aponta para outro projeto)', () => {
    const r = carregar({
      VITE_SUPABASE_URL: 'https://projeto-errado.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'chave-do-projeto-errado',
    });
    expect(r.url).toBe(URL_OFICIAL);
    expect(r.url).not.toBe('https://projeto-errado.supabase.co');
    expect(r.key).toBe(MD5_OFICIAL);
  });

  it('o override dedicado (E2E_*) vence o arquivo', () => {
    const r = carregar({
      E2E_SUPABASE_URL_OVERRIDE: 'https://override.supabase.co',
      E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE: 'chave-do-override',
    });
    expect(r.url).toBe('https://override.supabase.co');
    expect(r.key).toBe(md5('chave-do-override'));
  });

  it('override em branco cai no arquivo', () => {
    const r = carregar({ E2E_SUPABASE_URL_OVERRIDE: '   ' });
    expect(r.url).toBe(URL_OFICIAL);
  });
});
