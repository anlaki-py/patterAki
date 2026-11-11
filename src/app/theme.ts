import { createTheme, Menu } from "@mantine/core";
export const theme = createTheme({
  primaryColor: "blue",
  defaultRadius: "sm",
  fontFamily: "system-ui, sans-serif",
  components: {
    Menu: Menu.extend({
      defaultProps: {
        floatingStrategy: "fixed",
        middlewares: {
          flip: { padding: 8 },
          // Move vertically into view before restricting the scroll height.
          shift: {
            padding: 8,
            crossAxis: true,
            limiter: { fn: ({ x, y }) => ({ x, y }) },
          },
          size: { padding: 8 },
        },
      },
      styles: {
        dropdown: {
          maxHeight: "calc(100dvh - 16px)",
          maxWidth: "calc(100vw - 16px)",
          overflowY: "auto",
          overscrollBehavior: "contain",
        },
      },
    }),
    Button: { defaultProps: { size: "xs" } },
    NumberInput: {
      defaultProps: { size: "xs", decimalScale: 2, fixedDecimalScale: false },
    },
    TextInput: { defaultProps: { size: "xs" } },
    Select: { defaultProps: { size: "xs" } },
  },
});
