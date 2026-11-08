import { createTheme } from "@mantine/core";
export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily: "system-ui, sans-serif",
  components: {
    Button: { defaultProps: { size: "xs" } },
    NumberInput: {
      defaultProps: { size: "xs", decimalScale: 2, fixedDecimalScale: false },
    },
    TextInput: { defaultProps: { size: "xs" } },
    Select: { defaultProps: { size: "xs" } },
  },
});
