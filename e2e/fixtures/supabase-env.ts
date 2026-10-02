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

// Fonte PRIMARIA: .env.production versionado, que aponta para o projeto oficial.
const FILE_URL = fromEnvFileStrict('VITE_SUPABASE_URL');
const FILE_KEY = fromEnvFileStrict('VITE_SUPABASE_PUBLISHABLE_KEY');

// Override EXPLICITO, com nome dedicado (E2E_*), para redirecionar de proposito.
// Os nomes VITE_* NAO sao lidos aqui de proposito: o Supabase Cloud injeta essas
// variaveis apontando para outro projeto (ver src/integrations/supabase/client.ts),
// e um teste de e2e que escreve no banco nao pode cair no projeto errado em silencio.
export const SUPABASE_URL = process.env.E2E_SUPABASE_URL_OVERRIDE?.trim() || FILE_URL;
export const SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE?.trim() || FILE_KEY;
