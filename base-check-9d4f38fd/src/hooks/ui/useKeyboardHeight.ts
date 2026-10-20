import { useState, useEffect } from 'react';

/**
 * Tracks the virtual keyboard height on mobile devices using the Visual Viewport API.
 * Returns the keyboard height in pixels (0 when closed).
 */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let prevHeight = vv.height;

    const handleResize = () => {
      const diff = window.innerHeight - vv.height;
      const kbHeight = Math.max(0, diff);
      setKeyboardHeight(kbHeight);
      setIsKeyboardOpen(kbHeight > 50);
      prevHeight = vv.height;
    };

    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);

    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
    };
  }, []);

  return { keyboardHeight, isKeyboardOpen };
}
