import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SL-123 — `mapboxLoader.ts` estava em 0% de cobertura.
 *
 * O motivo não era o módulo ser "impossível de testar": os 6 arquivos de teste
 * que dependem dele mockam `@/lib/mapboxLoader` INTEIRO
 * (`vi.mock('@/lib/mapboxLoader', () => ({ loadMapbox: () => h.loadMapbox() }))`),
 * então o carregador real nunca era executado. Aqui o carregador REAL roda:
 * import dinâmico (JS + CSS), cache do chunk e caminho de erro.
 *
 * Os dois `import()` do módulo são interceptados por id — o pacote do mapa e o
 * CSS dele. `vi.resetModules()` entre os testes dá a cada um uma avaliação nova.
 */

const idJs = "mapbox-gl";
const idCss = "mapbox-gl/dist/mapbox-gl.css";

const fakeMapbox = { Map: class {}, Marker: class {} };

beforeEach(() => {
  vi.resetModules();
});

describe("mapboxLoader", () => {
  it("resolve o módulo do mapa e reaproveita o import nas chamadas seguintes", async () => {
    vi.doMock(idJs, () => ({ default: fakeMapbox }));
    vi.doMock(idCss, () => ({}));

    const { loadMapbox } = await import("../mapboxLoader");

    const primeira = loadMapbox();
    const segunda = loadMapbox();

    await expect(primeira).resolves.toBe(fakeMapbox);
    // O chunk vendor-maps é pago uma vez só: mesma promise, não um import novo.
    expect(segunda).toBe(primeira);
  });

  it("libera o cache quando o import falha, para a próxima chamada tentar de novo", async () => {
    vi.doMock(idJs, () => ({ default: fakeMapbox }));
    vi.doMock(idCss, () => {
      throw new Error("css-do-chunk-indisponivel");
    });

    const { loadMapbox } = await import("../mapboxLoader");

    // Falha do cargo dinâmico: o import rejeita (aqui, o módulo mockado falha ao
    // ser avaliado) e o `catch` do carregador repassa o erro.
    const falha = loadMapbox();
    const erro = await falha.catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(Error);

    vi.resetModules();
    vi.doMock(idCss, () => ({}));

    // Sem o `pending = null` do catch, esta chamada devolveria a MESMA promise
    // já rejeitada (cache envenenado) e o mapa nunca mais carregaria na sessão.
    const retentativa = loadMapbox();

    expect(retentativa).not.toBe(falha);
    await expect(retentativa).resolves.toBe(fakeMapbox);
  });
});
