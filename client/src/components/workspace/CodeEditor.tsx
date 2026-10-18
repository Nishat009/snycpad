'use client';

import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { Spinner } from '@/components/ui';
import { MonacoBinding } from '@/lib/collab/monaco-binding';

export function CodeEditor({ doc, awareness, language }: { doc: Y.Doc; awareness: Awareness; language: string }) {
  const [mounted, setMounted] = useState<{ editor: editor.IStandaloneCodeEditor; monaco: Monaco } | null>(null);

  useEffect(() => {
    const model = mounted?.editor.getModel();
    if (!mounted || !model) return;
    const binding = new MonacoBinding(doc.getText('code'), model, mounted.editor, awareness, mounted.monaco);
    return () => binding.destroy();
  }, [mounted, doc, awareness]);

  return (
    <Editor
      theme="syncpad"
      language={language}
      defaultValue=""
      loading={<Spinner label="Loading editor…" />}
      beforeMount={(monaco) =>
        monaco.editor.defineTheme('syncpad', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#0c0f17',
            'editor.lineHighlightBackground': '#151a26',
            'editor.lineHighlightBorder': '#00000000',
            'editorLineNumber.foreground': '#3b4560',
            'editorLineNumber.activeForeground': '#8a94b0',
            'editorGutter.background': '#0c0f17',
          },
        })
      }
      onMount={(editor, monaco) => setMounted({ editor, monaco })}
      options={{
        fontFamily: 'var(--font-jetbrains), Consolas, monospace',
        fontSize: 14,
        fontLigatures: true,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        automaticLayout: true,
        padding: { top: 20, bottom: 20 },
        tabSize: 2,
        renderLineHighlight: 'all',
        bracketPairColorization: { enabled: true },
      }}
    />
  );
}
