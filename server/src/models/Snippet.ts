import { Schema, model, type Types } from 'mongoose';
import { jsonOptions, timestamps } from './json.js';

export interface ISnippet {
  room_id: Types.ObjectId;
  /** Plain-text projection of the shared document (handy for search/preview/export). */
  content: string;
  language: string;
  /** Full Yjs document state — the source of truth for code + whiteboard. */
  yjs_state?: Buffer;
  created_at: Date;
  updated_at: Date;
}

const snippetSchema = new Schema<ISnippet>(
  {
    room_id: { type: Schema.Types.ObjectId, ref: 'Room', required: true, unique: true },
    content: { type: String, default: '' },
    language: { type: String, default: 'javascript' },
    yjs_state: { type: Buffer, select: false },
  },
  { timestamps, toJSON: jsonOptions },
);

export const Snippet = model<ISnippet>('Snippet', snippetSchema);

export const DEFAULT_SNIPPET = `// Welcome to SyncPad!
// Share this room's link — everyone here edits the same document in real time.

function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('world'));
`;
