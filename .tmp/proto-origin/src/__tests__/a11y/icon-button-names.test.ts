import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  scanSource,
  scanProject,
  toKeyCounts,
  findingKey,
  type IconButtonFinding,
} from "./scan-icon-buttons";

/**
 * UK-13 / UK-13b — trava (ratchet) que impede botão de ícone sem nome acessível.
 *
 * - Os casos sintéticos provam que a varredura DETECTA o botão sem nome e
 *   IGNORA o que tem nome (aria-label, aria-labelledby, title, filho sr-only).
 * - O caso da linha de base roda em `src/**` de verdade e falha se surgir
 *   ocorrência nova E se alguma ocorrência registrada for corrigida sem
 *   encolher a linha de base (só encolhe, nunca cresce).
 */

const BASELINE_PATH = path.join(
  process.cwd(),
  "src/__tests__/a11y/icon-buttons-baseline.json",
);
const baseline: IconButtonFinding[] = JSON.parse(
  fs.readFileSync(BASELINE_PATH, "utf8"),
).findings;

const TETO_BASELINE = 46;

const scan = (src: string) => scanSource(src, "Sintetico.tsx");

describe("varredura de botões de ícone — casos sintéticos", () => {
  it("detecta <Button size=\"icon\"> sem nome acessível", () => {
    const achados = scan(`const A = () => <Button size="icon"><Trash2 /></Button>;`);
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({ tag: "Button", line: 1 });
    expect(achados[0].snippet).toContain('size="icon"');
  });

  it("não acusa quando há aria-label", () => {
    expect(
      scan(`const A = () => <Button size="icon" aria-label="Excluir"><Trash2 /></Button>;`),
    ).toHaveLength(0);
  });

  it("não acusa quando há title", () => {
    expect(
      scan(`const A = () => <Button size="icon" title="Atualizar"><RefreshCw /></Button>;`),
    ).toHaveLength(0);
  });

  it("não acusa quando há aria-labelledby", () => {
    expect(
      scan(`const A = () => <Button size="icon" aria-labelledby="rotulo"><X /></Button>;`),
    ).toHaveLength(0);
  });

  it("não acusa quando o filho tem sr-only", () => {
    expect(
      scan(
        `const A = () => <Button size="icon"><Trash2 /><span className="sr-only">Excluir</span></Button>;`,
      ),
    ).toHaveLength(0);
  });

  it("acusa aria-label vazio", () => {
    expect(scan(`const A = () => <Button size="icon" aria-label=""><X /></Button>;`)).toHaveLength(1);
  });

  it("detecta a auto-fechante <Button size=\"icon\" />", () => {
    expect(scan(`const A = () => <Button size="icon" />;`)).toHaveLength(1);
  });

  it("detecta as variantes icon-sm e icon-lg", () => {
    expect(scan(`const A = () => <Button size="icon-sm"><X /></Button>;`)).toHaveLength(1);
    expect(scan(`const A = () => <Button size="icon-lg"><X /></Button>;`)).toHaveLength(1);
  });

  it("não acusa <Button size=\"default\"> com texto", () => {
    expect(scan(`const A = () => <Button size="default">Salvar</Button>;`)).toHaveLength(0);
  });

  it("detecta size em expressão literal", () => {
    expect(scan(`const A = () => <Button size={'icon'}><X /></Button>;`)).toHaveLength(1);
  });

  it("detecta size em expressão condicional com literal icon", () => {
    expect(
      scan(`const A = () => <Button size={compacto ? 'icon' : 'sm'}><X /></Button>;`),
    ).toHaveLength(1);
  });

  it("lê atributos depois de => sem confundir com o fechamento da tag", () => {
    // A "seta" contém `>`: uma varredura ingênua de primeiro `>` erraria aqui.
    const src = `const A = () => (\n  <Button\n    variant="ghost"\n    onClick={() => { apagar(id); abrirMenu(); }}\n    size="icon"\n  >\n    <Trash2 />\n  </Button>\n);`;
    const achados = scan(src);
    expect(achados).toHaveLength(1);
    expect(achados[0].tag).toBe("Button");
    expect(achados[0].snippet).toContain('size="icon"');
  });

  it("detecta <IconButton> sem nome", () => {
    expect(scan(`const A = () => <IconButton onClick={f}><X /></IconButton>;`)).toHaveLength(1);
  });

  it("não acusa <IconButton> com aria-label", () => {
    expect(
      scan(`const A = () => <IconButton aria-label="Fechar"><X /></IconButton>;`),
    ).toHaveLength(0);
  });

  it("não acusa componente que não é botão de ícone", () => {
    expect(scan(`const A = () => <div className="icon"><X /></div>;`)).toHaveLength(0);
  });

  it("não duplica o achado em JSX aninhado (só o elemento externo conta)", () => {
    const achados = scan(
      `const A = () => <Button size="icon"><span><X /></span></Button>;`,
    );
    expect(achados).toHaveLength(1);
  });

  it("conta cada ocorrência separadamente e informa a linha", () => {
    const src = [
      `const A = () => (`,
      `  <>`,
      `    <Button size="icon"><X /></Button>`,
      `    <Button size="icon" aria-label="ok"><Y /></Button>`,
      `    <Button size="icon"><Z /></Button>`,
      `  </>`,
      `);`,
    ].join("\n");
    const achados = scan(src);
    expect(achados.map((a) => a.line)).toEqual([3, 5]);
  });
});

describe("varredura de botões de ícone — linha de base de src/**", () => {
  it("a linha de base bate com a varredura real (nada novo, nada já corrigido)", () => {
    const achados = scanProject(process.cwd());
    const atual = toKeyCounts(achados);
    const base = toKeyCounts(baseline);

    const chaves = Array.from(
      new Set([...Array.from(atual.keys()), ...Array.from(base.keys())]),
    );
    const problemas: string[] = [];
    for (const chave of chaves) {
      const nAtual = atual.get(chave) ?? 0;
      const nBase = base.get(chave) ?? 0;
      if (nAtual > nBase) {
        const exemplo = achados.find((f) => findingKey(f) === chave);
        problemas.push(
          `surgiu botão de ícone SEM nome (arquivo ${exemplo?.file}:${exemplo?.line}): ${chave}`,
        );
      } else if (nBase > nAtual) {
        problemas.push(`linha de base com entrada já corrigida (remova da baseline): ${chave}`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it("a linha de base só encolhe (teto fixo)", () => {
    expect(baseline.length).toBeLessThanOrEqual(TETO_BASELINE);
  });
});
