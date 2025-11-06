// Jest setup file for polyfills
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill setImmediate for Winston logger in jsdom environment
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = ((fn: Function, ...args: any[]) => {
    return setTimeout(fn, 0, ...args);
  }) as any;
  
  global.clearImmediate = ((id: any) => {
    clearTimeout(id);
  }) as any;
}
