import { SvgAnnotations } from "./SvgAnnotations";
import { useAnnotationEditor } from "./useAnnotationEditor";
import { fitView } from "./fitView";
import { useSelectionDrag } from "./useSelectionDrag";
import { SnapOverlay } from "./SnapOverlay";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { useCurveDrag } from "./useCurveDrag";
import { moveVertex } from "../document/curves";
import { segmentProjection } from "../document/segments";
import { resolvePointer } from "./resolvePointer";
import { usePointPlacement } from "./usePointPlacement";
import { insertPointAt } from "./pointTool";
import { createId } from "./ids";
import { SvgGeometry } from "./SvgGeometry";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button, Group, NumberInput, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEditor } from "./store";
import { addPath, splitLine } from "../document/operations";
import { angle, distance, type Vec2 } from "../geometry/line";
import { type Snap } from "../geometry/snapping";
import {
  formatLength,
  unitFactor,
  type PatternDocument,
} from "../document/schema";
import { commands, dispatchShortcut, toolCommands } from "./commands";
import { bindDraftCommands } from "./draftCommands";
import { commandProps } from "../ui/CommandControls";
type Drag = {
  pointer: number;
  pointId?: string;
  start: Vec2;
  screen: Vec2;
  document: PatternDocument;
  view: { x: number; y: number; scale: number };
};
export function EditorViewport() {
  const s = useEditor();
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 40, y: 40, scale: 2 });
  const curveDrag = useCurveDrag();
  const annotations = useAnnotationEditor();
  const placement = usePointPlacement(view.scale);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [cursor, setCursor] = useState<Snap>({
    point: { x: 0, y: 0 },
    label: "",
  });
  const selectionDrag = useSelectionDrag(view.scale, cursor.point);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [exact, setExact] = useState<string | number>("");
  const [degrees, setDegrees] = useState<string | number>(0);
  const [width, setWidth] = useState<string | number>(18);
  const [height, setHeight] = useState<string | number>(24);
  const space = useRef(false);
  const doc = s.preview ?? s.document;
  const origin = draft.at(-1);
  const factor = unitFactor[doc.unitsDisplay];
  const reset = () => {
    setDraft([]);
    setDrag(null);
    setExact("");
    setCursor((previous) => ({ point: previous.point, label: "" }));
  };
  useEffect(() => {
    reset();
  }, [s.cancelVersion, s.tool]);
  useEffect(() => {
    useEditor.setState({ hasDraft: draft.length > 0 });
  }, [draft.length]);
  const commitPath = (points: Vec2[], closed = false) => {
    try {
      s.commit(addPath(s.document, points, closed, createId));
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
    setDraft,
    clearExact: () => setExact(""),
  });
  const escape = commands.escape.bind({
    execute: () => {
      const active =
        draft.length > 0 || drag || selectionDrag.active() || s.preview;
      commands.cancel.bind().run();
      if (!active)
        toolCommands.find((command) => command.id === "select")!.run();
    },
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const transient = draft.length > 0 || !!drag || selectionDrag.active();
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
                      execute: () =>
                        document.getElementById("line-length")?.focus(),
                    }),
              ]
            : []),
      ];
      if (dispatchShortcut(e, local)) e.stopImmediatePropagation();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    const blur = () => {
      space.current = false;
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
  const position = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.x) / view.scale,
      y: (e.clientY - rect.top - view.y) / view.scale,
    };
  };
  const resolve = (e: PointerEvent<SVGSVGElement>) =>
    resolvePointer(s.document, position(e), {
      tool: s.tool,
      scale: view.scale,
      touch: e.pointerType === "touch",
      origin: drag?.pointId ? undefined : origin,
      movingPoint: drag?.pointId,
      panning: space.current || !!(drag && !drag.pointId),
      snap: s.snap,
      grid: s.grid,
      bypass: e.altKey,
      constrain: e.shiftKey,
    });
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (selectionDrag.active() || drag) return;
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (s.tool === "pan" || space.current || e.button === 1) {
      setDrag({
        pointer: e.pointerId,
        start: position(e),
        screen: { x: e.clientX, y: e.clientY },
        document: s.document,
        view,
      });
      return;
    }
    if (s.tool === "point") {
      const next = resolve(e);
      if (next.label === "Endpoint" || next.label === "Existing point") {
        setCursor(next);
        return;
      }
      insertPointAt(
        next.point,
        (e.pointerType === "touch" ? 16 : 8) / view.scale,
        next.edgeId && next.t !== undefined
          ? { edgeId: next.edgeId, t: next.t }
          : undefined,
      );
      setCursor(next);
      return;
    }
    const target = e.target as SVGElement;
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
        setDrag({
          pointer: e.pointerId,
          pointId,
          start: position(e),
          screen: { x: e.clientX, y: e.clientY },
          document: s.document,
          view,
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
        );
      } else {
        s.cancel();
        useEditor.setState({ selected: edgeId ? [edgeId] : [] });
      }
      return;
    }
    const next = resolve(e);
    setCursor(next);
    if (s.tool === "rectangle") {
      setDraft([next.point]);
      return;
    }
    if (!origin) {
      setDraft([next.point]);
      return;
    }
    if (distance(origin, next.point) < 1e-9) return;
    if (s.tool === "line") commitPath([origin, next.point]);
    else if (
      draft.length >= 3 &&
      distance(draft[0], next.point) < 8 / view.scale
    )
      commitPath(draft, true);
    else setDraft([...draft, next.point]);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (selectionDrag.move(position(e), e.pointerId)) {
      setCursor({ point: position(e), label: "" });
      return;
    }
    if (curveDrag.move(position(e), e.pointerId)) return;
    const next = resolve(e);
    setCursor(next);
    if (!drag || drag.pointer !== e.pointerId) return;
    if (drag.pointId)
      useEditor.setState({
        preview: moveVertex(drag.document, drag.pointId, next.point),
      });
    else
      setView({
        ...drag.view,
        x: drag.view.x + e.clientX - drag.screen.x,
        y: drag.view.y + e.clientY - drag.screen.y,
      });
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    selectionDrag.finish(position(e), e.pointerId);
    curveDrag.finish(e.pointerId);
    if (drag?.pointer === e.pointerId && drag.pointId && s.preview) {
      try {
        s.commit(s.preview);
      } catch {
        s.cancel();
        notifications.show({
          color: "red",
          message: "This move would collapse an adjacent line. Move cancelled.",
        });
      }
    }
    setDrag(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const fit = () => {
    const rect = svg.current?.getBoundingClientRect();
    if (rect) setView(fitView(s.document, rect.width, rect.height));
  };
  const label = (a: Vec2, b: Vec2) =>
    `${formatLength(distance(a, b), doc.unitsDisplay)} · ${angle(a, b).toFixed(1)}°`;
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
      </Group>
      {origin && (s.tool === "line" || s.tool === "polyline") && (
        <Group p="xs" gap="xs" className="precision-bar">
          <NumberInput
            label={`Exact length (${doc.unitsDisplay})`}
            value={exact}
            onChange={setExact}
            w={150}
          />
          <NumberInput
            label="Angle (degrees)"
            value={degrees}
            onChange={setDegrees}
            w={140}
          />
          <Button {...commandProps(draftActions.exactLine)}>
            {draftActions.exactLine.label}
          </Button>
        </Group>
      )}
      {origin && s.tool === "rectangle" && (
        <Group p="xs" gap="xs" className="precision-bar">
          <NumberInput
            label={`Width (${doc.unitsDisplay})`}
            value={width}
            onChange={setWidth}
            w={130}
          />
          <NumberInput
            label={`Height (${doc.unitsDisplay})`}
            value={height}
            onChange={setHeight}
            w={130}
          />
          <Button {...commandProps(draftActions.rectangle)}>
            {draftActions.rectangle.label}
          </Button>
        </Group>
      )}
      {placement.dialog}
      {annotations.dialog}
      <CanvasContextMenu
        position={position}
        scale={view.scale}
        onExact={placement.open}
        onAddMark={annotations.add}
        onEditMark={annotations.edit}
        cursor={cursor.point}
      >
        <svg
          ref={svg}
          className={`drafting-surface tool-${s.tool}`}
          tabIndex={0}
          aria-label="Pattern drafting workspace"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => s.cancel()}
          onLostPointerCapture={() => {
            if (selectionDrag.active()) s.cancel();
          }}
          onDoubleClick={(e) => {
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
              id="grid"
              width={10 * view.scale}
              height={10 * view.scale}
              x={view.x}
              y={view.y}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${10 * view.scale} 0 L 0 0 0 ${10 * view.scale}`}
                className="grid-line"
                fill="none"
              />
            </pattern>
          </defs>
          {s.grid && <rect width="100%" height="100%" fill="url(#grid)" />}
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            {placement.overlay}
            <SvgGeometry
              doc={doc}
              selectedIds={s.selected}
              scale={view.scale}
              showPoints={s.tool === "point"}
              showHandles={s.tool === "curve"}
            />
            <SvgAnnotations
              doc={doc}
              selected={s.selected}
              scale={view.scale}
            />
            {origin &&
              s.tool === "rectangle" &&
              typeof width === "number" &&
              typeof height === "number" &&
              width > 0 &&
              height > 0 && (
                <rect
                  x={origin.x}
                  y={origin.y}
                  width={width * factor}
                  height={height * factor}
                  className="draft-line"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            {draft.length > 0 && (
              <polyline
                points={[
                  ...draft,
                  ...(s.tool === "rectangle" ? [] : [cursor.point]),
                ]
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                className="draft-line"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {origin && s.tool !== "rectangle" && (
              <text
                x={cursor.point.x + 12 / view.scale}
                y={cursor.point.y - 12 / view.scale}
                fontSize={12 / view.scale}
                className="measurement"
              >
                {label(origin, cursor.point)}
              </text>
            )}
            <SnapOverlay snap={cursor} scale={view.scale} />
            {selectionDrag.overlay}
          </g>
        </svg>
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
        {formatLength(cursor.point.y, doc.unitsDisplay)} ·{" "}
        {cursor.label || "No snap"} · Alt bypasses snapping
      </Text>
    </div>
  );
}
