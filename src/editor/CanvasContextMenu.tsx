import { distance } from "../geometry/line";
import type { DivisionMode } from "../document/divisions";
import {
  cloneElement,
  useState,
  useRef,
  type ReactElement,
  type SVGProps,
} from "react";
import { Button, Group, Menu, Text } from "@mantine/core";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { Vec2 } from "../geometry/line";
import type { AnnotationKind } from "../document/annotationSchema";
import { segmentPoint } from "../document/segments";
import { EdgeMenuItems } from "../ui/EdgeMenuItems";
import { MarkMenuItems } from "../ui/MarkMenuItems";
import { openLengthEditor } from "../ui/EdgeLengthDialog";
import { commands } from "./commands";
import type { BoundCommand } from "./command";
import { CommandMenuItem, notifyCommand } from "../ui/CommandControls";
import { contextSelection } from "./selection";
import { expandPieceSelection } from "../document/pieces";
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
  onDivide,
}: {
  children: ReactElement<SVGProps<SVGSVGElement>>;
  position: (event: { clientX: number; clientY: number }) => Vec2;
  scale: number;
  onExact: (point: Vec2, tolerance: number, edgeId?: string) => void;
  onAddMark: (kind: AnnotationKind, point: Vec2) => void;
  onEditMark: (id: string) => void;
  cursor: Vec2;
  onDivide: (id: string, mode: DivisionMode) => void;
}) {
  const s = useEditor();
  const touchPoint = useRef<Vec2 | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [opened, setOpened] = useState(false);
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
    if (hit.kind !== "empty") {
      const nextSelection = contextSelection(s.selected, hit.id);
      useEditor.setState({
        selected:
          hit.kind === "edge"
            ? expandPieceSelection(s.document, nextSelection)
            : nextSelection,
      });
    }
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
  const report = (command: BoundCommand): BoundCommand => ({
    ...command,
    run: () => {
      notifyCommand(command).run();
      setOpened(false);
    },
  });
  const edgeCommands = (target: Target & { id: string }) => ({
    length: commands.changeLength.bind({
      enabled: () => {
        const state = useEditor.getState();
        return (
          state.selected.length === 1 &&
          state.document.segments[target.id]?.kind === "line"
        );
      },
      execute: () => {
        setOpened(false);
        openLengthEditor(target.id);
      },
    }),
    point: commands.exactPoint.bind({
      enabled: () => useEditor.getState().selected.length === 1,
      execute: () => {
        activate({ kind: "edge", id: target.id }, target.point);
        exact(target.point, target.id);
      },
    }),
    divide: (mode: DivisionMode) =>
      commands.divide.bind({
        enabled: () => useEditor.getState().selected.length === 1,
        execute: () => {
          setOpened(false);
          onDivide(target.id, mode);
        },
      }),
    intersections: report(commands.intersections.bind()),
    piece: report(commands.createPiece.bind(target.id)),
    curve: report(commands.curve.bind()),
    reset: report(commands.reset.bind()),
    delete: report(commands.delete.bind()),
  });
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
            <Menu.Item
              onClick={() => {
                useEditor.setState({
                  activePoint:
                    distance(target.point, s.document.points[edge.from]) <=
                    distance(target.point, s.document.points[edge.to])
                      ? edge.from
                      : edge.to,
                });
                report(commands.pointMode.bind("smooth")).run();
              }}
            >
              Smooth point
            </Menu.Item>
          )}
          {edge && target?.kind === "edge" && (
            <EdgeMenuItems
              curved={curved}
              count={s.selected.length}
              actions={edgeCommands(target)}
            />
          )}
          {edge && target?.kind === "edge" && (
            <CommandMenuItem command={edgeCommands(target).piece} />
          )}
          {target?.kind === "annotation" && (
            <>
              <Menu.Label>Pattern mark</Menu.Label>
              <CommandMenuItem
                command={commands.editMark.bind({
                  execute: () => edit(target.id),
                })}
                leftSection={<Pencil size={16} />}
              />
              <CommandMenuItem
                command={report(commands.delete.bind())}
                color="red"
                leftSection={<Trash2 size={16} />}
              />
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
              <>
                <EdgeMenuItems
                  curved={curved}
                  count={s.selected.length}
                  actions={edgeCommands({
                    kind: "edge",
                    id: selectedEdge.id,
                    point: segmentPoint(s.document, selectedEdge, 0.5),
                    revision: s.revision,
                    cancelVersion: s.cancelVersion,
                  })}
                />
                <CommandMenuItem
                  command={commands.createPiece.bind(selectedEdge.id)}
                />
              </>
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
                <CommandMenuItem
                  command={commands.editMark.bind({
                    execute: () => edit(selectedMark.id),
                  })}
                  leftSection={<Pencil size={16} />}
                />
                <CommandMenuItem
                  command={report(commands.delete.bind())}
                  color="red"
                  leftSection={<Trash2 size={16} />}
                />
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
    </>
  );
}
