import { TextInput, type TextInputProps } from "@mantine/core";

type Props = Omit<TextInputProps, "value" | "onChange"> & {
  value: string | number;
  onChange?: (value: string) => void;
};
/** NumberInput strips unit letters; a Mantine text field preserves the full measurement. */
export function LengthInput({ value, onChange, ...props }: Props) {
  return (
    <TextInput
      {...props}
      inputMode="text"
      value={value}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
}
