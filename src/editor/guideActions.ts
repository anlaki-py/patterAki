import {
  addGuide,
  deleteGuide,
  moveGuide,
  updateGuide,
} from "../document/guides";
import type { ConstructionGuide } from "../document/guideSchema";
import type { PatternDocument } from "../document/schema";
import { createId } from "./ids";
import { useEditor } from "./store";

export type GuideAxis = ConstructionGuide["axis"];

/** Every action below commits exactly one immutable document change. */
export function createGuide(
  axis: GuideAxis,
  positionMm: number,
  id = createId(),
): string {
  const s = useEditor.getState();
  s.commit(addGuide(s.document, axis, positionMm, id));
  useEditor.setState({
    selectedGuide: id,
    selected: [],
    activePoint: null,
    previewIssue: null,
  });
  return id;
}

export function setGuidePosition(id: string, positionMm: number) {
  const s = useEditor.getState();
  s.commit(moveGuide(s.document, id, positionMm));
}

export function offsetGuide(id: string, deltaMm: number) {
  const s = useEditor.getState();
  const guide = s.document.guides[id];
  if (!guide) throw new Error("This guide no longer exists.");
  if (!Number.isFinite(deltaMm))
    throw new Error("Guide offset must be a finite number.");
  s.commit(moveGuide(s.document, id, guide.positionMm + deltaMm));
}

export function setGuideLocked(id: string, locked: boolean) {
  const s = useEditor.getState();
  s.commit(updateGuide(s.document, id, { locked }));
}

export function setGuideVisible(id: string, visible: boolean) {
  const s = useEditor.getState();
  s.commit(updateGuide(s.document, id, { visible }));
}

export function removeGuide(id: string) {
  const s = useEditor.getState();
  s.commit(deleteGuide(s.document, id));
}

export function selectGuide(id: string | null) {
  useEditor.setState({
    selectedGuide: id,
    selected: [],
    activePoint: null,
  });
}

/** Commit a drag from its untouched base document, rejecting stale gestures. */
export function commitGuideMove(
  base: PatternDocument,
  id: string,
  positionMm: number,
): PatternDocument {
  const s = useEditor.getState();
  if (s.document !== base)
    throw new Error("The pattern changed while the guide was moving.");
  const guide = s.document.guides[id];
  if (!guide) throw new Error("This guide no longer exists.");
  if (guide.locked) throw new Error("Unlock this guide before moving it.");
  s.commit(moveGuide(s.document, id, positionMm));
  return useEditor.getState().document;
}
