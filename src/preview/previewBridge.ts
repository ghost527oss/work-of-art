// @node: F7.6
// The bridge between the preview and PatchBay. Everything from the preview is untrusted text.
import { z } from 'zod';
import { PREVIEW_LIMITS as L } from '../config/previewLimits';

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, L.lineChars);
const NonceSchema = z.string().regex(/^[0-9a-f]{16}$/);

export const BridgeMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ v: z.literal(1), type: z.literal('ready'), nonce: NonceSchema }),
  z.strictObject({ v: z.literal(1), type: z.literal('error'), nonce: NonceSchema, message: z.string().max(2000), line: z.number().int().min(0).max(10_000_000).optional() }),
  z.strictObject({ v: z.literal(1), type: z.literal('console'), nonce: NonceSchema, level: z.enum(['log', 'warn', 'error']), text: z.string().max(2000) }),
]);
export type BridgeMessage = z.infer<typeof BridgeMessageSchema>;

export interface BridgeEvent { source: unknown; origin: string; data: unknown }

export function validateBridgeEvent(event: BridgeEvent, expected: { source: unknown; nonce: string }): { ok: true; message: BridgeMessage } | { ok: false } {
  try {
    if (event.source !== expected.source || event.origin !== 'null') return { ok: false };
    const d = event.data;
    if (typeof d !== 'object' || d === null || Array.isArray(d) || Object.getPrototypeOf(d) !== Object.prototype) return { ok: false };
    if (JSON.stringify(d).length > L.messageBytes) return { ok: false };
    const parsed = BridgeMessageSchema.safeParse(d);
    if (!parsed.success || parsed.data.nonce !== expected.nonce) return { ok: false };
    const m = parsed.data;
    if (m.type === 'console') return { ok: true, message: { ...m, text: clean(m.text) } };
    if (m.type === 'error') return { ok: true, message: { ...m, message: clean(m.message) } };
    return { ok: true, message: m };
  } catch {
    return { ok: false };
  }
}

export class RateLimiter {
  private times: number[] = [];
  constructor(private readonly perSecond: number = L.messagesPerSecond) {}
  /** True when the message is allowed at `now` (milliseconds). */
  allow(now: number): boolean {
    this.times = this.times.filter((t) => now - t < 1000);
    if (this.times.length >= this.perSecond) return false;
    this.times.push(now);
    return true;
  }
}

/** The fixed script written first into a Run-scripts document. Only the nonce and the parent origin are filled in. */
export function INSPECTOR_SOURCE(nonce: string, origin: string): string {
  if (!/^[0-9a-f]{16}$/.test(nonce)) throw new Error('bad nonce');
  if (!/^https?:\/\/[A-Za-z0-9.:[\]-]+$/.test(origin)) throw new Error('bad origin');
  return `(function(){var N=${JSON.stringify(nonce)},O=${JSON.stringify(origin)};function s(m){try{parent.postMessage(m,O)}catch(e){}}function t(a){try{return Array.prototype.map.call(a,function(x){return typeof x==='string'?x:String(x)}).join(' ').slice(0,200)}catch(e){return ''}}['log','warn','error'].forEach(function(l){var o=console[l];console[l]=function(){s({v:1,type:'console',nonce:N,level:l,text:t(arguments)});try{o.apply(console,arguments)}catch(e){}}});window.addEventListener('error',function(e){s({v:1,type:'error',nonce:N,message:String(e.message||'error').slice(0,200),line:e.lineno|0})});window.addEventListener('load',function(){s({v:1,type:'ready',nonce:N})});})();`;
}
