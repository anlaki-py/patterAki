import { isFastener } from "../document/fastenerSchema";
import {
  editedFastener,
  fastenerFields,
  type FastenerFields,
} from "./fastenerEdit";
import type { Annotation, LabelPosition } from "../document/annotationSchema";
import { putAnnotation } from "../document/annotations";
import { unitFactor, type PatternDocument } from "../document/schema";
import { useEditor } from "./store";
export type AnnotationSession = {
  base: PatternDocument;
  annotation: Annotation;
  revision: number;
  cancelVersion: number;
};
export type AnnotationFields = {
  fastener?: FastenerFields;
  labelPosition?: LabelPosition;
  text: string;
  size: number | string;
  length: number | string;
  rotation: number | string;
};
export function annotationFields(
  mark: Annotation,
  units: PatternDocument["unitsDisplay"],
): AnnotationFields {
  if (isFastener(mark))
    return {
      text: "",
      size: 1,
      length: 1,
      rotation: mark.rotation,
      fastener: fastenerFields(mark, unitFactor[units]),
    };
  return {
    text:
      mark.kind === "text"
        ? mark.text
        : mark.kind === "drill"
          ? ""
          : mark.label,
    size:
      (mark.kind === "drill" ? mark.sizeMm : mark.fontSizeMm) /
      unitFactor[units],
    length: ("lengthMm" in mark ? mark.lengthMm : 60) / unitFactor[units],
    rotation: mark.rotation,
    ...(mark.kind === "grainline"
      ? { labelPosition: mark.labelPosition ?? "top" }
      : {}),
  };
}
export function previewAnnotation(
  session: AnnotationSession,
  fields: AnnotationFields,
): PatternDocument {
  const factor = unitFactor[session.base.unitsDisplay];
  const mark = session.annotation;
  if (
    typeof fields.rotation !== "number" ||
    !Number.isFinite(fields.rotation) ||
    Math.abs(fields.rotation) > 360
  )
    throw new Error("Enter an angle between -360° and 360°.");
  if (isFastener(mark)) {
    if (!fields.fastener)
      throw new Error("Reopen the mark editor to edit its dimensions.");

    return putAnnotation(
      session.base,
      editedFastener(
        { ...mark, rotation: fields.rotation },
        fields.fastener,
        factor,
      ),
    );
  }
  if (
    typeof fields.size !== "number" ||
    !Number.isFinite(fields.size) ||
    fields.size * factor < 1 ||
    fields.size * factor > 1000
  )
    throw new Error("Size must be between 1 and 1000 mm.");

  const base = { ...mark, rotation: fields.rotation };
  if (mark.kind === "text") {
    if (!fields.text.trim() || fields.text.length > 1000)
      throw new Error("Enter 1–1000 characters of text.");
    return putAnnotation(session.base, {
      ...base,
      kind: "text",
      text: fields.text,
      fontSizeMm: fields.size * factor,
    });
  }
  if (mark.kind === "drill")
    return putAnnotation(session.base, {
      ...base,
      kind: "drill",
      sizeMm: fields.size * factor,
    });
  if (
    typeof fields.length !== "number" ||
    !Number.isFinite(fields.length) ||
    fields.length * factor < 1 ||
    fields.length * factor > 100000
  )
    throw new Error("Length must be between 1 and 100000 mm.");
  if (fields.text.length > 120 || fields.text.includes("\n"))
    throw new Error("Use a label of up to 120 characters on one line.");
  return putAnnotation(session.base, {
    ...base,
    kind: mark.kind,
    ...(mark.kind === "grainline"
      ? { labelPosition: fields.labelPosition ?? "top" }
      : {}),
    lengthMm: fields.length * factor,
    label: fields.text,
    fontSizeMm: fields.size * factor,
  });
}
export function annotationSessionActive(session: AnnotationSession): boolean {
  const s = useEditor.getState();
  return (
    s.revision === session.revision && s.cancelVersion === session.cancelVersion
  );
}
export function commitAnnotation(
  session: AnnotationSession,
  fields: AnnotationFields,
) {
  if (!annotationSessionActive(session))
    throw new Error("The pattern changed. Reopen the mark editor.");
  const next = previewAnnotation(session, fields);
  useEditor.getState().commit(next);
  useEditor.setState({ selected: [session.annotation.id] });
}
