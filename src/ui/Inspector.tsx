import { CurveProperties } from "./CurveProperties";
import { GuideProperties } from "./GuideProperties";
import { Button, Select, Stack, Text, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { commandProps } from "./CommandControls";
import { LengthEditor } from "./LengthEditor";
export function Inspector() {
  const s = useEditor();
  const [nameDraft, setNameDraft] = useState(s.document.name);
  const cancelNameBlur = useRef(false);
  useEffect(
    () => setNameDraft(s.document.name),
    [s.document.id, s.document.name],
  );
  const commitName = () => {
    if (cancelNameBlur.current) {
      cancelNameBlur.current = false;
      setNameDraft(s.document.name);
      return;
    }
    const name = nameDraft.trim();
    if (commands.rename.bind(name).enabled()) {
      commands.rename.bind(name).run();
      setNameDraft(name);
    } else setNameDraft(s.document.name);
  };
  const annotation =
    s.selected.length === 1 ? s.document.annotations[s.selected[0]] : undefined;
  const edge =
    s.selected.length === 1 ? s.document.segments[s.selected[0]] : undefined;
  const moveCommand = commands.move.bind({
    execute: () => useEditor.setState({ moveDialogOpen: true }),
    enabled: () => {
      const state = useEditor.getState();
      return (
        !state.preview &&
        !state.hasDraft &&
        (!!state.activePoint || state.selected.length > 0)
      );
    },
  });
  return (
    <Stack p="sm" gap="sm">
      <Text fw={600} size="sm">
        Properties
      </Text>
      <TextInput
        label={commands.rename.label}
        value={nameDraft}
        maxLength={120}
        onChange={(e) => setNameDraft(e.currentTarget.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelNameBlur.current = true;
            setNameDraft(s.document.name);
            e.currentTarget.blur();
          }
        }}
      />
      <Select
        label={commands.units.label}
        data={["mm", "cm", "in"]}
        value={s.document.unitsDisplay}
        onChange={(v) => {
          if (v === "mm" || v === "cm" || v === "in")
            commands.units.bind(v).run();
        }}
      />
      {s.selected.length > 1 ? (
        <Text size="sm">
          {s.selected.length} items selected. Drag a selected item to move them
          together. Right-click a selected item to delete the group, or use
          Delete.
        </Text>
      ) : annotation ? (
        <Text size="sm">
          {annotation.kind === "text" ? annotation.text : annotation.kind}{" "}
          selected. Double-click the mark or use Marks → Edit mark to edit its
          size and direction. Drag it to move.
        </Text>
      ) : edge && s.lengthDialogEdge ? (
        <Text size="sm">Length controls are open in the editing window.</Text>
      ) : edge ? (
        edge.kind === "cubic" ? (
          <CurveProperties key={edge.id} />
        ) : (
          <LengthEditor key={`${edge.id}-${s.revision}`} />
        )
      ) : (
        <Text size="sm" c="dimmed">
          Select a line to change its length. Drag a selected endpoint to
          reshape it. Double-click an edge to insert a point.
        </Text>
      )}
      <Button variant="default" {...commandProps(moveCommand)}>
        {moveCommand.label}
      </Button>
      <GuideProperties />
      <Text size="xs" c="dimmed">
        Geometry is stored in millimetres. Display units and view zoom do not
        change dimensions.
      </Text>
    </Stack>
  );
}
