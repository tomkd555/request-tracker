import { useSyncExternalStore } from "react";

export interface Toast { id: number; message: string }

// One message at a time: a new one replaces what is showing, so nothing stacks or queues.
let current: Toast | null = null;
let seq = 0;
const listeners = new Set<() => void>();

export function showToast(message: string): void {
  current = { id: ++seq, message };
  listeners.forEach((l) => l());
}

/** Removes the toast only while it is still the one that `id` names, so a newer message stays. */
export function clearToast(id: number): void {
  if (current?.id !== id) return;
  current = null;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const currentToast = (): Toast | null => current;

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, currentToast);
}
