import { assertValidDocumentEdit } from "../document/contourValidation";
import { applyDraftTangents } from "../document/curveDraft";
import { DraftPrecision } from "../ui/DraftPrecision";
import { DraftOverlay } from "./DraftOverlay";
import { exactDraftEndpoint, rectangleDimensions } from "./draftInput";
import { SplitHover } from "./SplitHover";
import { useAutoPan, type CanvasPointer } from "./useAutoPan";
import { DivisionDialog, type DivisionSession } from "../ui/DivisionDialog";
import { EdgeLengthDialog, openLengthEditor } from "../ui/EdgeLengthDialog";
import { DimensionOverlay } from "./DimensionOverlay";
import { SvgAnnotations } from "./SvgAnnotations";
import { useAnnotationEditor } from "./useAnnotationEditor";
import { fitView } from "./fitView";
import { useSelectionDrag } from "./useSelectionDrag";
import {
  SnapOverlay,
  snapKindLabel,
  type SnapOverlayValue,
} from "./SnapOverlay";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useCurveDrag } from "./useCurveDrag";
import { segmentProjection } from "../document/segments";
import { resolvePointerDetailed } from "./resolvePointer";
import type { SnapResolution } from "./snapResolver";
import { usePointPlacement } from "./usePointPlacement";
import { insertPointAt } from "./pointTool";
import { createId } from "./ids";
import { SvgGeometry } from "./SvgGeometry";
import { GuideOverlay } from "./GuideOverlay";
import { Rulers } from "./Rulers";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button, Group, Menu, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEditor } from "./store";
import { addPath, splitLine } from "../document/operations";
import { angle, distance, type Vec2 } from "../geometry/line";
import type { SnapCandidate, SnapLock } from "../geometry/snapping";
import {
  formatLength,
  unitFactor,
  type PatternDocument,
} from "../document/schema";
import { commands, dispatchShortcut, toolCommands } from "./commands";
import {
  tabCyclesTarget,
  isEditingText,
  hasOpenShortcutOverlay,
} from "./command";
import { bindDraftCommands } from "./draftCommands";
import { commandProps } from "../ui/CommandControls";
import { MoveDialog } from "../ui/MoveDialog";
import { SnapSettings } from "../ui/SnapSettings";
import { commitGuideMove, createGuide, type GuideAxis } from "./guideActions";
import { coordinateLimit } from "../document/guideSchema";
import {
  movementAxis,
  movementOptionsFromState,
  resolveVertexMovement,
  type MovementAxis,
  type MovementResolution,
} from "./movement";

type CursorSnap = SnapOverlayValue & {
  choices?: SnapCandidate[];
  choiceIndex?: number;
};

type Drag = {
  pointer: number;
  pointId?: string;
  start: Vec2;
  screen: Vec2;
  document: PatternDocument;
  view: { x: number; y: number; scale: number };
  revision: number;
};

type GuideDrag = {
  pointer: number;
  id: string;
  axis: GuideAxis;
  positionMm: number;
  base: PatternDocument;
  revision: number;
};

type Modifiers = {
  touch: boolean;
  alt: boolean;
  shift: boolean;
};

const freeSnap = (point: Vec2): CursorSnap => ({ point, label: "" });

function candidateLabel(candidate: SnapCandidate) {
  const label =
    candidate.label || snapKindLabel(candidate.kind) || candidate.kind;
  return `${label} — X ${formatLength(candidate.point.x, "mm")} · Y ${formatLength(
    candidate.point.y,
    "mm",
  )}${candidate.edgeId ? ` · edge ${candidate.edgeId}` : ""} · ${candidate.targetId.slice(0, 42)}`;
}

export function EditorViewport() {
  const s = useEditor();
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, scale: 2 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const curveDrag = useCurveDrag();
  const annotations = useAnnotationEditor();
  const placement = usePointPlacement(view.scale);
  const [division, setDivision] = useState<DivisionSession | null>(null);
  const draftTangents = useRef(new Map<number, Vec2>());
  const draftPress = useRef<{
    pointer: number;
    start: Vec2;
    index: number;
    points: Vec2[];
    commit: boolean;
    closed: boolean;
  } | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [cursor, setCursor] = useState<CursorSnap>(freeSnap({ x: 0, y: 0 }));
  const cursorRef = useRef<CursorSnap>(cursor);
  const lock = useRef<SnapLock | null>(null);
  const lastPointer = useRef<{ point: Vec2; touch: boolean } | null>(null);
  const lastMove = useRef<{
    point: Vec2;
    pointer: number;
    touch: boolean;
    shift: boolean;
  } | null>(null);
  const vertexMoved = useRef(false);
  const selectionDrag = useSelectionDrag(view.scale, cursor.point);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragAxis = useRef<MovementAxis>(null);
  const [guideDrag, setGuideDrag] = useState<GuideDrag | null>(null);
  const [editGuides, setEditGuides] = useState(false);
  const [bypass, setBypass] = useState(false);
  const [exact, setExact] = useState<string | number>("");
  const [degrees, setDegrees] = useState<string | number>(0);
  const [width, setWidth] = useState<string | number>(18);
  const [height, setHeight] = useState<string | number>(24);
  const space = useRef(false);
  const exactField = useRef<HTMLInputElement>(null);
  const lastDraftClick = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const doc = s.preview ?? s.document;
  const origin = draft.at(-1);
  const factor = unitFactor[doc.unitsDisplay];
  let exactPoint: Vec2 | null = null;
  let exactError = "";
  if (origin && exact !== "") {
    try {
      exactPoint = exactDraftEndpoint(origin, exact, degrees, factor);
    } catch (error) {
      exactError = (error as Error).message;
    }
  }
  let rectangleSize: { width: number; height: number } | null = null;
  let rectangleError = "";
  if (origin && s.tool === "rectangle") {
    try {
      rectangleSize = rectangleDimensions(width, height, factor);
    } catch (error) {
      rectangleError = (error as Error).message;
    }
  }
  const draftEnd = exactPoint ?? cursor.point;
  const focusExact = (seed?: string) => {
    if (!origin) return;
    if (exact === "" || seed !== undefined) {
      setDegrees(angle(origin, cursor.point));
      setExact(seed ?? distance(origin, cursor.point) / factor);
    }
    queueMicrotask(() => {
      exactField.current?.focus();
      if (seed === undefined) exactField.current?.select();
    });
  };

  const setCursorState = (next: CursorSnap) => {
    cursorRef.current = next;
    setCursor(next);
  };

  const applyResolution = (resolution: SnapResolution, fallback: Vec2) => {
    const chosen = resolution.chosen;
    if (!chosen) {
      setCursorState(freeSnap(fallback));
      return;
    }
    setCursorState({
      ...chosen,
      choices: resolution.choices,
      choiceIndex: resolution.choiceIndex,
    });
  };

  const applyMovementResolution = (
    result: MovementResolution,
    fallback: Vec2,
  ) => {
    applyResolution(
      {
        chosen: result.chosen,
        choices: result.choices,
        choiceIndex: result.choiceIndex,
        lock: result.lock,
        tolerance: 0,
      },
      fallback,
    );
  };

  const reset = () => {
    setDraft([]);
    draftTangents.current.clear();
    draftPress.current = null;
    setDrag(null);
    setGuideDrag(null);
    setExact("");
    setCursorState({
      point: cursorRef.current.point,
      label: "",
    });
    lock.current = null;
    dragAxis.current = null;
    setBypass(false);
    useEditor.setState({ gestureActive: false });
  };
  const abortGesture = () => {
    vertexMoved.current = false;
    lastMove.current = null;
    reset();
    useEditor.getState().cancel();
  };
  useEffect(() => {
    reset();
    // Intentionally reset only on cancel/tool changes; reset itself is stable
    // per render and adding it would clear every active draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cancelVersion, s.tool]);
  useEffect(() => {
    useEditor.setState({ hasDraft: draft.length > 0 });
  }, [draft.length]);
  useEffect(() => {
    lock.current = null;
    const current = cursorRef.current;
    if (current.choices)
      setCursorState({
        ...current,
        choices: undefined,
        choiceIndex: undefined,
      });
  }, [s.revision]);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const update = () =>
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const commitPath = (points: Vec2[], closed = false) => {
    try {
      s.commit(
        assertValidDocumentEdit(
          s.document,
          applyDraftTangents(
            addPath(s.document, points, closed, createId),
            points,
            draftTangents.current,
          ),
        ),
      );
      reset();
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
  };
  const draftActions = bindDraftCommands({
    draft,
    exact,
    degrees,
    width,
    height,
    factor,
    commitPath,
    setDraft: (points) => {
      for (const index of draftTangents.current.keys())
        if (index >= points.length) draftTangents.current.delete(index);
      setDraft(points);
    },
    clearExact: () => setExact(""),
  });

  const position = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.x) / view.scale,
      y: (e.clientY - rect.top - view.y) / view.scale,
    };
  };

  const excludedEdgesFor = (pointId: string) =>
    new Set(
      Object.values(s.document.segments)
        .filter((edge) => edge.from === pointId || edge.to === pointId)
        .map((edge) => edge.id),
    );

  const resolveAt = (
    point: Vec2,
    modifiers: Modifiers,
    options: {
      movingPoint?: string;
      panning?: boolean;
      origin?: Vec2;
      constrain?: boolean;
    } = {},
  ) => {
    const state = useEditor.getState();
    const panning =
      options.panning ?? (space.current || !!(drag && !drag.pointId));
    const movingPoint = options.movingPoint;
    const bypassing = modifiers.alt || !state.snap;
    const resolution = resolvePointerDetailed(state.document, point, {
      tool: state.tool,
      scale: view.scale,
      touch: modifiers.touch,
      origin: options.origin,
      movingPoint,
      panning,
      snap: state.snap,
      grid: state.gridSnap,
      bypass: modifiers.alt,
      constrain: options.constrain ?? (modifiers.shift && !movingPoint),
      modes: state.snapModes,
      gridSpacingMm: state.gridSpacingMm,
      mouseRadiusPx: state.mouseRadiusPx,
      touchRadiusPx: state.touchRadiusPx,
      releaseMultiplier: state.releaseMultiplier,
      previousLock: bypassing ? null : lock.current,
      showGuides: state.showGuides,
      snapGuides: state.snapGuides,
      excludedEdges: movingPoint ? excludedEdgesFor(movingPoint) : undefined,
    });
    lock.current = bypassing ? null : resolution.lock;
    applyResolution(resolution, point);
    lastPointer.current = { point, touch: modifiers.touch };
    setBypass(modifiers.alt);
    return resolution;
  };

  const cycleTarget = (direction: 1 | -1) => {
    const current = cursorRef.current;
    const choices = current.choices ?? [];
    if (choices.length < 2) return false;
    const index =
      ((current.choiceIndex ?? 0) + direction + choices.length) %
      choices.length;
    const chosen = choices[index];
    lock.current = {
      targetId: chosen.targetId,
      point: chosen.point,
      kind: chosen.kind,
    };
    setCursorState({ ...chosen, choices, choiceIndex: index });
    return true;
  };

  const chooseTarget = (index: number) => {
    const current = cursorRef.current;
    const choices = current.choices ?? [];
    const chosen = choices[index];
    if (!chosen) return;
    lock.current = {
      targetId: chosen.targetId,
      point: chosen.point,
      kind: chosen.kind,
    };
    setCursorState({ ...chosen, choices, choiceIndex: index });
  };

  const refreshLastPointer = () => {
    const last = lastPointer.current;
    if (!last) return;
    resolveAt(last.point, { touch: last.touch, alt: false, shift: false });
  };

  /** Alt release must reacquire a target immediately, even without a move. */
  const reacquireMovement = () => {
    const last = lastMove.current;
    if (!last) return false;
    if (drag?.pointId && drag.pointer === last.pointer && vertexMoved.current) {
      const result = resolveVertexMovement(
        drag.document,
        drag.pointId,
        last.point,
        {
          ...movementOptionsFromState(view.scale, last.touch, false),
          axisLock: dragAxis.current,
          previousLock: null,
        },
      );
      lock.current = result.lock;
      applyMovementResolution(result, result.point);
      useEditor.setState({
        preview: result.preview,
        previewIssue: result.issue,
      });
      return true;
    }
    if (selectionDrag.active())
      return selectionDrag.move(last.point, last.pointer, {
        shiftKey: last.shift,
        altKey: false,
      });
    return false;
  };

  const escape = commands.escape.bind({
    execute: () => {
      const active =
        draft.length > 0 ||
        !!drag ||
        !!guideDrag ||
        selectionDrag.active() ||
        s.preview;
      commands.cancel.bind().run();
      if (!active)
        toolCommands.find((command) => command.id === "select")!.run();
    },
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("[data-dimension], [data-draft-dimension]")
      )
        return;
      if (
        !e.defaultPrevented &&
        !e.isComposing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isEditingText(e.target) &&
        !hasOpenShortcutOverlay() &&
        !(e.target instanceof Element && e.target.closest('[role="button"]')) &&
        origin &&
        (s.tool === "line" || s.tool === "polyline") &&
        (/^[0-9.]$/.test(e.key) || (e.key === "Enter" && draft.length === 1))
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        focusExact(e.key === "Enter" ? undefined : e.key);
        return;
      }
      if (
        tabCyclesTarget(
          e,
          choices.length,
          draft.length > 0 ||
            s.tool === "point" ||
            !!drag?.pointId ||
            selectionDrag.active(),
        ) &&
        cycleTarget(e.shiftKey ? -1 : 1)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (
        e.key === "Alt" &&
        (draft.length > 0 || !!drag?.pointId || selectionDrag.active())
      ) {
        setBypass(true);
        lock.current = null;
      }
      const transient =
        draft.length > 0 || !!drag || !!guideDrag || selectionDrag.active();
      const local = [
        commands.temporaryPan.bind({
          execute: () => {
            space.current = true;
          },
        }),
        escape,
        ...(draft.length ? [draftActions.removePoint] : []),
        ...(transient
          ? [
              commands.cancelGesture.bind({
                execute: () => commands.cancel.bind().run(),
              }),
            ]
          : []),
        ...(draft.length > 1
          ? [draftActions.finish]
          : s.selected.length === 1
            ? [
                s.document.annotations[s.selected[0]]
                  ? commands.editMark.bind({
                      execute: () => annotations.edit(s.selected[0]),
                    })
                  : commands.editLength.bind({
                      execute: () => openLengthEditor(s.selected[0]),
                    }),
              ]
            : []),
      ];
      if (dispatchShortcut(e, local)) e.stopImmediatePropagation();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
      if (e.key === "Alt") {
        setBypass(false);
        if (!reacquireMovement()) refreshLastPointer();
      }
    };
    const blur = () => {
      space.current = false;
      setBypass(false);
      s.cancel();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });

  const modifiers = (e: CanvasPointer): Modifiers => ({
    touch: e.pointerType === "touch",
    alt: e.altKey,
    shift: e.shiftKey,
  });

  const beginGuideDrag = (guideId: string, e: PointerEvent<SVGSVGElement>) => {
    const state = useEditor.getState();
    const guide = state.document.guides[guideId];
    if (!guide) return;
    setEditGuides(true);
    useEditor.setState({
      selectedGuide: guide.id,
      selected: [],
      activePoint: null,
    });
    if (guide.locked) {
      notifications.show({
        message: "This guide is locked. Unlock it in Properties to move it.",
      });
      return;
    }
    setGuideDrag({
      pointer: e.pointerId,
      id: guide.id,
      axis: guide.axis,
      positionMm: guide.positionMm,
      base: state.document,
      revision: state.revision,
    });
    setCursorState(freeSnap(position(e)));
  };

  const finishGuideDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (!guideDrag || guideDrag.pointer !== e.pointerId) return;
    const rect = svg.current?.getBoundingClientRect();
    const inside =
      !!rect &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    const mm = guideDrag.axis === "x" ? position(e).x : position(e).y;
    const start = guideDrag.base.guides[guideDrag.id]?.positionMm;
    if (
      inside &&
      Number.isFinite(mm) &&
      Math.abs(mm) <= coordinateLimit &&
      (start === undefined || Math.abs(mm - start) > 1e-9) &&
      useEditor.getState().revision === guideDrag.revision
    ) {
      try {
        commitGuideMove(guideDrag.base, guideDrag.id, mm);
      } catch (error) {
        notifications.show({
          color: "red",
          message: (error as Error).message,
        });
      }
    }
    setGuideDrag(null);
  };

  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (
      (e.target as Element).closest("[data-dimension], [data-draft-dimension]")
    )
      return;
    if (e.button !== 0 && e.button !== 1) return;
    if ((s.tool === "line" || s.tool === "polyline") && !space.current) {
      const last = lastDraftClick.current;
      if (
        last &&
        e.timeStamp - last.time < 400 &&
        Math.hypot(e.clientX - last.x, e.clientY - last.y) < 4
      )
        return;
      lastDraftClick.current = {
        time: e.timeStamp,
        x: e.clientX,
        y: e.clientY,
      };
    }
    if (selectionDrag.active() || drag || guideDrag) return;
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    useEditor.setState({ gestureActive: true });
    const target = e.target as SVGElement;
    const guideId = target.closest<SVGElement>("[data-guide]")?.dataset.guide;
    if (guideId) {
      beginGuideDrag(guideId, e);
      return;
    }
    if (s.tool === "pan" || space.current || e.button === 1) {
      setDrag({
        pointer: e.pointerId,
        start: position(e),
        screen: { x: e.clientX, y: e.clientY },
        document: s.document,
        view,
        revision: s.revision,
      });
      return;
    }
    if (s.tool === "point") {
      const tolerance =
        (e.pointerType === "touch" ? s.touchRadiusPx : s.mouseRadiusPx) /
        view.scale;
      const resolution = resolveAt(position(e), modifiers(e));
      const chosen = resolution.chosen;
      if (chosen?.kind === "endpoint") {
        setCursorState({
          ...chosen,
          choices: resolution.choices,
          choiceIndex: resolution.choiceIndex,
        });
        return;
      }
      insertPointAt(
        chosen?.point ?? position(e),
        tolerance,
        chosen?.edgeId && chosen.t !== undefined
          ? { edgeId: chosen.edgeId, t: chosen.t }
          : undefined,
      );
      return;
    }
    const annotationId =
      target.closest<SVGElement>("[data-annotation]")?.dataset.annotation;
    if (
      !(s.tool === "select" && e.shiftKey) &&
      curveDrag.begin(target, position(e), e.pointerId)
    )
      return;
    if (s.tool === "select" || s.tool === "curve") {
      const pointId = target.dataset.point;
      const edgeId = target.dataset.edge;
      if (pointId && !(s.tool === "select" && e.shiftKey)) {
        dragAxis.current = null;
        lock.current = null;
        vertexMoved.current = false;
        lastMove.current = {
          point: position(e),
          pointer: e.pointerId,
          touch: e.pointerType === "touch",
          shift: e.shiftKey,
        };
        useEditor.setState({
          activePoint: pointId,
          selectedGuide: null,
        });
        setDrag({
          pointer: e.pointerId,
          pointId,
          start: position(e),
          screen: { x: e.clientX, y: e.clientY },
          document: s.document,
          view,
          revision: s.revision,
        });
        return;
      }
      if (s.tool === "select") {
        selectionDrag.begin(
          annotationId ??
            edgeId ??
            (e.shiftKey
              ? (target.dataset.handleEdge ??
                (pointId ? s.selected[0] : undefined))
              : undefined),
          position(e),
          e.pointerId,
          e.shiftKey,
          e.pointerType === "touch",
        );
        lastMove.current = {
          point: position(e),
          pointer: e.pointerId,
          touch: e.pointerType === "touch",
          shift: e.shiftKey,
        };
      } else {
        s.cancel();
        useEditor.setState({ selected: edgeId ? [edgeId] : [] });
      }
      return;
    }
    const resolution = resolveAt(position(e), modifiers(e));
    const point = resolution.chosen?.point ?? position(e);
    if (s.tool === "rectangle") {
      setDraft([point]);
      return;
    }
    if (!origin) {
      setDraft([point]);
      draftPress.current = {
        pointer: e.pointerId,
        start: position(e),
        index: 0,
        points: [point],
        commit: false,
        closed: false,
      };
      return;
    }
    if (exact !== "") {
      draftActions.exactLine.run();
      return;
    }
    if (distance(origin, point) < 1e-9) return;
    const closed =
      s.tool === "polyline" &&
      draft.length >= 3 &&
      distance(draft[0], point) <
        (e.pointerType === "touch" ? s.touchRadiusPx : s.mouseRadiusPx) /
          view.scale;
    const points = closed ? draft : [...draft, point];
    draftPress.current = {
      pointer: e.pointerId,
      start: position(e),
      index: closed ? 0 : points.length - 1,
      points,
      commit: s.tool === "line" || closed,
      closed,
    };
    if (!closed) setDraft(points);
  };

  const move = (e: CanvasPointer) => {
    const press = draftPress.current;
    if (
      press?.pointer === e.pointerId &&
      distance(position(e), press.start) * view.scale >= 3
    ) {
      const point = position(e);
      draftTangents.current.set(press.index, {
        x: point.x - press.start.x,
        y: point.y - press.start.y,
      });
      setDraft([...press.points]);
      return;
    }
    lastMove.current = {
      point: position(e),
      pointer: e.pointerId,
      touch: e.pointerType === "touch",
      shift: e.shiftKey,
    };
    if (guideDrag) {
      if (guideDrag.pointer !== e.pointerId) return;
      const point = position(e);
      const mm = guideDrag.axis === "x" ? point.x : point.y;
      if (Number.isFinite(mm) && Math.abs(mm) <= coordinateLimit)
        setGuideDrag({ ...guideDrag, positionMm: mm });
      setCursorState(freeSnap(point));
      return;
    }
    if (
      selectionDrag.move(position(e), e.pointerId, {
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      })
    ) {
      setCursorState(freeSnap(position(e)));
      setBypass(e.altKey);
      return;
    }
    if (curveDrag.move(position(e), e.pointerId, e.altKey)) {
      setCursorState(freeSnap(position(e)));
      return;
    }
    if (drag && drag.pointer === e.pointerId) {
      if (!drag.pointId) {
        setView({
          ...drag.view,
          x: drag.view.x + e.clientX - drag.screen.x,
          y: drag.view.y + e.clientY - drag.screen.y,
        });
        return;
      }
      if (
        !vertexMoved.current &&
        Math.hypot(e.clientX - drag.screen.x, e.clientY - drag.screen.y) < 3
      )
        return;
      vertexMoved.current = true;
      const point = position(e);
      dragAxis.current = movementAxis(
        dragAxis.current,
        { x: point.x - drag.start.x, y: point.y - drag.start.y },
        e.shiftKey,
      );
      const result = resolveVertexMovement(drag.document, drag.pointId, point, {
        ...movementOptionsFromState(
          view.scale,
          e.pointerType === "touch",
          e.altKey,
        ),
        axisLock: dragAxis.current,
        previousLock: lock.current,
      });
      lock.current = result.lock;
      applyMovementResolution(result, result.point);
      setBypass(e.altKey);
      useEditor.setState({
        preview: result.preview,
        previewIssue: result.issue,
      });
      return;
    }
    resolveAt(position(e), modifiers(e), {
      origin: origin,
    });
  };

  useAutoPan(
    svg,
    view,
    setView,
    (draft.length > 0 ||
      s.gestureActive ||
      selectionDrag.active() ||
      curveDrag.active()) &&
      s.tool !== "pan" &&
      !space.current &&
      !(drag && !drag.pointId) &&
      !guideDrag,
    move,
  );

  const up = (e: PointerEvent<SVGSVGElement>) => {
    const press = draftPress.current;
    if (press?.pointer === e.pointerId) {
      draftPress.current = null;
      const end = position(e);
      if (distance(end, press.start) * view.scale >= 3)
        draftTangents.current.set(press.index, {
          x: end.x - press.start.x,
          y: end.y - press.start.y,
        });
      if (press.commit) commitPath(press.points, press.closed);
    }
    finishGuideDrag(e);
    selectionDrag.finish(position(e), e.pointerId, {
      shiftKey: e.shiftKey,
      altKey: e.altKey,
    });
    curveDrag.finish(e.pointerId);
    if (drag?.pointer === e.pointerId && drag.pointId) {
      const state = useEditor.getState();
      if (state.preview && state.previewIssue) {
        state.cancel();
        notifications.show({
          color: "red",
          message: `Move cancelled. ${state.previewIssue}`,
        });
      } else if (state.preview) {
        try {
          state.commit(state.preview);
        } catch {
          state.cancel();
          notifications.show({
            color: "red",
            message:
              "This move would collapse an adjacent line. Move cancelled.",
          });
        }
      }
    }
    setDrag(null);
    dragAxis.current = null;
    vertexMoved.current = false;
    lastMove.current = null;
    useEditor.setState({ gestureActive: false });
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const fit = () => {
    const rect = svg.current?.getBoundingClientRect();
    if (rect) setView(fitView(s.document, rect.width, rect.height));
  };
  const statusKind = cursor.kind
    ? cursor.label || snapKindLabel(cursor.kind)
    : "";
  const guideStatus = guideDrag
    ? `Moving guide · ${guideDrag.axis} = ${guideDrag.positionMm.toFixed(3)} mm`
    : "";
  const movementStatus = selectionDrag.active()
    ? [
        selectionDrag.info?.label,
        selectionDrag.axis === "x"
          ? "X-only"
          : selectionDrag.axis === "y"
            ? "Y-only"
            : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const snapStatus = bypass
    ? "Snapping temporarily off"
    : !s.snap
      ? "Snap off"
      : statusKind || (cursor.kind === "grid" ? "Grid" : "No snap");
  const activeStatus =
    guideStatus ||
    movementStatus ||
    (selectionDrag.active() ? "Moving" : snapStatus);
  const choices = cursor.choices ?? [];

  return (
    <div className="workspace">
      <Group className="workspace-controls" gap="xs" p="xs">
        <Button
          variant="default"
          {...commandProps(commands.fit.bind({ execute: fit }))}
        >
          {commands.fit.label}
        </Button>
        <Button
          variant="default"
          {...commandProps(
            commands.resetView.bind({
              execute: () => setView({ x: 40, y: 40, scale: 2 }),
            }),
          )}
        >
          {commands.resetView.label}
        </Button>
        <Text size="xs">{Math.round((view.scale / 2) * 100)}%</Text>
        <SnapSettings />
        <Button
          size="compact-sm"
          variant={editGuides ? "light" : "default"}
          aria-pressed={editGuides}
          onClick={() => setEditGuides((active) => !active)}
        >
          Edit guides
        </Button>
        {draft.length > 0 && (
          <Button variant="subtle" {...commandProps(commands.cancel.bind())}>
            {commands.cancel.label}
          </Button>
        )}
        {s.tool === "polyline" && draft.length > 1 && (
          <Button {...commandProps(draftActions.finish)}>
            {draftActions.finish.label}
          </Button>
        )}
        {choices.length > 1 && (
          <Menu withinPortal position="bottom-start">
            <Menu.Target>
              <Button size="compact-sm" variant="light">
                Choose target {(cursor.choiceIndex ?? 0) + 1}/{choices.length}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {choices.map((candidate, index) => (
                <Menu.Item
                  key={candidate.targetId}
                  onClick={() => chooseTarget(index)}
                >
                  {candidateLabel(candidate)}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      {origin && (
        <DraftPrecision
          tool={s.tool}
          units={doc.unitsDisplay}
          exact={exact}
          degrees={degrees}
          width={width}
          height={height}
          exactError={exactError}
          rectangleError={rectangleError}
          setExact={setExact}
          setDegrees={setDegrees}
          setWidth={setWidth}
          setHeight={setHeight}
          exactField={exactField}
          exactLine={draftActions.exactLine}
          rectangle={draftActions.rectangle}
          onCancel={() => {
            s.cancel();
            svg.current?.focus();
          }}
          onConfirm={() => svg.current?.focus()}
        />
      )}
      {placement.dialog}
      {annotations.dialog}
      <MoveDialog />
      <EdgeLengthDialog />
      {division && division.cancelVersion === s.cancelVersion && (
        <DivisionDialog
          session={division}
          onClose={() => {
            setDivision(null);
            s.cancel();
          }}
        />
      )}
      <CanvasContextMenu
        position={position}
        scale={view.scale}
        onExact={placement.open}
        onDivide={(edgeId, mode) => {
          s.cancel();
          const state = useEditor.getState();
          useEditor.setState({ selected: [edgeId] });
          setDivision({
            base: state.document,
            revision: state.revision,
            cancelVersion: state.cancelVersion,
            edgeId,
            mode,
          });
        }}
        onAddMark={annotations.add}
        onEditMark={annotations.edit}
        cursor={cursor.point}
      >
        <div className="canvas-area" ref={canvas}>
          <svg
            ref={svg}
            className={`drafting-surface tool-${s.tool}`}
            tabIndex={0}
            aria-label="Pattern drafting workspace"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => abortGesture()}
            onLostPointerCapture={() => {
              if (
                selectionDrag.active() ||
                curveDrag.active() ||
                drag ||
                guideDrag
              )
                abortGesture();
            }}
            onDoubleClick={(e) => {
              if (s.tool === "polyline") {
                if (draft.length > 1) commitPath(draft);
                return;
              }
              if (s.tool === "line") return;
              const markId = (e.target as SVGElement).closest<SVGElement>(
                "[data-annotation]",
              )?.dataset.annotation;
              if (s.tool === "select" && markId) {
                annotations.edit(markId);
                return;
              }
              const id = (e.target as SVGElement).dataset.edge;
              if (s.tool === "select" && id) {
                const edge = s.document.segments[id];
                const t = segmentProjection(s.document, edge, position(e));
                if (t > 0 && t < 1)
                  s.commit(splitLine(s.document, id, t, createId));
              }
            }}
            onWheel={(e) => {
              const rect = e.currentTarget.getBoundingClientRect(),
                p = position(e),
                scale = Math.min(
                  20,
                  Math.max(0.1, view.scale * Math.exp(-e.deltaY * 0.001)),
                );
              setView({
                scale,
                x: e.clientX - rect.left - p.x * scale,
                y: e.clientY - rect.top - p.y * scale,
              });
            }}
          >
            <defs>
              <pattern
                id="grid-minor"
                width={s.gridSpacingMm * view.scale}
                height={s.gridSpacingMm * view.scale}
                x={view.x}
                y={view.y}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${s.gridSpacingMm * view.scale} 0 L 0 0 0 ${
                    s.gridSpacingMm * view.scale
                  }`}
                  className="grid-line grid-minor"
                  fill="none"
                />
              </pattern>
              <pattern
                id="grid-major"
                width={s.gridSpacingMm * s.gridMajorEvery * view.scale}
                height={s.gridSpacingMm * s.gridMajorEvery * view.scale}
                x={view.x}
                y={view.y}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${s.gridSpacingMm * s.gridMajorEvery * view.scale} 0 L 0 0 0 ${
                    s.gridSpacingMm * s.gridMajorEvery * view.scale
                  }`}
                  className="grid-line grid-major"
                  fill="none"
                />
              </pattern>
            </defs>
            {s.grid && s.gridSpacingMm * view.scale >= 4 && (
              <rect width="100%" height="100%" fill="url(#grid-minor)" />
            )}
            {s.grid && s.gridSpacingMm * s.gridMajorEvery * view.scale >= 4 && (
              <rect width="100%" height="100%" fill="url(#grid-major)" />
            )}
            {s.showGuides && (
              <GuideOverlay
                doc={doc}
                view={view}
                selectedGuide={s.selectedGuide}
                interactive={
                  editGuides ? "all" : s.selectedGuide ? "selected" : "none"
                }
                preview={
                  guideDrag
                    ? { axis: guideDrag.axis, positionMm: guideDrag.positionMm }
                    : null
                }
              />
            )}
            <g
              transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
            >
              {placement.overlay}
              <g className={s.previewIssue ? "invalid-preview" : undefined}>
                <SvgGeometry
                  doc={doc}
                  selectedIds={s.selected}
                  scale={view.scale}
                  showPoints={s.tool === "point"}
                  activePoint={s.activePoint}
                  interactivePoints={s.tool === "select" || s.tool === "curve"}
                  showHandles={s.tool === "curve"}
                />
                <SvgAnnotations
                  doc={doc}
                  selected={s.selected}
                  scale={view.scale}
                />
              </g>
              <DraftOverlay
                tangents={draftTangents.current}
                draft={draft}
                end={draftEnd}
                rectangle={s.tool === "rectangle" ? rectangleSize : undefined}
                scale={view.scale}
                units={doc.unitsDisplay}
                focusExact={() => focusExact()}
              />
              <DimensionOverlay
                base={s.document}
                doc={doc}
                selected={s.selected}
                scale={view.scale}
                movingPoint={drag?.pointId}
                endpointDoc={
                  division?.cancelVersion === s.cancelVersion ? s.document : doc
                }
                onEdit={openLengthEditor}
              />
              {s.tool === "point" && (
                <SplitHover
                  doc={s.document}
                  edgeId={cursor.edgeId}
                  t={cursor.t}
                  scale={view.scale}
                  onEdit={() =>
                    placement.open(cursor.point, 9 / view.scale, cursor.edgeId)
                  }
                />
              )}

              {!exactPoint && <SnapOverlay snap={cursor} scale={view.scale} />}
              {selectionDrag.overlay}
            </g>
          </svg>
          {s.showRulers && (
            <Rulers
              view={view}
              units={doc.unitsDisplay}
              width={size.width}
              height={size.height}
              container={canvas}
              onCreate={(axis, positionMm) => {
                try {
                  createGuide(axis, positionMm);
                  setEditGuides(true);
                } catch (error) {
                  notifications.show({
                    color: "red",
                    message: (error as Error).message,
                  });
                }
              }}
            />
          )}
          {editGuides && (
            <div className="guide-mode-badge">
              Guide editing · click a guide to select and drag
            </div>
          )}
        </div>
      </CanvasContextMenu>
      {s.tool === "point" && (
        <Group p="xs" gap="xs">
          <Text size="xs">
            Use Point at exact distance in the edge menu, or the button below.
          </Text>
          <Button
            variant="default"
            {...commandProps(
              commands.exactPoint.bind({
                execute: () => placement.open(cursor.point, 22 / view.scale),
              }),
            )}
          >
            {commands.exactPoint.label}
          </Button>
        </Group>
      )}
      <Text className="coordinate-bar" size="xs" px="xs">
        X {formatLength(cursor.point.x, doc.unitsDisplay)} · Y{" "}
        {formatLength(cursor.point.y, doc.unitsDisplay)} · {activeStatus}
        {choices.length > 1
          ? ` · ${(cursor.choiceIndex ?? 0) + 1} of ${choices.length} · Tab cycles`
          : ""}
        {s.previewIssue && (
          <Text span c="red" inherit>
            {" "}
            · {s.previewIssue}
          </Text>
        )}
      </Text>
    </div>
  );
}
