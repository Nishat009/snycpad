'use client';

import { useEffect, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { CollabProvider, type ConnectionStatus, type LocalUser, type RoomEnded } from './provider';

/** Creates the Y.Doc + provider for a room and tears them down on unmount. */
export function useCollab(roomCode: string, user: LocalUser) {
  const [collab, setCollab] = useState<{ doc: Y.Doc; provider: CollabProvider } | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new CollabProvider(roomCode, doc, userRef.current);
    setCollab({ doc, provider });
    return () => {
      provider.destroy();
      doc.destroy();
      setCollab(null);
    };
  }, [roomCode, user.id]);

  return collab;
}

export interface ProviderState {
  status: ConnectionStatus;
  synced: boolean;
  pending: number;
  ended: RoomEnded | null;
}

export function useProviderState(provider: CollabProvider | undefined): ProviderState {
  const read = (): ProviderState => ({
    status: provider?.status ?? 'connecting',
    synced: provider?.synced ?? false,
    pending: provider?.pending ?? 0,
    ended: provider?.ended ?? null,
  });
  const [state, setState] = useState(read);

  useEffect(() => {
    if (!provider) return;
    const update = () => setState(read());
    update();
    const offs = [
      provider.on('status', update),
      provider.on('synced', update),
      provider.on('pending', update),
      provider.on('ended', update),
    ];
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return state;
}

export interface Peer {
  clientId: number;
  user: LocalUser;
  isSelf: boolean;
}

/** Everyone currently in the room, one entry per user (multiple tabs collapse). */
export function usePeers(awareness: Awareness | undefined): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const byUser = new Map<string, Peer>();
      awareness.getStates().forEach((state, clientId) => {
        const user = state.user as LocalUser | undefined;
        if (!user?.id) return;
        const isSelf = clientId === awareness.clientID;
        if (!byUser.has(user.id) || isSelf) byUser.set(user.id, { clientId, user, isSelf });
      });
      setPeers([...byUser.values()].sort((a, b) => Number(b.isSelf) - Number(a.isSelf)));
    };
    update();
    awareness.on('change', update);
    return () => awareness.off('change', update);
  }, [awareness]);

  return peers;
}

/** Subscribe to a single key of a shared Y.Map. */
export function useYMapValue<T>(map: Y.Map<unknown> | undefined, key: string, fallback: T): T {
  const [value, setValue] = useState<T>(() => (map?.get(key) as T) ?? fallback);

  useEffect(() => {
    if (!map) return;
    const update = () => setValue((map.get(key) as T) ?? fallback);
    update();
    map.observe(update);
    return () => map.unobserve(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  return value;
}
