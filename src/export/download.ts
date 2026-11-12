function downloadFile(blob: Blob, name: string, extension: "svg" | "pdf") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `${name.replace(/[^\w -]/g, "_") || "Pattern"}.${extension}`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function downloadSvg(svg: string, name: string) {
  downloadFile(new Blob([svg], { type: "image/svg+xml" }), name, "svg");
}
export function downloadPdf(bytes: Uint8Array, name: string) {
  downloadFile(
    new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" }),
    name,
    "pdf",
  );
}
