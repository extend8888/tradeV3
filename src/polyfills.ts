// Node.js polyfills for browser environment
import { Buffer as BufferPolyfill } from 'buffer';

// Set up global polyfills
(globalThis as any).Buffer = BufferPolyfill;
(globalThis as any).global = globalThis;

// Process polyfill
(globalThis as any).process = {
  env: {},
  version: 'v16.0.0',
  versions: {},
  cwd: () => '/',
  nextTick: (fn: Function) => setTimeout(fn, 0)
};

// Make sure window has the same references
if (typeof window !== 'undefined') {
  (window as any).Buffer = BufferPolyfill;
  (window as any).global = window;
  (window as any).process = (globalThis as any).process;
}

export {};