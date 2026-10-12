/**
 * Etapas 065 e 067 — o estado aberto/recolhido de cada grupo da Lista.
 *
 * 067 fixa o estado INICIAL como na imagem 01: Atrasadas e Hoje abertos;
 * Amanhã, Próximas e Sem prazo recolhidos (só o contador); Concluídas recolhido,
 * com o "Ver até 30 dias >" no próprio cabeçalho.
 *
 * 065 guarda a escolha do usuário POR NAVEGADOR (localStorage): depois da
 * primeira vez que ele abre ou fecha um grupo, é a escolha dele que prevalece
 * sobre o padrão acima.
 *
 * Módulo sem React: a leitura e a escrita toleram `localStorage` ausente
 * (SSR, jsdom sem storage, janela privada) sem quebrar a tela.
 */

/** As chaves dos seis grupos, na ordem em que a tela os mostra. */
export type GrupoKey =
  | 'atrasadas'
  | 'hoje'
  | 'amanha'
  | 'proximas'
  | 'sem-prazo'
  | 'concluidas';

/** Chave única da preferência da Lista no `localStorage` do navegador. */
export const GRUPOS_STORAGE_KEY = 'tasks-list-groups';

/** Estado inicial de cada grupo (etapa 067) — a imagem 01. */
export const GRUPOS_PADRAO: Record<GrupoKey, boolean> = {
  atrasadas: true,
  hoje: true,
  amanha: false,
  proximas: false,
  'sem-prazo': false,
  concluidas: false,
};

/** O `localStorage` do navegador, ou `null` quando não há (SSR/acesso negado). */
function armazenamento(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * As escolhas que o usuário já fez (só as chaves conhecidas com valor booleano).
 * JSON corrompido ou de outra versão devolve `{}` — o padrão volta a valer.
 */
export function lerEscolhas(): Partial<Record<GrupoKey, boolean>> {
  const store = armazenamento();
  if (!store) return {};
  try {
    const bruto = store.getItem(GRUPOS_STORAGE_KEY);
    if (!bruto) return {};
    const dados: unknown = JSON.parse(bruto);
    if (!dados || typeof dados !== 'object') return {};
    const saida: Partial<Record<GrupoKey, boolean>> = {};
    for (const chave of Object.keys(GRUPOS_PADRAO) as GrupoKey[]) {
      const valor = (dados as Record<string, unknown>)[chave];
      if (typeof valor === 'boolean') saida[chave] = valor;
    }
    return saida;
  } catch {
    // JSON inválido no storage: cai no padrão em vez de derrubar a Lista.
    return {};
  }
}

/** Estado inicial de UM grupo: a escolha do usuário quando existe, senão o padrão. */
export function grupoInicial(
  key: GrupoKey,
  escolhas: Partial<Record<GrupoKey, boolean>> = lerEscolhas(),
): boolean {
  return escolhas[key] ?? GRUPOS_PADRAO[key];
}

/** Grava a escolha de um grupo preservando as dos outros (etapa 065). */
export function salvarGrupo(key: GrupoKey, aberto: boolean): void {
  const store = armazenamento();
  if (!store) return;
  try {
    store.setItem(GRUPOS_STORAGE_KEY, JSON.stringify({ ...lerEscolhas(), [key]: aberto }));
  } catch {
    // Storage cheio/bloqueado: a tela segue com o estado que está em memória.
  }
}

/** Recolhe todos os grupos — usado pelo "Limpar preferências" da barra. */
export function limparGrupos(): void {
  const store = armazenamento();
  if (!store) return;
  try {
    store.removeItem(GRUPOS_STORAGE_KEY);
  } catch {
    // Sem storage não há o que limpar.
  }
}
