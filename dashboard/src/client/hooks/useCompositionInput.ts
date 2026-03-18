import { useRef } from 'react';

/**
 * IME-safe composition input hook.
 * Guards Enter-to-send during CJK/IME composition to prevent double-send.
 */
export const useCompositionInput = () => {
  const isComposing = useRef(false);

  const compositionHandlers = {
    onCompositionStartCapture: () => {
      isComposing.current = true;
    },
    onCompositionEndCapture: () => {
      isComposing.current = false;
    },
  };

  const createKeyDownHandler = (
    onEnterPress: () => void,
    onKeyDownIntercept?: (e: React.KeyboardEvent) => boolean,
  ) => {
    return (e: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if (onKeyDownIntercept?.(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onEnterPress();
      }
    };
  };

  return {
    isComposing,
    compositionHandlers,
    createKeyDownHandler,
  };
};
