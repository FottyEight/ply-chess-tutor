import { get, set, del, keys } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * Storage adapter. Everything persistent goes through this interface, so a cloud
 * implementation (e.g. Supabase) can be added later by writing another adapter
 * with the same four methods and syncing on set().
 */
export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const memory = new Map<string, string>();
export const idbAdapter: StorageAdapter = {
  async get(k) { try { return ((await get(k)) as string | undefined) ?? null; } catch { return memory.get(k) ?? null; } },
  async set(k, v) { try { await set(k, v); } catch { memory.set(k, v); } },
  async del(k) { try { await del(k); } catch { memory.delete(k); } },
  async keys() { try { return (await keys()).map(String); } catch { return [...memory.keys()]; } },
};

let adapter: StorageAdapter = idbAdapter;
export const setAdapter = (a: StorageAdapter) => { adapter = a; };

export const zustandStorage: StateStorage = {
  getItem: (k) => adapter.get(k),
  setItem: (k, v) => adapter.set(k, v),
  removeItem: (k) => adapter.del(k),
};

const PREFIX = 'ply:';
export async function exportBackup(): Promise<string> {
  const out: Record<string, unknown> = { app: 'ply', version: 1, exportedAt: new Date().toISOString(), data: {} };
  for (const k of await adapter.keys()) if (k.startsWith(PREFIX)) (out.data as Record<string, unknown>)[k] = JSON.parse((await adapter.get(k)) ?? 'null');
  return JSON.stringify(out, null, 1);
}
export async function importBackup(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'ply' || typeof parsed.data !== 'object') throw new Error('This file is not a Ply backup.');
  for (const [k, v] of Object.entries(parsed.data)) if (k.startsWith(PREFIX)) await adapter.set(k, JSON.stringify(v));
}
