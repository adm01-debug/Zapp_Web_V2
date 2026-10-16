import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

/**
 * Varredura de botões de ícone sem nome acessível (UK-13 / UK-13b).
 *
 * Um "botão de ícone" é:
 *   - <IconButton ...> (sempre: o componente obriga aria-label pela tipagem,
 *     mas o atributo pode vir spread/undefined em runtime), ou
 *   - <Button size="icon"> / "icon-sm" / "icon-lg" (literal ou expressão que
 *     contenha um literal começando em "icon").
 *
 * Ele tem nome acessível quando declara aria-label, aria-labelledby ou title
 * NÃO vazios, ou quando tem um filho com classe sr-only. O parser do
 * TypeScript é usado (não regex de primeiro `>`), então atributos depois de
 * `=>` (ex.: onClick={() => apagar()}) e JSX multilinha são lidos corretamente.
 */

export type IconTag = "Button" | "IconButton";

export interface IconButtonFinding {
  /** Caminho relativo ao root do projeto, com barras normais. */
  file: string;
  /** Linha 1-based do início do elemento. */
  line: number;
  /** Coluna 1-based. */
  column: number;
  tag: IconTag;
  /**
   * Assinatura estável do elemento: a tag de abertura com espaços colapsados.
   * Serve de chave da linha de base — muda se (e só se) os atributos mudarem,
   * ou seja, quando o botão for corrigido. Não depende do número da linha.
   */
  snippet: string;
}

const ICON_TAGS = new Set<string>(["Button", "IconButton"]);

/** Elemento de abertura de um JSX: <X ...> ou o próprio <X ... />. */
type JsxOpeningLike = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function openingOf(el: ts.JsxElement | ts.JsxSelfClosingElement): JsxOpeningLike {
  return ts.isJsxElement(el) ? el.openingElement : el;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Todos os literais de string dentro de um nó (para expressões de atributo). */
function stringLiteralsIn(node: ts.Node): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      out.push(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return out;
}

function isSrOnlyClassText(text: string): boolean {
  return /(?:^|\s)sr-only(?:\s|$)/.test(text);
}

function classNameHasSrOnly(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init) return false;
  if (ts.isStringLiteral(init)) return isSrOnlyClassText(init.text);
  if (ts.isJsxExpression(init) && init.expression) {
    return stringLiteralsIn(init.expression).some(isSrOnlyClassText);
  }
  return false;
}

/** true se o elemento tem QUALQUER descendente com classe sr-only. */
function hasSrOnlyDescendant(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      for (const attr of openingOf(n).attributes.properties) {
        if (
          ts.isJsxAttribute(attr) &&
          /^class(Name)?$/.test(attr.name.getText()) &&
          classNameHasSrOnly(attr)
        ) {
          found = true;
          return;
        }
      }
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isNonEmptyNameAttribute(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init) return false; // <Button aria-label />: vazio
  if (ts.isStringLiteral(init)) return init.text.trim().length > 0;
  if (ts.isJsxExpression(init)) {
    // {undefined} / {} / {'  '} não nomeiam nada; qualquer outra expressão assume-se válida.
    if (!init.expression) return false;
    if (ts.isStringLiteral(init.expression)) return init.expression.text.trim().length > 0;
    return true;
  }
  return false;
}

function sizeIsIcon(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init) return false;
  if (ts.isStringLiteral(init)) return init.text.trim().startsWith("icon");
  if (ts.isJsxExpression(init) && init.expression) {
    return stringLiteralsIn(init.expression).some((t) => t.trim().startsWith("icon"));
  }
  return false;
}

function analyzeElement(
  el: ts.JsxElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
  file: string,
): IconButtonFinding | null {
  const tag = openingOf(el).tagName.getText(sourceFile);
  if (!ICON_TAGS.has(tag)) return null;

  let hasAccessibleName = false;
  let sizeIsIconButton = false;

  for (const attr of openingOf(el).attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    const name = attr.name.getText(sourceFile);
    if (name === "aria-label" || name === "aria-labelledby" || name === "title") {
      if (isNonEmptyNameAttribute(attr)) hasAccessibleName = true;
    } else if (name === "size") {
      if (sizeIsIcon(attr)) sizeIsIconButton = true;
    }
  }

  const isIconButton = tag === "IconButton" || (tag === "Button" && sizeIsIconButton);
  if (!isIconButton) return null;

  if (!hasAccessibleName && hasSrOnlyDescendant(el)) hasAccessibleName = true;
  if (hasAccessibleName) return null;

  const start = el.getStart(sourceFile);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    file,
    line: line + 1,
    column: character + 1,
    tag: tag as IconTag,
    snippet: normalizeWhitespace(openingOf(el).getText(sourceFile)),
  };
}

function walk(node: ts.Node, visit: (n: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

/**
 * Varre um único texto-fonte TSX. `fileName` só é usado para o relatório.
 * Exportado para os casos sintéticos do teste.
 */
export function scanSource(
  sourceText: string,
  fileName = "Sintetico.tsx",
): IconButtonFinding[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
  const findings: IconButtonFinding[] = [];
  walk(sourceFile, (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const finding = analyzeElement(node, sourceFile, fileName);
      if (finding) findings.push(finding);
    }
  });
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}

function listTsxFiles(root: string): string[] {
  const out: string[] = [];
  const walkDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full);
      else if (entry.isFile() && full.endsWith(".tsx")) out.push(full);
    }
  };
  walkDir(root);
  return out;
}

/** Varre `src/**\/*.tsx` a partir de `projectRoot`. */
export function scanProject(projectRoot: string): IconButtonFinding[] {
  const srcDir = path.join(projectRoot, "src");
  const findings: IconButtonFinding[] = [];
  for (const abs of listTsxFiles(srcDir)) {
    const rel = path.relative(projectRoot, abs).split(path.sep).join("/");
    const text = fs.readFileSync(abs, "utf8");
    findings.push(...scanSource(text, rel));
  }
  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
  return findings;
}

/** Chave estável (arquivo + assinatura) usada na comparação com a linha de base. */
export function findingKey(f: Pick<IconButtonFinding, "file" | "snippet">): string {
  return `${f.file}|${f.snippet}`;
}

/** Multiconjunto arquivo+assinatura → quantidade. */
export function toKeyCounts(findings: IconButtonFinding[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of findings) {
    const key = findingKey(f);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
