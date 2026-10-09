/**
 * t_fd52bf49 — prova de bundle: nada que não é do first paint pode entrar no
 * grafo ESTÁTICO do entry (o que o `index.html` pré-carrega e o
 * `bundle-budget.mjs` mede como `initial-js`).
 *
 * Hóspede medido em 09/10/2026: `sonner` — o viewport de toasts é overlay de
 * segundo plano: nenhum toast existe antes do first paint e o `toast()`
 * bufferiza chamadas feitas antes do <Toaster> montar (Observer do pacote).
 * Mesmo assim `App.tsx` importava `@/components/ui/sonner` estaticamente e
 * `useGlobalKeyboardShortcuts` importava `toast` — juntos colocavam a lib
 * (~9 KB gzip) no inicial.
 *
 * A pilha de sessão de telefonia (`CallSessionProvider`) continua no grafo
 * estático de propósito: ela envolve o app inteiro, e deixá-la lazy poria todos
 * os filhos atrás de um chunk dinâmico (cascata no first paint e falha da
 * telefonia derrubando o app). Por isso não há caso dela aqui. Só que ela e os
 * seus hooks também importavam `toast` de 'sonner' estaticamente
 * (`CallSessionProvider`, `useSipConnection`, `sipProvisioning`,
 * `useMicrophoneGuard`, `useCallEngineSink`): esses cinco passam pela fachada
 * `@/lib/lazyToast`, e este caso cobre todos os importadores. (`cb2bebc18`
 * devolveu o import estático ao `CallSessionProvider` depois da primeira
 * medição — foi o que deixou este caso vermelho na ponta de 09/10.)
 *
 * O teste empacota o app de verdade com o MESMO `vite build` do CI (vite.config
 * real, modo produção) e percorre o fechamento de imports estáticos a partir do
 * chunk do entry: nenhum chunk alcançado estaticamente pode conter os módulos
 * marcados.
 *
 * O controle prova que os módulos continuam empacotados (alcançados só por
 * `import()` dinâmico) — sem ele, um tree-shake que removesse o código do
 * pacote inteiro também passaria no teste principal.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { build } from 'vite';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '../..');

interface BuildChunk {
  type: string;
  fileName: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: string[];
  moduleIds?: string[];
  modules?: Record<string, unknown>;
}

const MARCA_SONNER = /node_modules[\\/]sonner[\\/]|src[\\/]components[\\/]ui[\\/]sonner\.tsx/;

function modulosDoChunk(chunk: BuildChunk): string[] {
  return chunk.moduleIds ?? Object.keys(chunk.modules ?? {});
}

let pacoteCache: Promise<BuildChunk[]> | null = null;

/** Chunks JS emitidos pelo `vite build` real (vite.config.ts, modo production). */
function empacotarApp(): Promise<BuildChunk[]> {
  return (pacoteCache ??= empacotarAppUmaVez());
}

async function empacotarAppUmaVez(): Promise<BuildChunk[]> {
  // NODE_ENV=production para o build do teste ter as MESMAS definições do build
  // do CI (o vitest roda com NODE_ENV=test) — mesmo cuidado do
  // singu-adapter.bundle.test.ts.
  vi.stubEnv('NODE_ENV', 'production');
  try {
    const result = await build({
      configFile: path.resolve(rootDir, 'vite.config.ts'),
      root: rootDir,
      mode: 'production',
      logLevel: 'silent',
      build: { write: false, emptyOutDir: false },
    });
    const output = Array.isArray(result)
      ? (result as { output: BuildChunk[] }[]).flatMap((item) => item.output)
      : (result as { output: BuildChunk[] }).output;
    return output.filter((item) => item.type === 'chunk');
  } finally {
    vi.unstubAllEnvs();
  }
}

/** Fechamento transitivo dos imports ESTÁTICOS a partir do chunk do entry. */
function grafoEstatico(chunks: BuildChunk[]): Set<string> {
  const porNome = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const entry = chunks.find(
    (chunk) => chunk.isEntry || (chunk.facadeModuleId ?? '').endsWith('main.tsx'),
  );
  if (!entry) throw new Error('chunk do entry não encontrado no pacote');
  const alcancados = new Set<string>();
  const pilha = [entry.fileName];
  while (pilha.length) {
    const nome = pilha.pop()!;
    if (alcancados.has(nome)) continue;
    alcancados.add(nome);
    pilha.push(...(porNome.get(nome)?.imports ?? []));
  }
  return alcancados;
}

describe('bundle inicial', () => {
  it('sonner (toasts são overlay lazy) não entra no grafo estático do entry', async () => {
    const chunks = await empacotarApp();
    const estaticos = grafoEstatico(chunks);

    const vazou = chunks.filter(
      (chunk) =>
        estaticos.has(chunk.fileName) &&
        modulosDoChunk(chunk).some((id) => MARCA_SONNER.test(id)),
    );

    expect(
      vazou.map((chunk) => chunk.fileName),
      'sonner voltou ao bundle inicial — importe com lazy()/import()',
    ).toEqual([]);
  }, 120_000);

  it('controle: sonner continua empacotado, fora do entry', async () => {
    const chunks = await empacotarApp();

    // Sem este controle, um pacote sem o código passaria no teste acima.
    const presentes = chunks.filter((chunk) =>
      modulosDoChunk(chunk).some((id) => MARCA_SONNER.test(id)),
    );
    expect(presentes.length, 'sonner sumiu do pacote inteiro').toBeGreaterThan(0);
    for (const chunk of presentes) {
      expect(chunk.isEntry, `${chunk.fileName} com sonner não pode ser entry`).not.toBe(true);
    }
  }, 120_000);
});
