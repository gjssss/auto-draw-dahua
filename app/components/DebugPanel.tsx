"use client";

import { useEffect, useRef } from "react";
import type { CanvasSize, DotGrid, SegmentsData } from "../lib/types";

type DebugPanelProps = {
  open: boolean;
  strokesLength: number;
  debugCount: number;
  onDebugCountChange: (count: number) => void;
  segmentsData: SegmentsData | null;
  canvasSize: CanvasSize;
  minStrokeWidth: number;
  maxStrokeWidth: number;
  dotGrid: DotGrid | null;
};

export function DebugPanel({
  open,
  strokesLength,
  debugCount,
  onDebugCountChange,
  segmentsData,
  canvasSize,
  minStrokeWidth,
  maxStrokeWidth,
  dotGrid,
}: DebugPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (debugCount !== strokesLength) {
      onDebugCountChange(strokesLength);
    }
  }, [open, debugCount, strokesLength, onDebugCountChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const { width, height } = canvasSize;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (!segmentsData || segmentsData.segments.length === 0) {
      return;
    }

    const maxStrokeCount = Math.max(
      0,
      Math.min(debugCount, strokesLength)
    );
    const span = Math.max(1e-6, segmentsData.maxD - segmentsData.minD);

    ctx.strokeStyle = "#111111";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    for (const seg of segmentsData.segments) {
      if (seg.strokeIndex >= maxStrokeCount) {
        continue;
      }
      const t = (seg.d - segmentsData.minD) / span;
      const width = maxStrokeWidth - t * (maxStrokeWidth - minStrokeWidth);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
  }, [
    open,
    canvasSize,
    segmentsData,
    debugCount,
    strokesLength,
    minStrokeWidth,
    maxStrokeWidth,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const canvas = dotsCanvasRef.current;
    if (!canvas) {
      return;
    }

    const { width, height } = canvasSize;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (!dotGrid) {
      return;
    }

    ctx.fillStyle = "#111111";
    const radius = 2;

    for (let y = 0; y < dotGrid.height; y += 1) {
      for (let x = 0; x < dotGrid.width; x += 1) {
        const point = dotGrid.points[y][x];
        if (!point) {
          continue;
        }
        const px = point.x * width;
        const py = point.y * height;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [open, canvasSize, dotGrid]);

  if (!open) {
    return null;
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="text-sm text-zinc-700">
        线段数: {strokesLength}，当前显示:{" "}
        {Math.max(0, Math.min(debugCount, strokesLength))}
      </div>
      <div className="flex h-[700px] w-[700px] items-center justify-center">
        <canvas ref={canvasRef} className="block border border-zinc-300" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onDebugCountChange(Math.max(0, debugCount - 1))}
          disabled={strokesLength === 0 || debugCount <= 0}
          className="h-9 rounded border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          上一段
        </button>
        <input
          type="range"
          min={0}
          max={strokesLength}
          step={1}
          value={Math.max(0, Math.min(debugCount, strokesLength))}
          onChange={(event) => onDebugCountChange(Number(event.target.value))}
          className="w-64"
          disabled={strokesLength === 0}
        />
        <button
          type="button"
          onClick={() =>
            onDebugCountChange(Math.min(strokesLength, debugCount + 1))
          }
          disabled={strokesLength === 0 || debugCount >= strokesLength}
          className="h-9 rounded border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          下一段
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm text-zinc-700">点图</div>
        <div className="flex h-[700px] w-[700px] items-center justify-center">
          <canvas ref={dotsCanvasRef} className="block border border-zinc-300" />
        </div>
      </div>
    </div>
  );
}
