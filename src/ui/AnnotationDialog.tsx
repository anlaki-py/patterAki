import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import {
  annotationFields,
  annotationSessionActive,
  commitAnnotation,
  previewAnnotation,
  type AnnotationSession,
} from "../editor/annotationEdit";
import { useEditor } from "../editor/store";
import { DraggableModal } from "./DraggableModal";
export function AnnotationDialog({
  session,
  onClose,
}: {
  session: AnnotationSession;
  onClose: () => void;
}) {
  const [fields, setFields] = useState(() =>
    annotationFields(session.annotation, session.base.unitsDisplay),
  );
  const [commitError, setCommitError] = useState("");
  const { kind } = session.annotation;
  const units = session.base.unitsDisplay;
  const result = useMemo(() => {
    try {
      return { document: previewAnnotation(session, fields), error: "" };
    } catch (e) {
      return { document: null, error: (e as Error).message };
    }
  }, [session, fields]);
  useEffect(() => {
    if (annotationSessionActive(session))
      useEditor.setState({ preview: result.document });
    return () => {
      if (annotationSessionActive(session))
        useEditor.setState({ preview: null });
    };
  }, [session, result.document]);
  const apply = () => {
    try {
      commitAnnotation(session, fields);
      onClose();
    } catch (e) {
      setCommitError((e as Error).message);
    }
  };
  return (
    <DraggableModal
      title={
        session.base.annotations[session.annotation.id]
          ? "Edit mark"
          : "Add mark"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Stack gap="sm">
          {kind === "text" ? (
            <Textarea
              label="Text"
              data-autofocus
              autosize
              minRows={3}
              maxRows={8}
              maxLength={1000}
              value={fields.text}
              onChange={(e) =>
                setFields({ ...fields, text: e.currentTarget.value })
              }
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  apply();
                }
              }}
            />
          ) : (
            kind !== "drill" && (
              <TextInput
                label="Label (optional)"
                maxLength={120}
                value={fields.text}
                onChange={(e) =>
                  setFields({ ...fields, text: e.currentTarget.value })
                }
              />
            )
          )}
          <NumberInput
            label={`${kind === "drill" ? "Mark diameter" : "Text size"} (${units})`}
            value={fields.size}
            onChange={(size) => setFields({ ...fields, size })}
          />
          {kind !== "text" && kind !== "drill" && (
            <NumberInput
              label={`Length (${units})`}
              value={fields.length}
              onChange={(length) => setFields({ ...fields, length })}
            />
          )}
          {kind !== "drill" && (
            <NumberInput
              label="Angle (degrees clockwise)"
              value={fields.rotation}
              onChange={(rotation) => setFields({ ...fields, rotation })}
            />
          )}
          {(result.error || commitError) && (
            <Text role="alert" c="red" size="sm">
              {result.error || commitError}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            Drag the window title to see the preview. Escape cancels.{" "}
            {kind === "text"
              ? "Ctrl/Cmd+Enter applies; Enter adds a text line."
              : "Enter applies."}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!result.document}>
              Apply mark
            </Button>
          </Group>
        </Stack>
      </form>
    </DraggableModal>
  );
}
