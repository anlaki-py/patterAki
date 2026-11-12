import { useState } from "react";
import {
  Accordion,
  Button,
  Checkbox,
  Group,
  Menu,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useEditor } from "../editor/store";
import type { PatternPiece } from "../document/schema";
import {
  edgeRoleSchema,
  internalRoleSchema,
  emptySewing,
} from "../document/sewingSchema";
import { edgeAllowance, updateSewing } from "../document/sewing";
import { commands } from "../editor/commands";
import { downloadSvg } from "../export/download";
import { exportSewingSvg } from "../export/svg";
import {
  newSewingSession,
  SewingEditor,
  type SewingSession,
} from "./SewingEditor";
export function SewingProperties({ piece }: { piece: PatternPiece }) {
  const state = useEditor(),
    s = piece.sewing ?? emptySewing();
  const [edgeChoice, setEdge] = useState(piece.stitchingOutline[0].segmentId),
    [session, setSession] = useState<SewingSession | null>(null),
    [error, setError] = useState("");
  const [metadata, setMetadata] = useState(true),
    [marks, setMarks] = useState(true),
    [internal, setInternal] = useState(true);
  const edgeId = piece.stitchingOutline.some((r) => r.segmentId === edgeChoice)
    ? edgeChoice
    : piece.stitchingOutline[0].segmentId;
  const available =
    !piece.locked &&
    piece.visible &&
    !state.preview &&
    !state.hasDraft &&
    !state.gestureActive;
  const run = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const edit = (kind: SewingSession["kind"], id?: string) =>
    setSession(newSewingSession(state.document, piece.id, kind, edgeId, id));
  const change = (fn: Parameters<typeof updateSewing>[2]) =>
    run(() =>
      commands.updateSewing.bind({ pieceId: piece.id, change: fn }).run(),
    );
  const selectedMark =
    state.selected.length === 1
      ? state.document.annotations[state.selected[0]]
      : undefined;
  return (
    <>
      <Accordion>
        <Accordion.Item value="sewing">
          <Accordion.Control>Sewing roles and marks</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="xs">
                The source loop is the stitch outline. Cut offsets derive from
                Seam allowance settings. Fold edges default to 0 mm allowance.
              </Text>
              <Select
                label="Sewing edge"
                value={edgeId}
                onChange={(v) => v && setEdge(v)}
                data={piece.stitchingOutline.map((ref, i) => ({
                  value: ref.segmentId,
                  label: `Edge ${i + 1} · ${ref.segmentId}`,
                }))}
              />
              <Select
                label="Edge role"
                disabled={!available}
                value={s.edges[edgeId]?.role ?? "seam"}
                data={edgeRoleSchema.options.map((value) => ({
                  value,
                  label:
                    value === "fold"
                      ? "On fold"
                      : value === "seam"
                        ? "Seam / stitch"
                        : value,
                }))}
                onChange={(v) => {
                  const role = edgeRoleSchema.parse(v);
                  change((s) => {
                    s.edges[edgeId] = { role };
                    return s;
                  });
                }}
              />
              {s.edges[edgeId]?.role === "fold" && (
                <Text size="xs">
                  Default fold allowance: {edgeAllowance(piece, edgeId, 10)} mm
                </Text>
              )}
              <Group grow>
                <Button disabled={!available} onClick={() => edit("notch")}>
                  Add notch
                </Button>
                <Button disabled={!available} onClick={() => edit("dart")}>
                  Add dart
                </Button>
              </Group>
              <Stack gap="xs">
                <Button disabled={!available} onClick={() => edit("grainline")}>
                  Add attached grainline
                </Button>
                <Button disabled={!available} onClick={() => edit("fold")}>
                  Add attached fold mark
                </Button>
              </Stack>
              {selectedMark &&
                (selectedMark.kind === "grainline" ||
                  selectedMark.kind === "fold") && (
                  <Button
                    disabled={!available}
                    onClick={() =>
                      run(() => {
                        commands.attachSewingAnnotation
                          .bind({
                            pieceId: piece.id,
                            annotationId: selectedMark.id,
                            edgeId:
                              selectedMark.kind === "fold" ? edgeId : undefined,
                          })
                          .run();
                      })
                    }
                  >
                    Attach selected legacy mark
                  </Button>
                )}
              {[
                ...s.notches.map((n) => ({
                  id: n.id,
                  kind: "notch" as const,
                  label: `${n.style} notch · ${(n.fraction * 100).toFixed(1)}%`,
                  edge: n.segmentId,
                })),
                ...s.darts.map((d) => ({
                  id: d.id,
                  kind: "dart" as const,
                  label: `Dart · ${d.intakeMm} × ${d.depthMm} mm`,
                  edge: edgeId,
                })),
                ...s.marks.map((m) => ({
                  id: m.id,
                  kind: m.kind,
                  label: `${m.kind} · ${m.segmentId ? "Edge" : "Piece"}`,
                  edge: edgeId,
                })),
              ].map((item) => (
                <Group key={item.id} grow>
                  <Button
                    variant="default"
                    disabled={!available}
                    onClick={() =>
                      setSession(
                        newSewingSession(
                          state.document,
                          piece.id,
                          item.kind,
                          item.edge,
                          item.id,
                        ),
                      )
                    }
                  >
                    {item.label}
                  </Button>
                  <Button
                    variant="subtle"
                    disabled={!available}
                    aria-label={`Delete ${item.label}`}
                    onClick={() =>
                      change((s) => ({
                        ...s,
                        notches: s.notches.filter((n) => n.id !== item.id),
                        darts: s.darts.filter((n) => n.id !== item.id),
                        marks: s.marks.filter((n) => n.id !== item.id),
                      }))
                    }
                  >
                    Delete
                  </Button>
                </Group>
              ))}
              {piece.internalPaths.map((path, i) => {
                const setting = s.paths[path.id] ?? {
                  role: "construction" as const,
                  visible: true,
                  export: true,
                };
                return (
                  <Stack key={path.id} gap={4}>
                    <Select
                      label={`Internal path ${i + 1} role`}
                      value={setting.role}
                      disabled={!available}
                      data={internalRoleSchema.options}
                      onChange={(v) =>
                        change((s) => {
                          s.paths[path.id] = {
                            ...setting,
                            role: internalRoleSchema.parse(v),
                          };
                          return s;
                        })
                      }
                    />
                    <Checkbox
                      label={`Show internal path ${i + 1}`}
                      checked={setting.visible}
                      disabled={!available}
                      onChange={(e) => {
                        const visible = e.currentTarget.checked;
                        change((s) => {
                          s.paths[path.id] = { ...setting, visible };
                          return s;
                        });
                      }}
                    />
                    <Checkbox
                      label={`Export internal path ${i + 1}`}
                      checked={setting.export}
                      disabled={!available}
                      onChange={(e) => {
                        const value = e.currentTarget.checked;
                        change((s) => {
                          s.paths[path.id] = { ...setting, export: value };
                          return s;
                        });
                      }}
                    />
                  </Stack>
                );
              })}
              <Button
                variant="default"
                disabled={!available || s.edges[edgeId]?.role !== "fold"}
                onClick={() =>
                  run(() =>
                    commands.foldPiece
                      .bind({ pieceId: piece.id, edgeId, unfold: false })
                      .run(),
                  )
                }
              >
                Mirror across fold edge
              </Button>
              <Button
                variant="default"
                disabled={!available || s.edges[edgeId]?.role !== "fold"}
                onClick={() =>
                  run(() =>
                    commands.foldPiece
                      .bind({ pieceId: piece.id, edgeId, unfold: true })
                      .run(),
                  )
                }
              >
                Unfold across fold edge
              </Button>
              <Checkbox
                label="Export piece metadata"
                checked={metadata}
                onChange={(e) => setMetadata(e.currentTarget.checked)}
              />
              <Checkbox
                label="Export sewing marks"
                checked={marks}
                onChange={(e) => setMarks(e.currentTarget.checked)}
              />
              <Checkbox
                label="Export internal paths"
                checked={internal}
                onChange={(e) => setInternal(e.currentTarget.checked)}
              />
              <Button
                variant="default"
                onClick={() =>
                  run(() => {
                    const svg = exportSewingSvg(state.document, [piece.id], {
                      metadata,
                      marks,
                      internal,
                    });
                    downloadSvg(svg, piece.name);
                  })
                }
              >
                Export sewing SVG
              </Button>
              <Text size="xs">
                SVG includes physical mm sizing and optional printable metadata.
                Use File → Export vector SVG for cut outlines and multiple
                pieces. PDF tiling remains a later milestone.
              </Text>
              {error && (
                <Text c="red" role="alert">
                  {error}
                </Text>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {session && (
        <SewingEditor session={session} onClose={() => setSession(null)} />
      )}
    </>
  );
}
export function ShapeMenu() {
  const s = useEditor(),
    [session, setSession] = useState<SewingSession | null>(null);
  return (
    <>
      <Menu>
        <Menu.Target>
          <Button variant="default">Shapes</Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            disabled={!!s.preview || s.hasDraft || s.gestureActive}
            onClick={() =>
              setSession(newSewingSession(s.document, "", "ellipse"))
            }
          >
            Ellipse…
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {session && (
        <SewingEditor session={session} onClose={() => setSession(null)} />
      )}
    </>
  );
}
