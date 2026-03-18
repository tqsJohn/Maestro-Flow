import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlashCommand {
  name: string;
  desc: string;
  color: string;
  bg: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Match slash followed by command name (alphanumeric, underscore, hyphen) */
const SLASH_QUERY_RE = /^\/([a-zA-Z0-9_-]*)$/;

export function matchSlashQuery(input: string): string | null {
  const match = input.match(SLASH_QUERY_RE);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseSlashCommandControllerOptions {
  input: string;
  commands: SlashCommand[];
  onSelect: (commandName: string) => void;
}

export function useSlashCommandController(options: UseSlashCommandControllerOptions) {
  const { input, commands, onSelect } = options;
  const query = useMemo(() => matchSlashQuery(input), [input]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Reset state when query changes
  useEffect(() => {
    setActiveIndex(0);
    setDismissed(false);
  }, [query]);

  const filteredCommands = useMemo(() => {
    if (query === null) return [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return commands;
    return commands.filter((c) => c.name.toLowerCase().startsWith('/' + keyword) || c.name.toLowerCase().startsWith(keyword));
  }, [commands, query]);

  const isOpen = query !== null && !dismissed && filteredCommands.length > 0;

  const executeCommand = useCallback(
    (index: number) => {
      const command = filteredCommands[index];
      if (!command) return false;
      onSelect(command.name);
      setDismissed(true);
      return true;
    },
    [filteredCommands, onSelect],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (!isOpen) return false;

      if (event.key === 'Escape') {
        event.preventDefault();
        setDismissed(true);
        return true;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredCommands.length);
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return true;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        return executeCommand(activeIndex);
      }

      return false;
    },
    [activeIndex, executeCommand, filteredCommands.length, isOpen],
  );

  return {
    isOpen,
    activeIndex,
    filteredCommands,
    onKeyDown,
    onSelectByIndex: executeCommand,
    setDismissed,
    setActiveIndex,
  };
}
