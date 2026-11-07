// Fonte unica dos valores de Supabase para os testes E2E.
//
// Por que nao literais: a chave publishable estava escrita em 4 arquivos de e2e/
// (contact-form-email-duplicate.spec.ts, fixtures/contacts-page.ts,
// fixtures/e2e-contact.ts, fixtures/e2e-talkx.ts) alem de .env.production.
// Aqui ela vem de UMA fonte, com precedencia:
//   1) process.env  — permite o CI injetar/secrets sobrescrever;
//   2) fallback: .env.production versionado (o mesmo arquivo que o build usa),
//      lido explicitamente porque o runner do Playwright e Node puro e NAO
//      carrega .env automaticamente.
//
// Os valores sao exatamente os mesmos dos literais que esta fixture substituiu.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.env.production');

function fromEnvFile(name: string): string | undefined {
  try {
    const content = readFileSync(ENV_FILE, 'utf8');
    for (const rawLine of content.split('\n')) {
      const match = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(rawLine);
      if (!match || match[1] !== name) continue;
      return match[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // arquivo ausente: o erro claro sai em required()
  }
  return undefined;
}

function fromEnvFileStrict(name: string): string {
  const value = fromEnvFile(name);
  if (!value) {
    throw new Error(
      `[e2e] ${name} nao encontrada em .env.production. Esse arquivo e a fonte PRIMARIA ` +
        'de proposito: teste que escreve nao pode ser desviado para outro projeto por ' +
        'variavel de ambiente. Confira .env.production na raiz do repo ou use o override ' +
        'E2E_SUPABASE_*_OVERRIDE conscientemente.',
    );
  }
  return value;
}

function isolatedConfiguration(): { url: string; key: string } | null {
  const mode = process.env.ZAPP_E2E_LOCAL;
  if (!mode) return null;
  const deny = () => { throw new Error('[e2e/isolated-fixture] configuração local incompleta ou divergente'); };
  if (mode !== '1') return deny();
  const url = process.env.E2E_SUPABASE_URL_OVERRIDE?.trim();
  const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE?.trim();
  const appUrl = process.env.VITE_ZAPP_LOCAL_SUPABASE_URL?.trim();
  const appKey = process.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || url !== 'https://127.0.0.1:5173' || url !== appUrl || !Object.is(key, appKey)) return deny();
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts[2]) return deny();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'HS256' || claims.role !== 'anon' || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000) return deny();
  } catch { return deny(); }
  return { url, key };
}

// No modo isolado, a decisão precede qualquer leitura de .env.production. A
// admissão do setup confere também a posse, o namespace e o hash desta anon key.
const isolated = isolatedConfiguration();
const FILE_URL = isolated ? undefined : fromEnvFileStrict('VITE_SUPABASE_URL');
const FILE_KEY = isolated ? undefined : fromEnvFileStrict('VITE_SUPABASE_PUBLISHABLE_KEY');

// O contrato legado, fora do modo isolado, preserva a fonte primária e o
// override dedicado. Somente no modo isolado os pares app/fixture devem coincidir.
export const SUPABASE_URL = isolated?.url || process.env.E2E_SUPABASE_URL_OVERRIDE?.trim() || FILE_URL!;
export const SUPABASE_ANON_KEY = isolated?.key || process.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE?.trim() || FILE_KEY!;
export const SUPABASE_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
