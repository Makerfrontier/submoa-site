// Atomic Comp System — editor state store.
// Deliberately zustand-shaped (getState / setState / subscribe) so Phase 2
// can swap to zustand without touching callers. No dep added yet.

import type { Block } from '../blocks/definitions/types';
import type { BrandConfig } from '../brand/BrandConfig';
import { DEFAULT_BRAND } from '../brand/BrandConfig';

export interface CompEditorState {
  id: string | null;
  name: string;
  blocks: Block[];
  brand: BrandConfig;
  sourceUrl: string | null;
  shareToken: string | null;
  shareEnabled: boolean;
  selectedBlockId: string | null;
  dirty: boolean;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: CompEditorState = {
  id: null,
  name: 'Untitled Comp',
  blocks: [],
  brand: DEFAULT_BRAND,
  sourceUrl: null,
  shareToken: null,
  shareEnabled: false,
  selectedBlockId: null,
  dirty: false,
  loading: false,
  error: null,
};

type Listener = (state: CompEditorState) => void;

let currentState: CompEditorState = { ...INITIAL_STATE };
const listeners: Set<Listener> = new Set();

export function getState(): CompEditorState {
  return currentState;
}

export function setState(patch: Partial<CompEditorState>): void {
  currentState = { ...currentState, ...patch };
  listeners.forEach(fn => fn(currentState));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function resetStore(): void {
  currentState = { ...INITIAL_STATE };
  listeners.forEach(fn => fn(currentState));
}
