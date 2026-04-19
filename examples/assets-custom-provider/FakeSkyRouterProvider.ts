/**
 * FakeSkyRouterProvider — reference `LocationProvider` adapter.
 *
 * This is a demo-only stub that mimics the shape of a SkyRouter-style live
 * feed. It never hits the network — it seeds an in-memory table and emits
 * updates on a timer to exercise the `subscribe` code path. A real adapter
 * would replace the seed + interval with the vendor's websocket / HTTP
 * polling client.
 *
 * Wiring it into WorksCalendar:
 *
 *   import { FakeSkyRouterProvider } from './FakeSkyRouterProvider';
 *   const provider = new FakeSkyRouterProvider({ tails: ['N121AB', 'N505CD'] });
 *   <WorksCalendar locationProvider={provider} ...props />
 */
import type { LocationData, LocationProvider } from 'works-calendar';

type Subscribers = Map<string, Set<(data: LocationData) => void>>;

const AIRPORTS = ['KPHX', 'KLAX', 'KDEN', 'KBOS', 'KSEA', 'KORD'];

function randomFrom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

interface FakeSkyRouterOptions {
  tails?: string[];
  tickMs?: number;
}

export class FakeSkyRouterProvider implements LocationProvider {
  readonly id = 'fake-skyrouter';
  readonly refreshIntervalMs = 0; // subscribe is the source of truth

  private store = new Map<string, LocationData>();
  private subscribers: Subscribers = new Map();
  private interval: ReturnType<typeof setInterval> | null = null;
  private tickMs: number;

  constructor(opts: FakeSkyRouterOptions = {}) {
    this.tickMs = opts.tickMs ?? 10_000;
    const tails = opts.tails ?? [];
    for (const tail of tails) {
      this.store.set(tail, {
        text:   randomFrom(AIRPORTS),
        status: 'live',
        asOf:   new Date().toISOString(),
      });
    }
  }

  async init(): Promise<void> {
    if (this.interval) return;
    this.interval = setInterval(() => this.tick(), this.tickMs);
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.subscribers.clear();
  }

  async fetchLocation(resourceId: string): Promise<LocationData> {
    const existing = this.store.get(resourceId);
    if (existing) return existing;
    const seeded: LocationData = {
      text:   randomFrom(AIRPORTS),
      status: 'live',
      asOf:   new Date().toISOString(),
    };
    this.store.set(resourceId, seeded);
    return seeded;
  }

  subscribe(resourceId: string, onUpdate: (data: LocationData) => void): () => void {
    let set = this.subscribers.get(resourceId);
    if (!set) {
      set = new Set();
      this.subscribers.set(resourceId, set);
    }
    set.add(onUpdate);
    return () => { set?.delete(onUpdate); };
  }

  private tick(): void {
    for (const [id, prev] of this.store.entries()) {
      // 50% chance the tail "moves" each tick.
      if (Math.random() < 0.5) {
        const next: LocationData = {
          text:   randomFrom(AIRPORTS),
          status: 'live',
          asOf:   new Date().toISOString(),
          coords: prev.coords,
        };
        this.store.set(id, next);
        const subs = this.subscribers.get(id);
        subs?.forEach(cb => cb(next));
      }
    }
  }
}
