'use client';

import { Download, Eraser, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { LocalUser } from '@/lib/collab/provider';
import { cx } from '@/lib/utils';

/** Strokes are stored in a fixed virtual coordinate space so every screen size agrees. */
const BOARD_W = 1600;
const BOARD_H = 1000;
const BACKGROUND = '#0c0f17';
const COLORS = ['#e6e9f2', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc'];
const SIZES = [3, 6, 12];
const ERASER_RADIUS = 14;

type Tool = 'pen' | 'eraser';
type Stroke = Y.Map<unknown>;
type RemotePointer = { clientId: number; x: number; y: number; user: LocalUser };

export function Whiteboard({ doc, awareness, active }: { doc: Y.Doc; awareness: Awareness; active: boolean }) {
  const strokes = useMemo(() => doc.getArray<Stroke>('strokes'), [doc]);
  // A unique origin per mount, so undo only ever touches *my* strokes.
  const origin = useMemo(() => ({ whiteboard: true }), []);
  const [undoManager, setUndoManager] = useState<Y.UndoManager | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const frameRef = useRef(0);
  const drawingRef = useRef<{ points: Y.Array<number>; buffer: number[]; last: [number, number] } | null>(null);
  const erasingRef = useRef(false);
  const lastPointerSent = useRef(0);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [scale, setScale] = useState(1);
  const [pointers, setPointers] = useState<RemotePointer[]>([]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scaleRef.current, 0, 0, dpr * scaleRef.current, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    strokes.forEach((stroke) => {
      const pts = (stroke.get('points') as Y.Array<number> | undefined)?.toArray() ?? [];
      if (pts.length < 2) return;
      ctx.strokeStyle = String(stroke.get('color'));
      ctx.lineWidth = Number(stroke.get('size'));
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      if (pts.length === 2) ctx.lineTo(pts[0] + 0.01, pts[1]); // a dot
      // Smooth the polyline with quadratic curves through midpoints.
      for (let i = 2; i < pts.length - 2; i += 2) {
        ctx.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
      }
      if (pts.length >= 4) ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
      ctx.stroke();
    });
  }, [strokes]);

  const scheduleRedraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      redraw();
    });
  }, [redraw]);

  // Re-render whenever anyone changes the board.
  useEffect(() => {
    strokes.observeDeep(scheduleRedraw);
    return () => strokes.unobserveDeep(scheduleRedraw);
  }, [strokes, scheduleRedraw]);

  // Owned by an effect (not useMemo) so StrictMode's mount/unmount/mount gets a live instance.
  useEffect(() => {
    const manager = new Y.UndoManager(strokes, { trackedOrigins: new Set([origin]) });
    const sync = () => setHistory({ canUndo: manager.canUndo(), canRedo: manager.canRedo() });
    manager.on('stack-item-added', sync);
    manager.on('stack-item-popped', sync);
    manager.on('stack-cleared', sync);
    setUndoManager(manager);
    return () => {
      manager.destroy();
      setUndoManager(null);
    };
  }, [strokes, origin]);

  // Keep the canvas pixel-perfect at any size / DPR.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      scaleRef.current = width / BOARD_W;
      setScale(width / BOARD_W);
      redraw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  // Remote pointers.
  useEffect(() => {
    const update = () => {
      const list: RemotePointer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const p = state.pointer as { x: number; y: number } | null | undefined;
        if (clientId !== awareness.clientID && p && state.user) list.push({ clientId, x: p.x, y: p.y, user: state.user as LocalUser });
      });
      setPointers(list);
    };
    update();
    awareness.on('change', update);
    return () => {
      awareness.off('change', update);
      awareness.setLocalStateField('pointer', null);
    };
  }, [awareness]);

  // Ctrl+Z / Ctrl+Shift+Z while the board is visible.
  useEffect(() => {
    if (!active || !undoManager) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest('input, textarea, .monaco-editor')) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) undoManager.undo();
      else if ((key === 'z' && e.shiftKey) || key === 'y') undoManager.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, undoManager]);

  const toBoard = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scaleRef.current;
    const y = (e.clientY - rect.top) / scaleRef.current;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  };

  const flush = () => {
    const drawing = drawingRef.current;
    if (!drawing?.buffer.length) return;
    const batch = drawing.buffer.splice(0);
    doc.transact(() => drawing.points.push(batch), origin);
  };

  const eraseAt = ([x, y]: [number, number]) => {
    const hits: number[] = [];
    strokes.forEach((stroke, index) => {
      const pts = (stroke.get('points') as Y.Array<number>).toArray();
      const reach = (ERASER_RADIUS + Number(stroke.get('size')) / 2) ** 2;
      for (let i = 0; i < pts.length; i += 2) {
        if ((pts[i] - x) ** 2 + (pts[i + 1] - y) ** 2 <= reach) {
          hits.push(index);
          break;
        }
      }
    });
    if (hits.length) doc.transact(() => hits.reverse().forEach((i) => strokes.delete(i, 1)), origin);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    undoManager?.stopCapturing(); // each stroke is its own undo step
    const point = toBoard(e);

    if (tool === 'eraser') {
      erasingRef.current = true;
      eraseAt(point);
      return;
    }
    const stroke = new Y.Map<unknown>();
    doc.transact(() => {
      stroke.set('color', color);
      stroke.set('size', size);
      stroke.set('points', Y.Array.from(point));
      strokes.push([stroke]);
    }, origin);
    drawingRef.current = { points: stroke.get('points') as Y.Array<number>, buffer: [], last: point };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = toBoard(e);
    const now = performance.now();
    if (now - lastPointerSent.current > 40) {
      lastPointerSent.current = now;
      awareness.setLocalStateField('pointer', { x: point[0], y: point[1] });
    }

    if (erasingRef.current) return eraseAt(point);
    const drawing = drawingRef.current;
    if (!drawing) return;
    const [lx, ly] = drawing.last;
    if ((point[0] - lx) ** 2 + (point[1] - ly) ** 2 < 4) return; // skip sub-2px jitter
    drawing.last = point;
    drawing.buffer.push(point[0], point[1]);
    // One Yjs transaction per animation frame instead of per pointer event.
    requestAnimationFrame(flush);
  };

  const endStroke = () => {
    flush();
    drawingRef.current = null;
    erasingRef.current = false;
  };

  const clearBoard = () => {
    if (strokes.length && confirm('Clear the whiteboard for everyone? (You can undo this.)')) {
      undoManager?.stopCapturing();
      doc.transact(() => strokes.delete(0, strokes.length), origin);
    }
  };

  const exportPng = () => {
    const source = canvasRef.current;
    if (!source) return;
    const out = document.createElement('canvas');
    out.width = source.width;
    out.height = source.height;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = out.toDataURL('image/png');
    link.click();
  };

  const toolButton = (isActive: boolean) =>
    cx('grid size-9 place-items-center rounded-lg transition-colors', isActive ? 'bg-accent text-ink-950' : 'text-slate-300 hover:bg-ink-700');

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/5 bg-ink-900 px-3 py-2">
        <button className={toolButton(tool === 'pen')} onClick={() => setTool('pen')} title="Pen" aria-label="Pen">
          <Pencil className="size-4" />
        </button>
        <button className={toolButton(tool === 'eraser')} onClick={() => setTool('eraser')} title="Eraser" aria-label="Eraser">
          <Eraser className="size-4" />
        </button>
        <span className="mx-2 h-6 w-px bg-ink-600" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => {
              setColor(c);
              setTool('pen');
            }}
            aria-label={`Color ${c}`}
            className={cx('size-6 rounded-full ring-offset-2 ring-offset-ink-900 transition', color === c && tool === 'pen' ? 'ring-2 ring-white' : 'hover:scale-110')}
            style={{ background: c }}
          />
        ))}
        <span className="mx-2 h-6 w-px bg-ink-600" />
        {SIZES.map((s) => (
          <button key={s} onClick={() => setSize(s)} className={toolButton(size === s)} title={`Size ${s}`} aria-label={`Brush size ${s}`}>
            <span className="rounded-full bg-current" style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
        <span className="mx-2 h-6 w-px bg-ink-600" />
        <button className={toolButton(false)} onClick={() => undoManager?.undo()} disabled={!history.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 className={cx('size-4', !history.canUndo && 'opacity-40')} />
        </button>
        <button className={toolButton(false)} onClick={() => undoManager?.redo()} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Redo2 className={cx('size-4', !history.canRedo && 'opacity-40')} />
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button className={toolButton(false)} onClick={exportPng} title="Export PNG" aria-label="Export PNG">
            <Download className="size-4" />
          </button>
          <button className={cx(toolButton(false), 'hover:text-red-300')} onClick={clearBoard} title="Clear board" aria-label="Clear board">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid flex-1 place-items-center overflow-hidden bg-ink-950 p-4">
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/40"
          style={{
            aspectRatio: `${BOARD_W} / ${BOARD_H}`,
            width: `min(100%, calc((100vh - 150px) * ${BOARD_W / BOARD_H}))`,
            background: BACKGROUND,
          }}
        >
          <canvas
            ref={canvasRef}
            className={cx('absolute inset-0 size-full touch-none', tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => awareness.setLocalStateField('pointer', null)}
          />
          {pointers.map(({ clientId, x, y, user }) => (
            <div
              key={clientId}
              className="pointer-events-none absolute left-0 top-0 transition-transform duration-75 ease-linear"
              style={{ transform: `translate(${x * scale}px, ${y * scale}px)` }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ color: user.color }}>
                <path fill="currentColor" stroke="#0b0d12" strokeWidth="1.5" d="M4 2l16 9-7 2-3 7z" />
              </svg>
              <span className="ml-3 rounded px-1.5 py-0.5 text-[11px] font-semibold text-ink-950" style={{ background: user.color }}>
                {user.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
