import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Converts any UUID or raw order ID into a clean, human-readable 4-digit numeric receipt number (e.g. "1042").
 * Guarantees that the exact same order UUID will ALWAYS resolve deterministically to the same clean number.
 */
export function getCleanOrderNumber(orderId?: string | null): string {
  if (!orderId) {
    return '1001';
  }

  const clean = String(orderId).trim();

  // If already purely digits (1 to 6 digits)
  if (/^\d{1,6}$/.test(clean)) {
    return clean.padStart(4, '0');
  }

  // Deterministic FNV-1a hash for uniform distribution across 1001-9999
  let hash = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  const positiveHash = Math.abs(hash);
  // Produce a clean 4-digit number between 1001 and 9999
  const num = 1000 + (positiveHash % 9000);
  return num.toString();
}

/**
 * Returns formatted receipt number with hash prefix, e.g. "#1042"
 */
export function formatReceiptNumber(orderId?: string | null): string {
  return `#${getCleanOrderNumber(orderId)}`;
}
