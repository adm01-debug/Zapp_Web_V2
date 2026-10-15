/**
 * Refazer 1 do leitor unico do corpo de erro: `readAiErrorEnvelope`
 * (analysisConfigs) migrou o parser local para `readEdgeErrorBody`
 * (@/lib/invokeEdge). Refatoracao pura — mesmo comportamento; estes testes
 * fixam o comportamento no codigo migrado (envelope, corpo estranho, sem
 * context e corpo nao-JSON).
 */
import { describe, it, expect } from 'vitest';
import { readAiErrorEnvelope } from '../analysisConfigs';

function edgeError(body: unknown) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: { clone: () => ({ json: async () => body }) },
  };
}

describe('readAiErrorEnvelope — leitor unico do corpo de erro', () => {
  it('devolve o envelope { capability, status } lido do corpo', async () => {
    await expect(
      readAiErrorEnvelope(edgeError({ capability: 'Resumo', status: 429 })),
    ).resolves.toEqual({ capability: 'Resumo', status: 429 });
  });

  it('devolve null quando o corpo nao e envelope', async () => {
    await expect(readAiErrorEnvelope(edgeError({ error: 'x' }))).resolves.toBeNull();
  });

  it('devolve null sem context ou sem clone', async () => {
    await expect(readAiErrorEnvelope({ message: 'Failed to fetch' })).resolves.toBeNull();
    await expect(readAiErrorEnvelope({ message: 'x', context: {} })).resolves.toBeNull();
  });

  it('devolve null quando o corpo nao e JSON', async () => {
    const notJson = {
      message: 'Edge Function returned a non-2xx status code',
      context: { clone: () => ({ json: async () => { throw new Error('nao e JSON'); } }) },
    };
    await expect(readAiErrorEnvelope(notJson)).resolves.toBeNull();
  });
});
