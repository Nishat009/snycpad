import type { Monaco } from '@monaco-editor/react';
import type { IDisposable, editor as MonacoEditor } from 'monaco-editor';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

type SavedSelection = { start: Y.RelativePosition; end: Y.RelativePosition; ltr: boolean };

type CursorState = { anchor: unknown; head: unknown } | null;

const safeColor = (color: unknown) =>
  typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#60a5fa';
const cssLabel = (name: unknown) => String(name ?? 'Anonymous').replace(/["\\\n\r]/g, '').slice(0, 24);

/**
 * Two-way binding between a Y.Text and a Monaco model, plus remote cursors.
 *
 * Why not y-monaco? It imports `monaco-editor` directly, which fights with Next.js SSR and
 * with the CDN-loaded Monaco used by @monaco-editor/react. This binding takes the Monaco
 * namespace as a parameter instead, and adds a per-user undo stack (Y.UndoManager) so
 * Ctrl+Z only undoes *your* edits — never a teammate's.
 */
export class MonacoBinding {
  readonly undoManager: Y.UndoManager;
  private readonly doc: Y.Doc;
  private readonly disposables: IDisposable[] = [];
  private readonly decorations: MonacoEditor.IEditorDecorationsCollection;
  private readonly styleEl: HTMLStyleElement;
  private applyingRemote = false;
  private savedSelections: SavedSelection[] | null = null;

  constructor(
    private readonly ytext: Y.Text,
    private readonly model: MonacoEditor.ITextModel,
    private readonly editor: MonacoEditor.IStandaloneCodeEditor,
    private readonly awareness: Awareness,
    private readonly monaco: Monaco,
  ) {
    this.doc = ytext.doc!;
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    if (model.getValue() !== ytext.toString()) {
      this.applyingRemote = true;
      model.setValue(ytext.toString());
      this.applyingRemote = false;
    }

    this.undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([this]) });
    this.decorations = editor.createDecorationsCollection();
    this.styleEl = document.createElement('style');
    document.head.appendChild(this.styleEl);

    this.doc.on('beforeAllTransactions', this.saveSelections);
    ytext.observe(this.handleYText);
    awareness.on('change', this.renderRemoteCursors);

    const { KeyMod, KeyCode } = monaco;
    this.disposables.push(
      model.onDidChangeContent(this.handleModelChange),
      editor.onDidChangeCursorSelection(this.publishCursor),
      editor.addAction({
        id: 'syncpad.undo',
        label: 'Undo (my changes)',
        keybindings: [KeyMod.CtrlCmd | KeyCode.KeyZ],
        run: () => void this.undoManager.undo(),
      }),
      editor.addAction({
        id: 'syncpad.redo',
        label: 'Redo (my changes)',
        keybindings: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyZ, KeyMod.CtrlCmd | KeyCode.KeyY],
        run: () => void this.undoManager.redo(),
      }),
    );

    this.publishCursor();
    this.renderRemoteCursors();
  }

  destroy() {
    this.disposables.forEach((d) => d.dispose());
    this.ytext.unobserve(this.handleYText);
    this.doc.off('beforeAllTransactions', this.saveSelections);
    this.awareness.off('change', this.renderRemoteCursors);
    this.awareness.setLocalStateField('cursor', null);
    this.undoManager.destroy();
    this.decorations.clear();
    this.styleEl.remove();
  }

  /** Monaco → Yjs */
  private handleModelChange = (event: MonacoEditor.IModelContentChangedEvent) => {
    if (this.applyingRemote) return;
    this.doc.transact(() => {
      // Offsets refer to the pre-change model, so apply from the end backwards.
      [...event.changes]
        .sort((a, b) => b.rangeOffset - a.rangeOffset)
        .forEach((change) => {
          if (change.rangeLength) this.ytext.delete(change.rangeOffset, change.rangeLength);
          if (change.text) this.ytext.insert(change.rangeOffset, change.text);
        });
    }, this);
  };

  /** Yjs → Monaco (remote edits and undo/redo) */
  private handleYText = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    if (transaction.origin === this) return;
    const { Range } = this.monaco;
    this.applyingRemote = true;
    try {
      let index = 0;
      for (const op of event.delta) {
        if (op.retain !== undefined) {
          index += op.retain;
        } else if (typeof op.insert === 'string') {
          const pos = this.model.getPositionAt(index);
          const range = new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
          this.model.applyEdits([{ range, text: op.insert }]);
          index += op.insert.length;
        } else if (op.delete !== undefined) {
          const start = this.model.getPositionAt(index);
          const end = this.model.getPositionAt(index + op.delete);
          const range = new Range(start.lineNumber, start.column, end.lineNumber, end.column);
          this.model.applyEdits([{ range, text: '' }]);
        }
      }
      this.restoreSelections();
    } finally {
      this.applyingRemote = false;
    }
    this.renderRemoteCursors();
  };

  /**
   * Capture selections as CRDT-relative positions before a transaction, so that after a
   * remote insert right at the caret, the caret stays where the user expects it.
   */
  private saveSelections = () => {
    const selections = this.editor.getSelections();
    this.savedSelections =
      selections?.map((sel) => ({
        start: Y.createRelativePositionFromTypeIndex(this.ytext, this.model.getOffsetAt(sel.getStartPosition())),
        end: Y.createRelativePositionFromTypeIndex(this.ytext, this.model.getOffsetAt(sel.getEndPosition())),
        ltr: sel.getDirection() === this.monaco.SelectionDirection.LTR,
      })) ?? null;
  };

  private restoreSelections() {
    if (!this.savedSelections) return;
    const { Selection } = this.monaco;
    const restored = this.savedSelections.flatMap(({ start, end, ltr }) => {
      const a = Y.createAbsolutePositionFromRelativePosition(start, this.doc);
      const b = Y.createAbsolutePositionFromRelativePosition(end, this.doc);
      if (!a || !b) return [];
      const s = this.model.getPositionAt(a.index);
      const e = this.model.getPositionAt(b.index);
      return [
        ltr
          ? new Selection(s.lineNumber, s.column, e.lineNumber, e.column)
          : new Selection(e.lineNumber, e.column, s.lineNumber, s.column),
      ];
    });
    if (restored.length) this.editor.setSelections(restored);
  }

  private publishCursor = () => {
    const sel = this.editor.getSelection();
    if (!sel) return;
    const anchor = Y.createRelativePositionFromTypeIndex(this.ytext, this.model.getOffsetAt(sel.getSelectionStart()));
    const head = Y.createRelativePositionFromTypeIndex(this.ytext, this.model.getOffsetAt(sel.getPosition()));
    this.awareness.setLocalStateField('cursor', {
      anchor: Y.relativePositionToJSON(anchor),
      head: Y.relativePositionToJSON(head),
    });
  };

  private renderRemoteCursors = () => {
    const { Range, editor } = this.monaco;
    const decorations: MonacoEditor.IModelDeltaDecoration[] = [];
    const css: string[] = [];

    this.awareness.getStates().forEach((state, clientId) => {
      const cursor = state.cursor as CursorState;
      if (clientId === this.doc.clientID || !cursor || !state.user) return;

      const anchor = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(cursor.anchor), this.doc);
      const head = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(cursor.head), this.doc);
      if (!anchor || !head || anchor.type !== this.ytext || head.type !== this.ytext) return;

      if (anchor.index !== head.index) {
        const s = this.model.getPositionAt(Math.min(anchor.index, head.index));
        const e = this.model.getPositionAt(Math.max(anchor.index, head.index));
        decorations.push({
          range: new Range(s.lineNumber, s.column, e.lineNumber, e.column),
          options: { className: `y-selection y-selection-${clientId}` },
        });
      }
      const h = this.model.getPositionAt(head.index);
      decorations.push({
        range: new Range(h.lineNumber, h.column, h.lineNumber, h.column),
        options: {
          beforeContentClassName: `y-cursor y-cursor-${clientId}`,
          stickiness: editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });

      const color = safeColor(state.user.color);
      css.push(
        `.y-selection-${clientId}{background-color:${color}40}`,
        `.y-cursor-${clientId}{border-color:${color}}`,
        `.y-cursor-${clientId}::after{content:"${cssLabel(state.user.name)}";background-color:${color}}`,
      );
    });

    this.decorations.set(decorations);
    this.styleEl.textContent = css.join('\n');
  };
}
