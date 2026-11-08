import { createId } from "./ids";
import { create } from "zustand";
import {
  documentSchema,
  emptyDocument,
  type PatternDocument,
} from "../document/schema";
export type Tool =
  "select" | "line" | "polyline" | "rectangle" | "curve" | "point" | "pan";
type State = {
  document: PatternDocument;
  past: PatternDocument[];
  future: PatternDocument[];
  revision: number;
  selected: string[];
  tool: Tool;
  snap: boolean;
  grid: boolean;
  ready: boolean;
  hasDraft: boolean;
  saveStatus: string;
  preview: PatternDocument | null;
  cancelVersion: number;
  commit: (doc: PatternDocument) => void;
  undo: () => void;
  redo: () => void;
  load: (doc: PatternDocument) => void;
  cancel: () => void;
};
export const useEditor = create<State>((set, get) => ({
  document: emptyDocument(createId()),
  past: [],
  future: [],
  revision: 0,
  selected: [],
  tool: "select",
  snap: true,
  grid: true,
  ready: false,
  hasDraft: false,
  saveStatus: "Opening…",
  preview: null,
  cancelVersion: 0,
  commit: (doc) => {
    documentSchema.parse(doc);
    const s = get();
    if (JSON.stringify(doc) === JSON.stringify(s.document)) {
      set({ preview: null });
      return;
    }
    set({
      document: doc,
      selected: s.selected.filter(
        (id) => !!doc.segments[id] || !!doc.annotations[id],
      ),
      past: [...s.past.slice(-99), s.document],
      future: [],
      revision: s.revision + 1,
      preview: null,
      saveStatus: "Unsaved",
    });
  },
  undo: () => {
    const s = get();
    if (s.preview || s.hasDraft) {
      s.cancel();
      return;
    }
    const doc = s.past.at(-1);
    if (doc)
      set({
        document: doc,
        past: s.past.slice(0, -1),
        future: [s.document, ...s.future],
        selected: [],
        revision: s.revision + 1,
        saveStatus: "Unsaved",
      });
  },
  redo: () => {
    const s = get();
    if (s.hasDraft || s.preview) {
      s.cancel();
      return;
    }
    const doc = s.future[0];
    if (doc)
      set({
        document: doc,
        past: [...s.past, s.document],
        future: s.future.slice(1),
        selected: [],
        revision: s.revision + 1,
        saveStatus: "Unsaved",
      });
  },
  load: (doc) => {
    documentSchema.parse(doc);
    set((s) => ({
      document: doc,
      past: [],
      future: [],
      selected: [],
      preview: null,
      hasDraft: false,
      revision: s.revision + 1,
      cancelVersion: s.cancelVersion + 1,
      saveStatus: "Unsaved",
    }));
  },
  cancel: () =>
    set((s) => ({
      preview: null,
      hasDraft: false,
      cancelVersion: s.cancelVersion + 1,
    })),
}));
