import type { CanvasSize, RectData, SegmentsData, Stroke, StrokeSegment } from "./types";

export function buildSegmentsData(
  strokes: Stroke[],
  rect: RectData,
  canvasSize: CanvasSize
): SegmentsData | null {
  if (strokes.length === 0) {
    return null;
  }

  const rectWidth = rect.maxX - rect.minX;
  const rectHeight = rect.maxY - rect.minY;
  const scaleX = canvasSize.width / rectWidth;
  const scaleY = canvasSize.height / rectHeight;

  const segments: StrokeSegment[] = [];

  for (let sIndex = 0; sIndex < strokes.length; sIndex += 1) {
    const stroke = strokes[sIndex];
    if (stroke.length < 2) {
      continue;
    }

    for (let i = 1; i < stroke.length; i += 1) {
      const prev = stroke[i - 1];
      const next = stroke[i];
      const x1 = (prev.x - rect.minX) * scaleX;
      const y1 = (prev.y - rect.minY) * scaleY;
      const x2 = (next.x - rect.minX) * scaleX;
      const y2 = (next.y - rect.minY) * scaleY;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const d = Math.hypot(dx, dy);
      segments.push({ x1, y1, x2, y2, d, strokeIndex: sIndex });
    }
  }

  if (segments.length === 0) {
    return null;
  }

  let minD = Infinity;
  let maxD = -Infinity;
  for (const seg of segments) {
    minD = Math.min(minD, seg.d);
    maxD = Math.max(maxD, seg.d);
  }

  return { segments, minD, maxD };
}
