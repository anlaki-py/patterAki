import { useState } from "react";
import { Button, Menu } from "@mantine/core";
import { commands } from "../editor/commands";
import {
  pieceActionIds,
  pieceTransformsEnabled,
} from "../editor/pieceCommands";
import { useEditor } from "../editor/store";
import { pieceEdges } from "../document/pieces";
import { pieceForItem } from "../document/pieceAccess";
import { CommandMenuItem, notifyCommand } from "./CommandControls";
import { usePieceRotationDialog } from "./PieceRotationDialog";
import { PieceNameDialog, type PieceNameTarget } from "./PieceNameDialog";

/** One action set for the touch-accessible toolbar and the canvas context menu.
 * Dialogs mount outside Menu.Dropdown so closing the menu cannot cancel them. */
export function usePieceActions(closeMenu: () => void) {
  const s = useEditor(),
    ids = pieceActionIds();
  const rotation = usePieceRotationDialog();
  const [nameTarget, setNameTarget] = useState<PieceNameTarget | null>(null);
  const edgeId = s.selected.find((id) => !!s.document.segments[id]) ?? "";
  const parent = s.activePoint
    ? pieceForItem(s.document, s.activePoint)
    : edgeId
      ? pieceForItem(s.document, edgeId)
      : undefined;
  const idle = () => {
    const state = useEditor.getState();
    return !state.preview && !state.hasDraft && !state.gestureActive;
  };
  const openRotation = commands.rotatePiece.bind({
    enabled: pieceTransformsEnabled,
    execute: () => {
      rotation.open();
      closeMenu();
    },
  });
  const create = commands.createPieceDialog.bind({
    enabled: () => commands.createPiece.enabled(edgeId),
    execute: () => {
      setNameTarget({ kind: "create", edgeId });
      closeMenu();
    },
  });
  const items = (
    <>
      <Menu.Label>
        {ids.length
          ? `${ids.length} pattern ${ids.length === 1 ? "piece" : "pieces"} selected`
          : s.editPieceId
            ? "Editing piece geometry"
            : "Drafting geometry"}
      </Menu.Label>
      {!ids.length && edgeId && (
        <Menu.Label style={{ whiteSpace: "normal", textTransform: "none" }}>
          Piece actions require a pattern piece. Convert a closed path below, or
          select an existing piece.
        </Menu.Label>
      )}
      {!ids.length && <CommandMenuItem command={create} />}
      {!!ids.length && (
        <>
          {parent && (
            <CommandMenuItem command={commands.selectPiece.bind(parent.id)} />
          )}
          <CommandMenuItem
            command={
              s.editPieceId
                ? commands.exitPieceEdit.bind()
                : commands.editPiece.bind()
            }
          />
          <Menu.Divider />
          <CommandMenuItem
            command={commands.renamePiece.bind({
              enabled: () => idle() && pieceActionIds().length === 1,
              execute: () => {
                setNameTarget({ kind: "rename", pieceId: ids[0] });
                closeMenu();
              },
            })}
          />
          <CommandMenuItem
            command={commands.move.bind({
              enabled: pieceTransformsEnabled,
              execute: () => {
                const state = useEditor.getState();
                useEditor.setState({
                  selected: pieceActionIds().flatMap((id) =>
                    pieceEdges(state.document, state.document.pieces[id]),
                  ),
                  editPieceId: null,
                  activePoint: null,
                  moveDialogOpen: true,
                });
                closeMenu();
              },
            })}
          />
          <CommandMenuItem command={notifyCommand(openRotation)} />
          <CommandMenuItem
            command={notifyCommand(commands.duplicatePiece.bind())}
          />
          <CommandMenuItem
            command={{
              ...notifyCommand(commands.mirrorPiece.bind("x")),
              label: "Mirror left/right",
            }}
          />
          <CommandMenuItem
            command={{
              ...notifyCommand(commands.mirrorPiece.bind("y")),
              label: "Mirror top/bottom",
            }}
          />
          <CommandMenuItem
            command={{
              ...commands.setSelectedPieceState.bind({ locked: true }),
              label: "Lock selected pieces",
            }}
          />
          <CommandMenuItem
            command={{
              ...commands.setSelectedPieceState.bind({ visible: false }),
              label: "Hide selected pieces",
            }}
          />
        </>
      )}
      {Object.values(s.document.pieces).some((p) => !p.visible || p.locked) && (
        <Menu.Divider />
      )}
      {Object.values(s.document.pieces).flatMap((p) => [
        ...(!p.visible
          ? [
              <CommandMenuItem
                key={`show-${p.id}`}
                command={{
                  ...commands.updatePiece.bind({
                    id: p.id,
                    patch: { visible: true },
                  }),
                  label: `Show ${p.name}`,
                }}
              />,
            ]
          : []),
        ...(p.locked
          ? [
              <CommandMenuItem
                key={`unlock-${p.id}`}
                command={{
                  ...commands.updatePiece.bind({
                    id: p.id,
                    patch: { locked: false },
                  }),
                  label: `Unlock ${p.name}`,
                }}
              />,
            ]
          : []),
      ])}
    </>
  );
  return {
    items,
    create,
    status: s.editPieceId
      ? `Editing points in ${s.document.pieces[s.editPieceId]?.name ?? "piece"}`
      : ids.length
        ? `${ids.length} pattern ${ids.length === 1 ? "piece" : "pieces"} selected`
        : edgeId
          ? "Draft path selected. Use Piece actions to create a pattern piece."
          : "Select a closed path or pattern piece.",
    dialogs: (
      <>
        {rotation.dialog}
        {nameTarget && (
          <PieceNameDialog
            target={nameTarget}
            onClose={() => setNameTarget(null)}
          />
        )}
      </>
    ),
  };
}

export function PieceActionsMenu() {
  const [opened, setOpened] = useState(false);
  const actions = usePieceActions(() => setOpened(false));
  return (
    <>
      {actions.dialogs}
      <Menu
        opened={opened}
        onChange={setOpened}
        width={300}
        position="bottom-start"
        trapFocus
      >
        <Menu.Target>
          <Button variant="default">Piece actions</Button>
        </Menu.Target>
        <Menu.Dropdown>{actions.items}</Menu.Dropdown>
      </Menu>
    </>
  );
}
