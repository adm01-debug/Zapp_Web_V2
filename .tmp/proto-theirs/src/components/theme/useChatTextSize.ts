/**
 * Tamanho do texto das bolhas do chat (aba Aparência) — estado e persistência.
 *
 * Fica num arquivo próprio (sem componente) por causa do lint de fast refresh: um
 * arquivo que exporta componente não pode exportar função. `useChatTextSize` é o gancho
 * que a Aparência usa hoje e que as preferências de interface (PD-41/42) poderão montar
 * no topo do app quando existirem — aí a escolha passa a valer já no primeiro render.
 *
 * A escolha vira a variável CSS `--chat-font-size` no <html>, lida pela classe
 * `.chat-message-text` (src/styles/components.css) usada no texto dos balões
 * (MessageBubble.tsx). Até as preferências de interface chegarem, o lembrete é feito em
 * `localStorage` com try/catch (modo privado/SSR não quebra a tela) e o boot do app
 * chama `aplicarTamanhoDoChatSalvo()` (src/main.tsx) para a escolha valer no primeiro
 * render do chat, sem depender de a tela de Aparência ter sido aberta.
 */
import { useCallback, useEffect, useState } from 'react';

export const CHAT_TEXT_SIZE_STORAGE_KEY = 'ui-chat-text-size';
export const CHAT_FONT_SIZE_VAR = '--chat-font-size';
export const DEFAULT_CHAT_TEXT_SIZE = 'padrao';

export interface ChatTextSizeOption {
  id: string;
  label: string;
  px: number;
}

/** 5 níveis; o padrão (14px) é o mesmo `text-sm` (0.875rem) de antes. */
export const CHAT_TEXT_SIZES: ChatTextSizeOption[] = [
  { id: 'pequeno', label: 'Pequeno', px: 12 },
  { id: 'padrao', label: 'Padrão', px: 14 },
  { id: 'grande', label: 'Grande', px: 16 },
  { id: 'maior', label: 'Maior', px: 18 },
  { id: 'enorme', label: 'Enorme', px: 20 },
];

function tamanhoPadrao(): ChatTextSizeOption {
  return CHAT_TEXT_SIZES.find((n) => n.id === DEFAULT_CHAT_TEXT_SIZE) ?? CHAT_TEXT_SIZES[1];
}

function pxDoNivel(nivel: string): number {
  return CHAT_TEXT_SIZES.find((n) => n.id === nivel)?.px ?? tamanhoPadrao().px;
}

function nivelSalvo(): string {
  try {
    const salvo = localStorage.getItem(CHAT_TEXT_SIZE_STORAGE_KEY);
    if (salvo && CHAT_TEXT_SIZES.some((n) => n.id === salvo)) return salvo;
  } catch {
    /* storage indisponível — cai no padrão */
  }
  return DEFAULT_CHAT_TEXT_SIZE;
}

/** Escreve `--chat-font-size` no <html>. É o único ponto que toca o CSS: tanto o boot
 *  quanto o gancho passam por aqui, então não há como os dois divergirem. */
export function aplicarTamanhoDoChat(nivel: string): void {
  document.documentElement.style.setProperty(CHAT_FONT_SIZE_VAR, `${pxDoNivel(nivel)}px`);
}

/**
 * Aplica o tamanho lembrado no <html> sem montar tela alguma. Chamada uma vez no boot
 * (src/main.tsx) para o tamanho escolhido já valer no primeiro render do chat — antes
 * isso só acontecia ao abrir a aba Aparência. Não grava nada no storage: só lê.
 */
export function aplicarTamanhoDoChatSalvo(): void {
  aplicarTamanhoDoChat(nivelSalvo());
}

export function useChatTextSize() {
  const [nivel, setNivel] = useState<string>(nivelSalvo);

  useEffect(() => {
    aplicarTamanhoDoChat(nivel);
  }, [nivel]);

  const escolher = useCallback((id: string) => {
    if (!CHAT_TEXT_SIZES.some((n) => n.id === id)) return;
    setNivel(id);
    // O lembrete é consequência da ESCOLHA, não da montagem: um efeito que gravasse a
    // cada render sobrescreveria o valor salvo por outro dispositivo/aba ao abrir a tela.
    try {
      localStorage.setItem(CHAT_TEXT_SIZE_STORAGE_KEY, id);
    } catch {
      /* storage indisponível — a escolha vale para esta sessão */
    }
  }, []);

  return { nivel, escolher };
}
