import { useSyncExternalStore } from "react";
import type { NoticeMode } from "../../shared/types";

export interface Toast { id: number; message: string }

// One message at a time: a new one replaces what is showing, so nothing stacks or queues.
let current: Toast | null = null;
let lastToastId = 0;
const listeners = new Set<() => void>();

export function showToast(message: string): void {
  current = { id: ++lastToastId, message };
  listeners.forEach((l) => l());
}

/** Removes the toast only while it is still the one that `id` names, so a newer message stays. */
export function clearToast(id: number): void {
  if (current?.id !== id) return;
  current = null;
  listeners.forEach((l) => l());
}

/** With 表示しない the toast is dropped, so it cannot appear after the setting changes. */
export function dropToastWhenOff(notice: NoticeMode): void {
  if (notice === "off" && current !== null) clearToast(current.id);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const currentToast = (): Toast | null => current;

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, currentToast);
}
