/**
 * ZappLogo — marca ZAPP (cópia de design 20260831).
 * Imagem EXATA fornecida pelo Joaquim (pixel por pixel), com
 * recolorização programática: vermelho -> azul (#2563eb), preto
 * preservado, fundo removido (alpha). Fonte: src/assets/zapp-logo.png
 */
import logoUrl from '@/assets/zapp-logo.png';

export function ZappLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt="Logo ZAPP"
      className={className}
      draggable={false}
    />
  );
}

export default ZappLogo;
