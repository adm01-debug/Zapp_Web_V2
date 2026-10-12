/**
 * Texto e identidade da seção "Base de Conhecimento" — fora do arquivo de
 * componente de propósito: um `.tsx` que exporta função/constante quebra o
 * fast refresh (regra `react-refresh/only-export-components`).
 */
import type { KBArticle } from '@/hooks/integrations/useKnowledgeBaseSearch';

/** Valor da seção no accordion do sidebar (`sidebarSections.ts`). */
export const KB_SECTION_VALUE = 'knowledge';

/** Trecho que vai para o rascunho: o corpo do artigo, sem a moldura. */
export function articleInsertText(article: Pick<KBArticle, 'content'>): string {
  return article.content.trim();
}

/** Resumo de uma linha para a lista: espaços colapsados e corte na palavra. */
export function articleSnippet(article: Pick<KBArticle, 'content'>, limite = 160): string {
  const texto = article.content.replace(/\s+/g, ' ').trim();
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return `${(ultimoEspaco > 60 ? corte.slice(0, ultimoEspaco) : corte).trimEnd()}…`;
}
