import { NumberInput, Select, Stack, Text } from "@mantine/core";
import type { Fastener } from "../document/fastenerSchema";
import type { FastenerFields } from "../editor/fastenerEdit";

export function FastenerControls({
  kind,
  fields,
  units,
  onChange,
}: {
  kind: Fastener["kind"];
  fields: FastenerFields;
  units: string;
  onChange: (fields: FastenerFields) => void;
}) {
  const number = (
    key: Exclude<keyof FastenerFields, "shape" | "holes" | "style">,
    label: string,
    integer = false,
  ) => (
    <NumberInput
      key={key}
      label={integer ? label : `${label} (${units})`}
      value={fields[key]}
      allowDecimal={!integer}
      onChange={(value) => onChange({ ...fields, [key]: value })}
    />
  );
  return (
    <Stack gap="sm">
      {kind === "button" && (
        <>
          <Select
            label="Button shape"
            value={fields.shape}
            data={[
              { value: "ellipse", label: "Round / oval" },
              { value: "rectangle", label: "Rectangle" },
            ]}
            allowDeselect={false}
            onChange={(shape) => {
              if (shape === "ellipse" || shape === "rectangle")
                onChange({ ...fields, shape });
            }}
          />
          {number("width", "Button width")}
          {number("height", "Button height")}
          <Text size="xs" c="dimmed">
            Use equal width and height for a round button. Placement is at the
            center.
          </Text>
          <Select
            label="Button holes"
            value={fields.holes}
            data={[
              { value: "none", label: "Center cross only" },
              { value: "two", label: "Two holes" },
              { value: "four", label: "Four holes" },
            ]}
            allowDeselect={false}
            onChange={(holes) => {
              if (holes === "none" || holes === "two" || holes === "four")
                onChange({ ...fields, holes });
            }}
          />
          {fields.holes !== "none" && (
            <>
              {number("holeDiameter", "Hole diameter")}
              {number("holeSpacing", "Hole center spacing")}
            </>
          )}
        </>
      )}
      {kind === "buttonhole" && (
        <>
          <Select
            label="Buttonhole style"
            value={fields.style}
            data={[
              { value: "straight", label: "Straight" },
              { value: "rounded", label: "Rounded ends" },
              { value: "keyhole", label: "Jeans / keyhole" },
            ]}
            allowDeselect={false}
            onChange={(style) => {
              if (
                style === "straight" ||
                style === "rounded" ||
                style === "keyhole"
              )
                onChange({ ...fields, style });
            }}
          />
          {number("length", "Overall buttonhole length")}
          {number("width", "Slit width")}
          {fields.style === "keyhole" && (
            <>
              {number("eyeLength", "Eye length")}
              {number("eyeWidth", "Eye width")}
            </>
          )}
          <Text size="xs" c="dimmed">
            Overall length includes the ends and eye. Equal eye length and width
            gives a round eye. The eye is at the left end before rotation.
          </Text>
        </>
      )}
      {(kind === "eyelet" || kind === "snap") && (
        <>
          {number("diameter", "Outer diameter")}
          {number(
            "opening",
            kind === "eyelet" ? "Opening diameter" : "Center diameter",
          )}
        </>
      )}
      {kind === "bartack" && (
        <>
          {number("length", "Bar-tack length")}
          {number("width", "Bar-tack width")}
          {number("stitches", "Stitch count", true)}
        </>
      )}
      <Text size="xs" c="dimmed">
        Placement and size reference only. These marks do not create fabric
        cuts, seam allowances or machine stitching.
      </Text>
    </Stack>
  );
}
