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
 * `localStorage` com try/catch (modo privado/SSR não quebra a tela).
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

function nivelSalvo(): string {
  try {
    const salvo = localStorage.getItem(CHAT_TEXT_SIZE_STORAGE_KEY);
    if (salvo && CHAT_TEXT_SIZES.some((n) => n.id === salvo)) return salvo;
  } catch {
    /* storage indisponível — cai no padrão */
  }
  return DEFAULT_CHAT_TEXT_SIZE;
}

export function useChatTextSize() {
  const [nivel, setNivel] = useState<string>(nivelSalvo);

  useEffect(() => {
    const px = CHAT_TEXT_SIZES.find((n) => n.id === nivel)?.px ?? tamanhoPadrao().px;
    document.documentElement.style.setProperty(CHAT_FONT_SIZE_VAR, `${px}px`);
    try {
      localStorage.setItem(CHAT_TEXT_SIZE_STORAGE_KEY, nivel);
    } catch {
      /* storage indisponível — a escolha vale para esta sessão */
    }
  }, [nivel]);

  const escolher = useCallback((id: string) => {
    if (CHAT_TEXT_SIZES.some((n) => n.id === id)) setNivel(id);
  }, []);

  return { nivel, escolher };
}
