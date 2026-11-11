import { expect, it } from "vitest";
import { parseLength } from "./lengthInput";
it("converts explicit units and preserves entered precision", () => {
  expect(parseLength("125 mm", 10)).toBe(125);
  expect(parseLength("12.5 cm", 1)).toBe(125);
  expect(parseLength("1 in", 10)).toBe(25.4);
  expect(parseLength("1.234567891", 10)).toBe(12.34567891);
  expect(parseLength("-2 cm", 1)).toBe(-20);
});
it.each(["", "abc", "12 cm mm", "Infinity", "1e999 mm", "1,25", "10 px"])(
  "rejects ambiguous or nonfinite input %s",
  (value) => {
    expect(() => parseLength(value, 1)).toThrow();
  },
);
