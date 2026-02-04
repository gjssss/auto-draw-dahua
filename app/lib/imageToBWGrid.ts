import type { BWGrid } from "./types";

type ImageToBWGridOptions = {
  gridWidth: number;
  gridHeight: number;
  threshold: number;
};

export async function imageFileToBWGrid(
  file: File,
  options: ImageToBWGridOptions
): Promise<BWGrid> {
  const bitmap = await createImageBitmap(file);
  try {
    const gridW = Math.max(1, Math.floor(options.gridWidth));
    const gridH = Math.max(1, Math.floor(options.gridHeight));
    const canvas = document.createElement("canvas");
    canvas.width = gridW;
    canvas.height = gridH;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("canvas context not available");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, gridW, gridH);

    const scale = Math.min(gridW / bitmap.width, gridH / bitmap.height);
    const drawW = bitmap.width * scale;
    const drawH = bitmap.height * scale;
    const offsetX = (gridW - drawW) / 2;
    const offsetY = (gridH - drawH) / 2;

    ctx.drawImage(bitmap, offsetX, offsetY, drawW, drawH);

    const imageData = ctx.getImageData(0, 0, gridW, gridH);
    const data = imageData.data;
    const grid: boolean[][] = Array.from({ length: gridH }, () =>
      Array.from({ length: gridW }, () => false)
    );

    for (let y = 0; y < gridH; y += 1) {
      for (let x = 0; x < gridW; x += 1) {
        const idx = (y * gridW + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        grid[y][x] = luma < options.threshold;
      }
    }

    return {
      width: gridW,
      height: gridH,
      data: grid,
    };
  } finally {
    bitmap.close?.();
  }
}
