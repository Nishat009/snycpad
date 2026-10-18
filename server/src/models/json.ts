/** Shared toJSON options: expose `id`, hide internals. */
export const jsonOptions = {
  versionKey: false,
  transform: (_doc: unknown, ret: any) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    delete ret.yjs_state;
    return ret;
  },
};

export const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' } as const;
