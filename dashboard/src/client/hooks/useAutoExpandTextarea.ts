/**
 * useAutoExpandTextarea -- adaptive single-line / multi-line switching.
 *
 * Uses canvas measureText() for character-accurate width measurement with
 * a 30px hysteresis buffer to prevent rapid toggling near the boundary.
 * Forces multiline when text contains newlines or exceeds 800 characters.
 */
import { useEffect, useRef, useState } from 'react';

/** Hysteresis buffer (px) to prevent rapid toggling at the boundary. */
const HYSTERESIS_PX = 30;

/** Character count threshold -- always multiline above this. */
const CHAR_THRESHOLD = 800;

export function useAutoExpandTextarea(
  text: string,
  containerRef: React.RefObject<HTMLElement | null>,
): { isMultiline: boolean } {
  const [isMultiline, setIsMultiline] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevMultilineRef = useRef(false);

  useEffect(() => {
    // Force multiline for explicit newlines
    if (text.includes('\n')) {
      prevMultilineRef.current = true;
      setIsMultiline(true);
      return;
    }

    // Force multiline above character threshold
    if (text.length >= CHAR_THRESHOLD) {
      prevMultilineRef.current = true;
      setIsMultiline(true);
      return;
    }

    // Empty text -- single line
    if (!text) {
      prevMultilineRef.current = false;
      setIsMultiline(false);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const rafId = requestAnimationFrame(() => {
      // Lazy-create a shared offscreen canvas
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Read the textarea's computed font so measurement matches rendering
      const textarea = container.querySelector('textarea');
      if (!textarea) return;

      const style = getComputedStyle(textarea);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

      const textWidth = ctx.measureText(text).width;

      // Available width = textarea clientWidth minus horizontal padding
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const availableWidth = textarea.clientWidth - paddingLeft - paddingRight;

      const wasMultiline = prevMultilineRef.current;

      // Apply hysteresis: when already multiline, require text to be
      // narrower by HYSTERESIS_PX before switching back to single-line.
      let next: boolean;
      if (wasMultiline) {
        next = textWidth > availableWidth - HYSTERESIS_PX;
      } else {
        next = textWidth > availableWidth;
      }

      prevMultilineRef.current = next;
      setIsMultiline(next);
    });

    return () => cancelAnimationFrame(rafId);
  }, [text, containerRef]);

  return { isMultiline };
}
