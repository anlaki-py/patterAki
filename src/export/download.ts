export function downloadSvg(svg: string, name: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `${name.replace(/[^\w -]/g, "_") || "Pattern"}.svg`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
