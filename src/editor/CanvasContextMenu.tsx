import {
  cloneElement,
  useState,
  useRef,
  type ReactElement,
  type SVGProps,
} from "react";
import { Button, Group, Menu, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Vec2 } from "../geometry/line";
import type { AnnotationKind } from "../document/annotationSchema";
import { segmentPoint } from "../document/segments";
import { EdgeMenuItems } from "../ui/EdgeMenuItems";
import { MarkMenuItems } from "../ui/MarkMenuItems";
import { LengthEditor } from "../ui/Inspector";
import { DraggableModal } from "../ui/DraggableModal";
import { executeEdgeActions, type EdgeAction } from "./edgeActions";
import { deleteSelection } from "./selectionActions";
import { contextSelection } from "./selection";
import { contextTarget, type ContextHit } from "./contextTarget";
import { useEditor } from "./store";
type Target = ContextHit & {
  point: Vec2;
  revision: number;
  cancelVersion: number;
};
export function CanvasContextMenu({
  children,
  position,
  scale,
  onExact,
  onAddMark,
  onEditMark,
  cursor,
}: {
  children: ReactElement<SVGProps<SVGSVGElement>>;
  position: (event: { clientX: number; clientY: number }) => Vec2;
  scale: number;
  onExact: (point: Vec2, tolerance: number, edgeId?: string) => void;
  onAddMark: (kind: AnnotationKind, point: Vec2) => void;
  onEditMark: (id: string) => void;
  cursor: Vec2;
}) {
  const s = useEditor();
  const touchPoint = useRef<Vec2 | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [opened, setOpened] = useState(false);
  const [lengthTarget, setLengthTarget] = useState<Target | null>(null);
  const valid =
    target &&
    target.revision === s.revision &&
    target.cancelVersion === s.cancelVersion;
  const edge =
    valid && target.kind === "edge"
      ? s.document.segments[target.id]
      : undefined;
  const selectedEdge = s.selected
    .map((id) => s.document.segments[id])
    .find(Boolean);
  const selectedMark =
    s.selected.length === 1 ? s.document.annotations[s.selected[0]] : undefined;
  const curved = s.selected.some(
    (id) => s.document.segments[id]?.kind === "cubic",
  );
  const activate = (hit: ContextHit, point: Vec2): Target => {
    s.cancel();
    if (hit.kind !== "empty")
      useEditor.setState({ selected: contextSelection(s.selected, hit.id) });
    const state = useEditor.getState();
    const next = {
      ...hit,
      point,
      revision: state.revision,
      cancelVersion: state.cancelVersion,
    };
    setTarget(next);
    return next;
  };
  const action = (id: string, kind: EdgeAction) => {
    try {
      const ids = contextSelection(useEditor.getState().selected, id);
      if (kind === "delete") deleteSelection(ids);
      else {
        const message = executeEdgeActions(
          ids.filter((key) => !!s.document.segments[key]),
          kind,
        );
        useEditor.setState({
          selected: ids.filter(
            (key) =>
              !!useEditor.getState().document.segments[key] ||
              !!useEditor.getState().document.annotations[key],
          ),
        });
        if (message) notifications.show({ message });
      }
    } catch (e) {
      notifications.show({ color: "red", message: (e as Error).message });
    }
    setOpened(false);
  };
  const exact = (point: Vec2, id: string) => {
    setOpened(false);
    onExact(point, 9 / scale, id);
  };
  const add = (kind: AnnotationKind, point: Vec2) => {
    setOpened(false);
    onAddMark(kind, point);
  };
  const edit = (id: string) => {
    setOpened(false);
    onEditMark(id);
  };
  const closeLength = () => {
    s.cancel();
    setLengthTarget(null);
  };
  const lengthValid =
    lengthTarget?.kind === "edge" &&
    s.document.segments[lengthTarget.id]?.kind === "line" &&
    s.selected.length === 1 &&
    s.selected[0] === lengthTarget.id &&
    s.cancelVersion === lengthTarget.cancelVersion;
  return (
    <>
      <Menu
        opened={opened && !!valid}
        onChange={(value) => {
          if (value && touchPoint.current) {
            const point = touchPoint.current;
            touchPoint.current = null;
            activate(
              contextTarget(useEditor.getState().document, point, 22 / scale),
              point,
            );
          }
          setOpened(value);
        }}
        width={280}
        position="bottom-start"
        trapFocus
        returnFocus={false}
      >
        <Menu.ContextMenu>
          {cloneElement(children, {
            onTouchStart: (event) => {
              const touch = event.touches[0];
              if (touch) touchPoint.current = position(touch);
            },
            onTouchCancel: () => {
              touchPoint.current = null;
            },
            onContextMenu: (event) => {
              touchPoint.current = null;
              const point = position(event),
                element = event.target as SVGElement;
              activate(
                contextTarget(
                  useEditor.getState().document,
                  point,
                  12 / scale,
                  {
                    edge: element.dataset.edge ?? element.dataset.handleEdge,
                    annotation:
                      element.closest<SVGElement>("[data-annotation]")?.dataset
                        .annotation,
                  },
                ),
                point,
              );
            },
          })}
        </Menu.ContextMenu>
        <Menu.Dropdown>
          {edge && target?.kind === "edge" && (
            <EdgeMenuItems
              curved={curved}
              count={s.selected.length}
              onAction={(kind) => action(target.id, kind)}
              onLength={() => {
                setOpened(false);
                setLengthTarget(target);
              }}
              onPoint={() => exact(target.point, target.id)}
            />
          )}
          {target?.kind === "annotation" && (
            <>
              <Menu.Label>Pattern mark</Menu.Label>
              <Menu.Item
                leftSection={<Pencil size={16} />}
                onClick={() => edit(target.id)}
              >
                Edit mark…
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<Trash2 size={16} />}
                onClick={() => action(target.id, "delete")}
              >
                Delete {s.selected.length > 1 ? "selection" : "mark"}
              </Menu.Item>
            </>
          )}
          {target?.kind === "empty" && (
            <MarkMenuItems onAdd={(kind) => add(kind, target.point)} />
          )}
        </Menu.Dropdown>
      </Menu>
      <Group p="xs" gap="xs">
        <Menu width={280} position="top-start" trapFocus>
          <Menu.Target>
            <Button
              variant="default"
              disabled={!selectedEdge}
              leftSection={<MoreHorizontal size={16} />}
            >
              Edge actions
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {selectedEdge && (
              <EdgeMenuItems
                curved={curved}
                count={s.selected.length}
                onAction={(kind) => {
                  s.cancel();
                  action(selectedEdge.id, kind);
                }}
                onLength={() =>
                  setLengthTarget(
                    activate(
                      { kind: "edge", id: selectedEdge.id },
                      segmentPoint(s.document, selectedEdge, 0.5),
                    ),
                  )
                }
                onPoint={() => {
                  const p = segmentPoint(s.document, selectedEdge, 0.5);
                  activate({ kind: "edge", id: selectedEdge.id }, p);
                  exact(p, selectedEdge.id);
                }}
              />
            )}
          </Menu.Dropdown>
        </Menu>
        <Menu width={280} position="top-start" trapFocus>
          <Menu.Target>
            <Button variant="default">Marks</Button>
          </Menu.Target>
          <Menu.Dropdown>
            {selectedMark && (
              <>
                <Menu.Item
                  leftSection={<Pencil size={16} />}
                  onClick={() => edit(selectedMark.id)}
                >
                  Edit selected mark…
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<Trash2 size={16} />}
                  onClick={() => action(selectedMark.id, "delete")}
                >
                  Delete selected mark
                </Menu.Item>
                <Menu.Divider />
              </>
            )}
            <MarkMenuItems onAdd={(kind) => add(kind, cursor)} />
          </Menu.Dropdown>
        </Menu>
        <Text size="xs" c="dimmed">
          {s.selected.length > 1
            ? `${s.selected.length} items selected.`
            : "Right-click empty space to add text or pattern marks."}
        </Text>
      </Group>
      {lengthValid && (
        <DraggableModal title="Change line length" onClose={closeLength}>
          <LengthEditor
            key={`${lengthTarget.id}-${s.revision}`}
            lengthOnly
            onApplied={closeLength}
          />
        </DraggableModal>
      )}
    </>
  );
}
