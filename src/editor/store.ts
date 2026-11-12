import { seamIssue } from "../document/seamAllowance";
import { pieceEdges } from "../document/pieces";
import type { Anchor } from "../geometry/line";
import { createId } from "./ids";
import { create } from "zustand";
import {
  documentSchema,
  emptyDocument,
  type PatternDocument,
} from "../document/schema";
import {
  defaultSettings,
  type EditorSettings,
  type SnapModes,
} from "./settings";
export type Tool =
  "select" | "line" | "polyline" | "rectangle" | "curve" | "point" | "pan";
type State = {
  outlineVisibility: "stitch" | "cut" | "both";
  editPieceId: string | null;
  lengthAnchor: Anchor;
  lengthDialogEdge: string | null;
  document: PatternDocument;
  past: PatternDocument[];
  future: PatternDocument[];
  revision: number;
  selected: string[];
  selectedGuide: string | null;
  activePoint: string | null;
  tool: Tool;
  snap: boolean;
  grid: boolean;
  gridSnap: boolean;
  gridSpacingMm: number;
  gridMajorEvery: number;
  snapModes: SnapModes;
  mouseRadiusPx: number;
  touchRadiusPx: number;
  releaseMultiplier: number;
  showRulers: boolean;
  showGuides: boolean;
  snapGuides: boolean;
  nudgeMm: number;
  ready: boolean;
  hasDraft: boolean;
  moveDialogOpen: boolean;
  /** True while a pointer gesture owns the canvas; keyboard nudges must wait. */
  gestureActive: boolean;
  saveStatus: string;
  preview: PatternDocument | null;
  previewIssue: string | null;
  cancelVersion: number;
  commit: (doc: PatternDocument) => void;
  undo: () => void;
  redo: () => void;
  load: (doc: PatternDocument) => void;
  cancel: () => void;
  applySettings: (settings: EditorSettings) => void;
};
export const useEditor = create<State>((set, get) => ({
  outlineVisibility: "both",
  editPieceId: null,
  lengthAnchor: "start",
  lengthDialogEdge: null,
  document: emptyDocument(createId()),
  past: [],
  future: [],
  revision: 0,
  selected: [],
  selectedGuide: null,
  activePoint: null,
  tool: "select",
  ...defaultSettings,
  ready: false,
  hasDraft: false,
  moveDialogOpen: false,
  gestureActive: false,
  saveStatus: "Opening…",
  preview: null,
  previewIssue: null,
  cancelVersion: 0,
  commit: (doc) => {
    doc = documentSchema.parse(doc);
    const s = get();
    const issue = seamIssue(doc);
    if (issue) throw new Error(issue);
    for (const piece of Object.values(s.document.pieces)) {
      if (!piece.locked && piece.visible) continue;
      for (const id of pieceEdges(s.document, piece)) {
        const edge = s.document.segments[id];
        if (
          JSON.stringify(edge) !== JSON.stringify(doc.segments[id]) ||
          JSON.stringify(s.document.points[edge.from]) !==
            JSON.stringify(doc.points[edge.from]) ||
          JSON.stringify(s.document.points[edge.to]) !==
            JSON.stringify(doc.points[edge.to])
        )
          throw new Error("Locked or hidden piece geometry cannot be edited.");
      }
    }
    if (JSON.stringify(doc) === JSON.stringify(s.document)) {
      set({ preview: null, previewIssue: null });
      return;
    }
    set({
      document: doc,
      editPieceId:
        s.editPieceId && doc.pieces[s.editPieceId] ? s.editPieceId : null,
      selected: s.selected.filter(
        (id) => !!doc.segments[id] || !!doc.annotations[id],
      ),
      selectedGuide:
        s.selectedGuide && doc.guides[s.selectedGuide] ? s.selectedGuide : null,
      activePoint:
        s.activePoint && doc.points[s.activePoint] ? s.activePoint : null,
      past: [...s.past.slice(-99), s.document],
      future: [],
      revision: s.revision + 1,
      preview: null,
      previewIssue: null,
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
        editPieceId: null,
        past: s.past.slice(0, -1),
        future: [s.document, ...s.future],
        selected: [],
        selectedGuide: null,
        activePoint: null,
        revision: s.revision + 1,
        previewIssue: null,
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
        editPieceId: null,
        past: [...s.past, s.document],
        future: s.future.slice(1),
        selected: [],
        selectedGuide: null,
        activePoint: null,
        revision: s.revision + 1,
        previewIssue: null,
        saveStatus: "Unsaved",
      });
  },
  load: (doc) => {
    documentSchema.parse(doc);
    set((s) => ({
      document: doc,
      editPieceId: null,
      past: [],
      future: [],
      selected: [],
      selectedGuide: null,
      activePoint: null,
      preview: null,
      previewIssue: null,
      hasDraft: false,
      moveDialogOpen: false,
      lengthDialogEdge: null,
      gestureActive: false,
      revision: s.revision + 1,
      cancelVersion: s.cancelVersion + 1,
      saveStatus: "Unsaved",
    }));
  },
  cancel: () =>
    set((s) => ({
      preview: null,
      previewIssue: null,
      hasDraft: false,
      moveDialogOpen: false,
      lengthDialogEdge: null,
      gestureActive: false,
      cancelVersion: s.cancelVersion + 1,
    })),
  applySettings: (settings) => set({ ...settings }),
}));
