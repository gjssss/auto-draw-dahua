import type { Stroke, Vertex } from "./types";

function distance(a: Vertex, b: Vertex) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sampleAtLength(stroke: Stroke, lengths: number[], target: number): Vertex {
  let right = 1;
  while (right < lengths.length && lengths[right] < target) {
    right += 1;
  }

  if (right >= lengths.length) {
    return stroke[stroke.length - 1];
  }

  const left = right - 1;
  const start = stroke[left];
  const end = stroke[right];
  const segStart = lengths[left];
  const segEnd = lengths[right];
  const segLen = segEnd - segStart;

  if (segLen <= 1e-9) {
    return end;
  }

  const t = (target - segStart) / segLen;
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function resampleStroke(stroke: Stroke, targetSpacing: number): Stroke {
  if (stroke.length <= 1) {
    return [...stroke];
  }

  const lengths = [0];
  for (let i = 1; i < stroke.length; i += 1) {
    lengths.push(lengths[i - 1] + distance(stroke[i - 1], stroke[i]));
  }

  const total = lengths[lengths.length - 1];
  if (total <= 1e-9) {
    return [stroke[0], stroke[stroke.length - 1]];
  }

  const spacing = Math.max(1e-6, targetSpacing);
  const result: Stroke = [stroke[0]];
  let cursor = spacing;

  while (cursor < total) {
    result.push(sampleAtLength(stroke, lengths, cursor));
    cursor += spacing;
  }

  const last = stroke[stroke.length - 1];
  const tail = result[result.length - 1];
  if (!tail || tail.x !== last.x || tail.y !== last.y) {
    result.push(last);
  }

  return result;
}

export function resampleStrokesForExport(
  strokes: Stroke[],
  thicknessScale: number
): Stroke[] {
  if (strokes.length === 0) {
    return [];
  }

  const segmentLengths: number[] = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      const d = distance(stroke[i - 1], stroke[i]);
      if (d > 1e-9) {
        segmentLengths.push(d);
      }
    }
  }

  if (segmentLengths.length === 0) {
    return strokes.map((stroke) => [...stroke]);
  }

  const base = median(segmentLengths);
  const target = base / Math.max(0.1, thicknessScale);

  return strokes.map((stroke) => resampleStroke(stroke, target));
}
