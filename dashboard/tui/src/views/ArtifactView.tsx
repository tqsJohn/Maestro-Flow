import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { TextInput } from '@inkjs/ui';
import { ScrollableList, SplitPane } from '../components/index.js';
import { useApi, useBaseUrl } from '../providers/ApiProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArtifactNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ArtifactNode[];
  content?: string;
  size?: number;
}

interface FlatItem {
  name: string;
  path: string;
  depth: number;
  isDir: boolean;
  hasChildren: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenTree(
  nodes: ArtifactNode[],
  expandedDirs: Set<string>,
  depth = 0,
): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of nodes) {
    const isDir = node.type === 'directory';
    const hasChildren = isDir && Array.isArray(node.children) && node.children.length > 0;
    result.push({ name: node.name, path: node.path, depth, isDir, hasChildren });
    if (isDir && hasChildren && expandedDirs.has(node.path)) {
      result.push(...flattenTree(node.children!, expandedDirs, depth + 1));
    }
  }
  return result;
}

function getFileType(path: string): 'json' | 'markdown' | 'text' {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return 'text';
}

// ---------------------------------------------------------------------------
// Content renderers
// ---------------------------------------------------------------------------

function JsonContent({ text }: { text: string }) {
  // Simple line-by-line coloring for JSON
  const lines = text.split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        // Color keys cyan, string values green, numbers yellow
        const keyMatch = line.match(/^(\s*)"([^"]+)"(\s*:\s*)/);
        if (keyMatch) {
          const [, indent, key, sep] = keyMatch;
          const rest = line.slice(keyMatch[0].length);
          return (
            <Text key={i}>
              {indent}<Text color="cyan">"{key}"</Text>{sep}<Text color="green">{rest}</Text>
            </Text>
          );
        }
        return <Text key={i} dimColor>{line}</Text>;
      })}
    </Box>
  );
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        // Headings
        if (line.startsWith('#')) {
          return <Text key={i} bold color="cyan">{line}</Text>;
        }
        // Bold
        if (line.includes('**')) {
          return <Text key={i} bold>{line.replace(/\*\*/g, '')}</Text>;
        }
        // List items
        if (line.match(/^\s*[-*]\s/)) {
          return <Text key={i} color="white">{line}</Text>;
        }
        return <Text key={i}>{line}</Text>;
      })}
    </Box>
  );
}

function PlainContent({ text }: { text: string }) {
  return <Text>{text}</Text>;
}

function ContentPreview({ content, fileType }: { content: string; fileType: 'json' | 'markdown' | 'text' }) {
  switch (fileType) {
    case 'json':
      return <JsonContent text={content} />;
    case 'markdown':
      return <MarkdownContent text={content} />;
    default:
      return <PlainContent text={content} />;
  }
}

// ---------------------------------------------------------------------------
// ArtifactView
// ---------------------------------------------------------------------------

export function ArtifactView() {
  const { data, loading, error } = useApi<ArtifactNode[]>('/api/artifacts?tree=true');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch selected file content (endpoint returns raw text, not JSON)
  const baseUrl = useBaseUrl();
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const fetchIdRef = useRef(0);
  useEffect(() => {
    if (!selectedFile) { setFileContent(null); return; }
    const id = ++fetchIdRef.current;
    setFileLoading(true);
    fetch(`${baseUrl}/api/artifacts/${encodeURIComponent(selectedFile.path)}`)
      .then((r) => r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))
      .then((text) => { if (id === fetchIdRef.current) { setFileContent(text); setFileLoading(false); } })
      .catch(() => { if (id === fetchIdRef.current) { setFileContent(null); setFileLoading(false); } });
  }, [baseUrl, selectedFile]);

  // Search filter
  useInput((input, key) => {
    if (!searchMode && input === '/') { setSearchQuery(''); setSearchMode(true); return; }
    if (searchMode && key.escape) { setSearchQuery(''); setSearchMode(false); return; }
  }, { isActive: !searchMode });

  const allItems = flattenTree(data ?? [], expandedDirs);
  const items = searchQuery
    ? allItems.filter((item) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : allItems;

  const handleSelect = useCallback(
    (item: FlatItem) => {
      if (item.isDir) {
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          if (next.has(item.path)) {
            next.delete(item.path);
          } else {
            next.add(item.path);
          }
          return next;
        });
      } else {
        setSelectedFile({ path: item.path, content: '' });
      }
    },
    [],
  );

  const renderItem = useCallback(
    (item: FlatItem, _index: number, isSelected: boolean) => {
      const indent = '  '.repeat(item.depth);
      const icon = item.isDir
        ? expandedDirs.has(item.path) ? 'v ' : '> '
        : '  ';
      return (
        <Text color={isSelected ? 'cyan' : undefined}>
          {indent}{icon}{item.name}
        </Text>
      );
    },
    [expandedDirs],
  );

  if (loading && !data) {
    return (
      <Box>
        <Text dimColor>Loading artifacts...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text color="red">Error: {error.message}</Text>
      </Box>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Artifacts</Text>
        <Text dimColor>No artifacts found.</Text>
      </Box>
    );
  }

  // Right pane content
  let rightContent: React.ReactNode;
  if (selectedFile && fileContent) {
    const fileType = getFileType(selectedFile.path);
    rightContent = (
      <Box flexDirection="column" paddingLeft={1}>
        <Text bold dimColor>{selectedFile.path}</Text>
        <Box marginTop={1} flexDirection="column">
          <ContentPreview content={fileContent} fileType={fileType} />
        </Box>
      </Box>
    );
  } else if (selectedFile && fileLoading) {
    rightContent = (
      <Box paddingLeft={1}>
        <Text dimColor>Loading file...</Text>
      </Box>
    );
  } else {
    rightContent = (
      <Box paddingLeft={1}>
        <Text dimColor>Select a file to preview</Text>
      </Box>
    );
  }

  if (searchMode) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Search Artifacts</Text>
          <Text dimColor> Esc=clear</Text>
        </Box>
        <TextInput
          placeholder="Search by filename..."
          defaultValue={searchQuery}
          onChange={setSearchQuery}
          onSubmit={() => setSearchMode(false)}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Artifacts</Text>
        <Text dimColor> ({items.length} items) [/]search</Text>
      </Box>
      {searchQuery && (
        <Box marginBottom={1}>
          <Text dimColor>Filter: </Text>
          <Text color="yellow">{searchQuery}</Text>
        </Box>
      )}
      <SplitPane
        ratio={35}
        left={
          <ScrollableList
            items={items}
            renderItem={renderItem}
            onSelect={handleSelect}
            getItemKey={(item) => item.path}
          />
        }
        right={rightContent}
      />
    </Box>
  );
}
