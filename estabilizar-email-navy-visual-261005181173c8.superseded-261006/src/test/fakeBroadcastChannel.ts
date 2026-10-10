import { vi } from 'vitest';

/**
 * `BroadcastChannel` de mentira que liga as "abas" que compartilham o mesmo nome.
 *
 * A semântica central é a do navegador: a mensagem NÃO volta para quem a postou.
 * Os testes de eleição de aba dependem disso para provar que o emissor não
 * aprende o próprio papel pelo próprio aviso.
 *
 * Extraído de `src/lib/__tests__/mediaVolumeStore.test.ts` para reuso.
 */
export class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();

  constructor(private readonly name: string) {
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set<FakeBroadcastChannel>();
    peers.add(this);
    FakeBroadcastChannel.channels.set(name, peers);
  }

  postMessage(data: unknown): void {
    const peers: FakeBroadcastChannel[] = Array.from(
      FakeBroadcastChannel.channels.get(this.name) ?? new Set<FakeBroadcastChannel>(),
    );
    for (const peer of peers) {
      if (peer !== this) peer.onmessage?.({ data } as MessageEvent);
    }
  }

  static reset(): void {
    FakeBroadcastChannel.channels.clear();
  }
}
