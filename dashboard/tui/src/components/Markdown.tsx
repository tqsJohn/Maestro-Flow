import React, { useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { marked, type Token, type Tokens } from 'marked';

// ---------------------------------------------------------------------------
// marked configuration — call once at module level
// ---------------------------------------------------------------------------

let markedConfigured = false;

export function configureMarked(): void {
  if (markedConfigured) return;
  marked.setOptions({ gfm: true, breaks: true });
  markedConfigured = true;
}

// Eagerly configure on import
configureMarked();

// ---------------------------------------------------------------------------
// Token cache — LRU Map (max 500) with MRU promotion
// ---------------------------------------------------------------------------

const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map<string, Token[]>();

const MD_SYNTAX_RE = /[#*`|[>\-_~]|\n\n|^\d+\. |\n\d+\. /;

function hasMarkdownSyntax(s: string): boolean {
  return MD_SYNTAX_RE.test(s.length > 500 ? s.slice(0, 500) : s);
}

function cachedLexer(content: string): Token[] {
  // Fast path: plain text with no markdown syntax
  if (!hasMarkdownSyntax(content)) {
    return [{
      type: 'paragraph',
      raw: content,
      text: content,
      tokens: [{ type: 'text', raw: content, text: content }],
    } as Token];
  }

  // Simple hash: length + first/last 50 chars as key (avoids storing full content as key)
  const key = `${content.length}:${content.slice(0, 50)}:${content.slice(-50)}`;
  const hit = tokenCache.get(key);
  if (hit) {
    // MRU promotion
    tokenCache.delete(key);
    tokenCache.set(key, hit);
    return hit;
  }

  const tokens = marked.lexer(content);
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const first = tokenCache.keys().next().value;
    if (first !== undefined) tokenCache.delete(first);
  }
  tokenCache.set(key, tokens);
  return tokens;
}

// ---------------------------------------------------------------------------
// Inline token renderer
// ---------------------------------------------------------------------------

function renderInlineTokens(tokens: Token[] | undefined): React.ReactNode[] {
  if (!tokens) return [];
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'strong':
        return <Text key={i} bold>{(token as Tokens.Strong).text}</Text>;
      case 'em':
        return <Text key={i} italic>{(token as Tokens.Em).text}</Text>;
      case 'codespan':
        return <Text key={i} color="yellow">`{(token as Tokens.Codespan).text}`</Text>;
      case 'link':
        return <Text key={i} color="blue" underline>{(token as Tokens.Link).text}</Text>;
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) {
          return <React.Fragment key={i}>{renderInlineTokens(t.tokens)}</React.Fragment>;
        }
        return <Text key={i}>{t.text}</Text>;
      }
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      default:
        return <Text key={i}>{token.raw}</Text>;
    }
  });
}

// ---------------------------------------------------------------------------
// Markdown — renders fully parsed markdown via ink components
// ---------------------------------------------------------------------------

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps): React.ReactNode {
  const elements = useMemo(() => {
    const tokens = cachedLexer(children);
    return tokens.map((token, i) => renderBlockToken(token, i));
  }, [children]);

  return (
    <Box flexDirection="column">
      {elements}
    </Box>
  );
}

function renderBlockToken(token: Token, key: number): React.ReactNode {
  switch (token.type) {
    case 'heading': {
      const h = token as Tokens.Heading;
      const isTopLevel = h.depth <= 2;
      return (
        <Text key={key} bold color={isTopLevel ? 'cyan' : undefined}>
          {h.text}
        </Text>
      );
    }
    case 'paragraph': {
      const p = token as Tokens.Paragraph;
      return <Text key={key}>{renderInlineTokens(p.tokens)}</Text>;
    }
    case 'code': {
      const c = token as Tokens.Code;
      return (
        <Box key={key} borderStyle="single" paddingX={1}>
          <Text>{c.text}</Text>
        </Box>
      );
    }
    case 'list': {
      const l = token as Tokens.List;
      return (
        <Box key={key} flexDirection="column">
          {l.items.map((item, j) => (
            <Text key={j}>  {l.ordered ? `${j + 1}.` : '\u2022'} {item.text}</Text>
          ))}
        </Box>
      );
    }
    case 'blockquote': {
      const bq = token as Tokens.Blockquote;
      return <Text key={key} dimColor>{'\u2502'} {bq.text}</Text>;
    }
    case 'hr':
      return <Text key={key} dimColor>{'\u2500'.repeat(40)}</Text>;
    case 'space':
      return null;
    default:
      return <Text key={key}>{token.raw}</Text>;
  }
}

// ---------------------------------------------------------------------------
// StreamingMarkdown — stable-prefix split for flicker-free streaming
// ---------------------------------------------------------------------------

export function StreamingMarkdown({ children }: MarkdownProps): React.ReactNode {
  const stablePrefixRef = useRef('');

  // Reset if text was replaced
  if (!children.startsWith(stablePrefixRef.current)) {
    stablePrefixRef.current = '';
  }

  // Lex only from current boundary
  const boundary = stablePrefixRef.current.length;
  const tokens = marked.lexer(children.substring(boundary));

  // Last non-space token is the growing block; everything before is final
  let lastContentIdx = tokens.length - 1;
  while (lastContentIdx >= 0 && tokens[lastContentIdx]!.type === 'space') {
    lastContentIdx--;
  }
  let advance = 0;
  for (let i = 0; i < lastContentIdx; i++) {
    advance += tokens[i]!.raw.length;
  }
  if (advance > 0) {
    stablePrefixRef.current = children.substring(0, boundary + advance);
  }

  const stablePrefix = stablePrefixRef.current;
  const unstableSuffix = children.substring(stablePrefix.length);

  return (
    <Box flexDirection="column">
      {stablePrefix && <Markdown>{stablePrefix}</Markdown>}
      {unstableSuffix && <Markdown>{unstableSuffix}</Markdown>}
    </Box>
  );
}
