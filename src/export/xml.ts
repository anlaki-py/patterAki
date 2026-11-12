/** XML 1.0 text and attribute escaping, including invalid control characters. */
export const escapeXml = (value: string) =>
  Array.from(value, (character) => {
    const code = character.codePointAt(0)!;
    return code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      code >= 0x10000
      ? character
      : "�";
  })
    .join("")
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
