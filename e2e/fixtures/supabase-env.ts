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

function required(name: string): string {
  const value = process.env[name] ?? fromEnvFile(name);
  if (!value) {
    throw new Error(
      `[e2e] ${name} nao definida. Defina no ambiente ou garanta .env.production na raiz do repo.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = required('VITE_SUPABASE_PUBLISHABLE_KEY');
