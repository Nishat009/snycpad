import { randomInt } from 'node:crypto';

// No 0/o, 1/l/i — codes are meant to be read aloud and typed by hand.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const chunk = (length: number) =>
  Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** e.g. `k7m-p2xq-9ad` */
export const generateRoomCode = () => `${chunk(3)}-${chunk(4)}-${chunk(3)}`;

export const normalizeRoomCode = (code: unknown) => String(code ?? '').trim().toLowerCase();
