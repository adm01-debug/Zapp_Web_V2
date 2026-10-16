/**
 * CV-147–148: RadarHelpOverlay — shows keyboard shortcuts and feature overview.
 */
import React from 'react';
import type { RadarShortcut } from '../../hooks/copilot/useRadarKeyboard';

export interface RadarHelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: RadarShortcut[];
}

const FEATURES = [
  { icon: '🌡', name: 'Termômetro de lead', description: 'Mede o engajamento e temperatura do lead em tempo real' },
  { icon: '⚠️', name: 'Detector de objeções', description: 'Identifica resistências e sugere jogadas de contorno' },
  { icon: '🚨', name: 'Risco de perda', description: 'Detecta sinais de desengajamento e abandono iminente' },
  { icon: '🛍', name: 'Recomendação de produto', description: 'Sugere produtos relevantes com base no contexto da conversa' },
  { icon: '📋', name: 'Rascunho de orçamento', description: 'Gera orçamento automático para aprovação do vendedor' },
  { icon: '🔍', name: 'Análise multimodal', description: 'Processa áudio, imagens e documentos para extrair contexto' },
  { icon: '🔒', name: 'Guarda de privacidade', description: 'Detecta dados sensíveis e avisos de conformidade LGPD' },
  { icon: '💡', name: 'Dicas de coaching', description: 'Sugestões do supervisor para melhorar o atendimento' },
  { icon: '✍️', name: 'Texto fantasma', description: 'Sugestões de resposta em tempo real enquanto você digita' },
];

export function RadarHelpOverlay({ isOpen, onClose, shortcuts }: RadarHelpOverlayProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajuda do RADAR"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar ajuda"
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xl leading-none"
        >
          ×
        </button>

        <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-4">
          Ajuda — RADAR Copiloto de Vendas
        </h2>

        {/* Keyboard shortcuts */}
        <section className="mb-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Atalhos de teclado
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {shortcuts.map((s) => (
                <tr key={s.action} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                  <td className="py-1.5 pr-3 font-mono text-xs bg-zinc-100 dark:bg-zinc-800 rounded px-2 whitespace-nowrap w-0">
                    {s.keys}
                  </td>
                  <td className="py-1.5 pl-3 text-zinc-600 dark:text-zinc-400">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Features */}
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
            Funcionalidades ativas
          </h3>
          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f.name} className="flex gap-3 items-start">
                <span className="text-base leading-5 flex-shrink-0 mt-0.5">{f.icon}</span>
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{f.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">{f.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
