/**
 * FirebaseAdapter — Firestore integration adapter.
 *
 * Connects to a Firestore collection using the Firebase JS SDK v9+ (modular
 * API). Implements loadRange, createEvent, updateEvent, deleteEvent, and a
 * real-time subscribe via onSnapshot.
 *
 * The adapter is duck-typed — it never imports `firebase/firestore` directly,
 * so the package compiles even when the Firebase SDK is not installed.
 *
 * @example — basic setup
 *   import { initializeApp } from 'firebase/app';
 *   import { getFirestore } from 'firebase/firestore';
 *
 *   const app = initializeApp({ projectId: 'my-project', ... });
 *   const db  = getFirestore(app);
 *
 *   const adapter = new FirebaseAdapter({ db, collection: 'calendarEvents' });
 *   const events  = await adapter.loadRange(start, end);
 *
 * @example — with field mapping + tenant filter
 *   const adapter = new FirebaseAdapter({
 *     db,
 *     collection: 'events',
 *     startField: 'startsAt',
 *     endField:   'endsAt',
 *     extraWhere: [['orgId', '==', 'acme']],
 *     fromDoc: doc => ({
 *       id:    doc.id,
 *       title: doc.name as string,
 *       start: (doc.startsAt as Timestamp).toDate(),
 *       end:   (doc.endsAt   as Timestamp).toDate(),
 *     }),
 *     toDoc: ev => ({
 *       name:     ev.title,
 *       startsAt: ev.start,
 *       endsAt:   ev.end,
 *       orgId:    'acme',
 *     }),
 *   });
 */

import type { CalendarAdapter, AdapterChangeCallback, AdapterUnsubscribe } from './CalendarAdapter';
import type { CalendarEventV1 } from '../types';

// ─── Firestore duck-types ─────────────────────────────────────────────────────

type FirestoreDoc = Record<string, unknown> & { id?: string };
type WhereConstraint = [field: string, op: string, value: unknown];

interface FirestoreQuery {
  where?(field: string, op: string, value: unknown): FirestoreQuery;
  orderBy?(field: string): FirestoreQuery;
  onSnapshot(cb: (snap: FirestoreSnapshot) => void): () => void;
  get?(): Promise<FirestoreSnapshot>;
}

interface FirestoreSnapshot {
  docs: FirestoreDocSnapshot[];
  docChanges(): FirestoreDocChange[];
  forEach(cb: (doc: FirestoreDocSnapshot) => void): void;
}

interface FirestoreDocSnapshot {
  id: string;
  data(): FirestoreDoc;
  exists: boolean;
}

interface FirestoreDocChange {
  type: 'added' | 'modified' | 'removed';
  doc: FirestoreDocSnapshot;
}

interface FirestoreDocRef {
  id: string;
}

interface FirestoreCollection {
  where(field: string, op: string, value: unknown): FirestoreQuery;
  orderBy(field: string): FirestoreQuery;
  add(data: FirestoreDoc): Promise<FirestoreDocRef>;
}

interface FirestoreDb {
  collection(path: string): FirestoreCollection;
  // v9 modular SDK compat (collection/doc are top-level fns — passed via db)
  [key: string]: unknown;
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface FirebaseAdapterOptions {
  /**
   * Firestore database instance — result of `getFirestore(app)`.
   * Also accepts a v9 modular-style object; see adapterFns option below.
   */
  readonly db: unknown;

  /** Name of the Firestore collection that stores events. */
  readonly collection: string;

  /** Field for the event start timestamp. Default: 'start'. */
  readonly startField?: string;

  /** Field for the event end timestamp. Default: 'end'. */
  readonly endField?: string;

  /**
   * Additional `where` constraints applied to every query.
   * Each entry is `[field, op, value]`, e.g. `[['orgId', '==', 'acme']]`.
   */
  readonly extraWhere?: ReadonlyArray<WhereConstraint>;

  /**
   * Map a Firestore document (data + id) → CalendarEventV1.
   * Default: identity — assumes the document matches CalendarEventV1.
   */
  readonly fromDoc?: (doc: FirestoreDoc & { id: string }) => CalendarEventV1;

  /**
   * Map a CalendarEventV1 → Firestore document fields for write operations.
   * Default: passes the event as-is.
   */
  readonly toDoc?: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => FirestoreDoc;

  /**
   * Optional Firestore v9 modular API functions.
   * Pass these when using the modular SDK (recommended):
   *   import { collection, query, where, orderBy, getDocs, addDoc,
   *            updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
   *   adapterFns: { collection, query, where, orderBy, getDocs,
   *                 addDoc, updateDoc, deleteDoc, doc, onSnapshot }
   *
   * When omitted, falls back to the v8 namespaced API (db.collection(...).where(...)).
   */
  readonly adapterFns?: {
    collection: (...args: unknown[]) => unknown;
    query:      (...args: unknown[]) => unknown;
    where:      (field: string, op: string, value: unknown) => unknown;
    orderBy:    (field: string) => unknown;
    getDocs:    (q: unknown) => Promise<FirestoreSnapshot>;
    addDoc:     (colRef: unknown, data: FirestoreDoc) => Promise<FirestoreDocRef>;
    updateDoc:  (docRef: unknown, data: FirestoreDoc) => Promise<void>;
    deleteDoc:  (docRef: unknown) => Promise<void>;
    doc:        (db: unknown, col: string, id: string) => unknown;
    onSnapshot: (q: unknown, cb: (snap: FirestoreSnapshot) => void) => () => void;
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class FirebaseAdapter implements CalendarAdapter {
  private readonly _db: FirestoreDb;
  private readonly _col: string;
  private readonly _startField: string;
  private readonly _endField: string;
  private readonly _extraWhere: ReadonlyArray<WhereConstraint>;
  private readonly _fromDoc: (doc: FirestoreDoc & { id: string }) => CalendarEventV1;
  private readonly _toDoc: (ev: CalendarEventV1 | Partial<CalendarEventV1>) => FirestoreDoc;
  private readonly _fns: FirebaseAdapterOptions['adapterFns'] | undefined;

  constructor(options: FirebaseAdapterOptions) {
    this._db         = options.db as FirestoreDb;
    this._col        = options.collection;
    this._startField = options.startField ?? 'start';
    this._endField   = options.endField   ?? 'end';
    this._extraWhere = options.extraWhere ?? [];
    this._fromDoc    = options.fromDoc ?? (d => d as unknown as CalendarEventV1);
    this._toDoc      = options.toDoc   ?? (ev => ev as unknown as FirestoreDoc);
    this._fns        = options.adapterFns;
  }

  // ── Internal: build a range query ──────────────────────────────────────────

  private _rangeQuery(start: Date, end: Date): unknown {
    const fns = this._fns;
    if (fns) {
      const colRef = fns.collection(this._db, this._col);
      const constraints: unknown[] = [
        fns.where(this._startField, '>=', start),
        fns.where(this._startField, '<',  end),
        ...this._extraWhere.map(([f, op, v]) => fns.where(f, op, v)),
        fns.orderBy(this._startField),
      ];
      return fns.query(colRef, ...constraints);
    }
    // v8 fallback — collection().where() always returns a chainable Query in v8
    let q: FirestoreQuery = (this._db
      .collection(this._col)
      .where(this._startField, '>=', start) as FirestoreQuery & { where(f: string, op: string, v: unknown): FirestoreQuery })
      .where(this._startField, '<', end);
    for (const [f, op, v] of this._extraWhere) {
      if (q.where) q = q.where(f, op, v);
    }
    return q.orderBy ? q.orderBy(this._startField) : q;
  }

  private _docToEvent(snap: FirestoreDocSnapshot): CalendarEventV1 {
    return this._fromDoc({ ...snap.data(), id: snap.id });
  }

  // ── loadRange ───────────────────────────────────────────────────────────────

  async loadRange(start: Date, end: Date, signal?: AbortSignal): Promise<CalendarEventV1[]> {
    const q = this._rangeQuery(start, end);
    const fns = this._fns;

    let snapshot: FirestoreSnapshot;
    if (fns) {
      snapshot = await fns.getDocs(q);
    } else {
      snapshot = await (q as FirestoreQuery).get!();
    }

    if (signal?.aborted) return [];
    const events: CalendarEventV1[] = [];
    snapshot.forEach(doc => events.push(this._docToEvent(doc)));
    return events;
  }

  // ── createEvent ─────────────────────────────────────────────────────────────

  async createEvent(event: CalendarEventV1): Promise<CalendarEventV1> {
    const data = this._toDoc(event);
    const fns = this._fns;

    let ref: FirestoreDocRef;
    if (fns) {
      const colRef = fns.collection(this._db, this._col);
      ref = await fns.addDoc(colRef, data);
    } else {
      ref = await this._db.collection(this._col).add(data);
    }

    return this._fromDoc({ ...data, id: ref.id });
  }

  // ── updateEvent ─────────────────────────────────────────────────────────────

  async updateEvent(id: string, patch: Partial<CalendarEventV1>): Promise<CalendarEventV1> {
    const data = this._toDoc(patch);
    const fns = this._fns;

    if (fns) {
      const docRef = fns.doc(this._db, this._col, id);
      await fns.updateDoc(docRef, data);
    } else {
      await (this._db as unknown as {
        doc(path: string): { update(d: FirestoreDoc): Promise<void>; get(): Promise<FirestoreDocSnapshot> }
      }).doc(`${this._col}/${id}`).update(data);
    }

    return this._fromDoc({ ...data, id });
  }

  // ── deleteEvent ─────────────────────────────────────────────────────────────

  async deleteEvent(id: string): Promise<void> {
    const fns = this._fns;
    if (fns) {
      const docRef = fns.doc(this._db, this._col, id);
      await fns.deleteDoc(docRef);
    } else {
      await (this._db as unknown as {
        doc(path: string): { delete(): Promise<void> }
      }).doc(`${this._col}/${id}`).delete();
    }
  }

  // ── subscribe ───────────────────────────────────────────────────────────────

  subscribe(
    callback: AdapterChangeCallback,
    opts?: { rangeStart?: Date; rangeEnd?: Date },
  ): AdapterUnsubscribe {
    const start = opts?.rangeStart ?? new Date(Date.now() - 30 * 24 * 3_600_000);
    const end   = opts?.rangeEnd   ?? new Date(Date.now() + 30 * 24 * 3_600_000);
    const q     = this._rangeQuery(start, end);
    const fns   = this._fns;

    const unsubscribe = fns
      ? fns.onSnapshot(q, (snap: FirestoreSnapshot) => {
          for (const change of snap.docChanges()) {
            const event = this._docToEvent(change.doc);
            if (change.type === 'added')    callback({ type: 'insert', event });
            if (change.type === 'modified') callback({ type: 'update', event });
            if (change.type === 'removed')  callback({ type: 'delete', id: change.doc.id });
          }
        })
      : (q as FirestoreQuery).onSnapshot((snap: FirestoreSnapshot) => {
          for (const change of snap.docChanges()) {
            const event = this._docToEvent(change.doc);
            if (change.type === 'added')    callback({ type: 'insert', event });
            if (change.type === 'modified') callback({ type: 'update', event });
            if (change.type === 'removed')  callback({ type: 'delete', id: change.doc.id });
          }
        });

    return unsubscribe;
  }
}
