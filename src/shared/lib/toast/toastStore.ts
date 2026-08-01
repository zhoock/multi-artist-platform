import type { ToastItem, ToastShowOptions } from './types';

type ToastListener = () => void;

const DEFAULT_DURATION_MS = 4500;

let toasts: ToastItem[] = [];
let nextToastId = 0;
const listeners = new Set<ToastListener>();
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function clearDismissTimer(id: string): void {
  const timer = dismissTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    dismissTimers.delete(id);
  }
}

function scheduleAutoDismiss(item: ToastItem): void {
  if (item.duration == null || item.duration <= 0) {
    return;
  }

  const timer = setTimeout(() => {
    dismissToast(item.id);
  }, item.duration);
  dismissTimers.set(item.id, timer);
}

function normalizeToastOptions(options: ToastShowOptions): ToastItem {
  const duration = options.duration === undefined ? DEFAULT_DURATION_MS : options.duration;

  return {
    id: `toast-${++nextToastId}`,
    createdAt: Date.now(),
    variant: options.variant ?? 'success',
    title: options.title,
    description: options.description,
    duration,
    dismissible: options.dismissible ?? false,
    placement: options.placement ?? 'top-right',
    layer: options.layer ?? 'default',
    action: options.action,
    undo: options.undo,
  };
}

export function getToasts(): readonly ToastItem[] {
  return toasts;
}

export function subscribeToasts(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showToast(options: ToastShowOptions): string {
  const item = normalizeToastOptions(options);
  toasts = [...toasts, item];
  emit();
  scheduleAutoDismiss(item);
  return item.id;
}

export function dismissToast(id: string): void {
  clearDismissTimer(id);

  const nextToasts = toasts.filter((toast) => toast.id !== id);
  if (nextToasts.length === toasts.length) {
    return;
  }

  toasts = nextToasts;
  emit();
}

export function dismissAllToasts(): void {
  dismissTimers.forEach((timer) => clearTimeout(timer));
  dismissTimers.clear();
  toasts = [];
  emit();
}

/** Test-only reset to keep store isolated between specs. */
export function resetToastStoreForTests(): void {
  dismissAllToasts();
  nextToastId = 0;
}
