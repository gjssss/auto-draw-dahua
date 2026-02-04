"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Vertex = {
  x: number;
  y: number;
};

type RectData = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  vertices: Vertex[];
};

type Stroke = Vertex[];

const STORAGE_KEY = "auto-draw:rect-vertices";
const MIN_STROKE_WIDTH = 8;
const MAX_STROKE_WIDTH = 20;

function parsePercentValue(value: unknown): number | null {
  const raw =
    typeof value === "number" ? value : parseFloat(String(value).trim());

  if (!Number.isFinite(raw)) {
    return null;
  }

  return raw;
}

function computeRect(data: unknown): RectData | null {
  if (!Array.isArray(data)) {
    return null;
  }

  const points: Vertex[] = [];

  for (const row of data) {
    if (!Array.isArray(row) || row.length < 4) {
      continue;
    }

    const coords = row[3];
    if (!Array.isArray(coords) || coords.length < 2) {
      continue;
    }

    const x = parsePercentValue(coords[0]);
    const y = parsePercentValue(coords[1]);

    if (x === null || y === null) {
      continue;
    }

    points.push({ x, y });
  }

  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  if (maxX <= minX || maxY <= minY) {
    return null;
  }

  const vertices: Vertex[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  return {
    minX,
    maxX,
    minY,
    maxY,
    vertices,
  };
}

function parseStoredRect(raw: string | null): RectData | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RectData;
    if (
      typeof parsed?.minX === "number" &&
      typeof parsed?.maxX === "number" &&
      typeof parsed?.minY === "number" &&
      typeof parsed?.maxY === "number" &&
      Array.isArray(parsed?.vertices)
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function parseStrokes(data: unknown): Stroke[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const strokes: Stroke[] = [];
  let current: Stroke | null = null;
  let isDragging = false;

  for (const row of data) {
    if (!Array.isArray(row) || row.length < 4) {
      continue;
    }

    const action = row[2];
    const coords = row[3];
    if (!Array.isArray(coords) || coords.length < 2) {
      continue;
    }

    const x = parsePercentValue(coords[0]);
    const y = parsePercentValue(coords[1]);

    if (x === null || y === null) {
      continue;
    }

    if (action === "mouse left down") {
      isDragging = true;
      current = [{ x, y }];
      continue;
    }

    if (action === "mouse move") {
      if (isDragging && current) {
        current.push({ x, y });
      }
      continue;
    }

    if (action === "mouse left up") {
      if (isDragging && current) {
        current.push({ x, y });
        strokes.push(current);
      }
      isDragging = false;
      current = null;
    }
  }

  return strokes;
}

export default function Home() {
  const [rect, setRect] = useState<RectData | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const ratio = useMemo(() => {
    if (!rect) {
      return 1;
    }
    const width = rect.maxX - rect.minX;
    const height = rect.maxY - rect.minY;
    return width / height;
  }, [rect]);

  useEffect(() => {
    const stored = parseStoredRect(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      setRect(stored);
    }
  }, []);

  useEffect(() => {
    if (!rect) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const BOX_SIZE = 700;
    const width =
      ratio >= 1 ? BOX_SIZE : Math.max(1, Math.round(BOX_SIZE * ratio));
    const height =
      ratio >= 1 ? Math.max(1, Math.round(BOX_SIZE / ratio)) : BOX_SIZE;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (strokes.length === 0) {
      return;
    }

    const rectWidth = rect.maxX - rect.minX;
    const rectHeight = rect.maxY - rect.minY;
    const scaleX = width / rectWidth;
    const scaleY = height / rectHeight;

    ctx.strokeStyle = "#111111";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const segments: { x1: number; y1: number; x2: number; y2: number; d: number }[] = [];

    for (const stroke of strokes) {
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
        segments.push({ x1, y1, x2, y2, d });
      }
    }

    if (segments.length === 0) {
      return;
    }

    let minD = Infinity;
    let maxD = -Infinity;
    for (const seg of segments) {
      minD = Math.min(minD, seg.d);
      maxD = Math.max(maxD, seg.d);
    }

    const minWidth = MIN_STROKE_WIDTH;
    const maxWidth = MAX_STROKE_WIDTH;
    const span = Math.max(1e-6, maxD - minD);

    for (const seg of segments) {
      const t = (seg.d - minD) / span;
      const width = maxWidth - t * (maxWidth - minWidth);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
  }, [rect, ratio, strokes]);

  const handleFilePick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handlePreviewPick = () => {
    setPreviewError(null);
    previewInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const computed = computeRect(data);

      if (!computed) {
        setError("无法从文件中解析坐标，请确认格式正确。");
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(computed));
      setRect(computed);
    } catch {
      setError("文件内容不是有效 JSON。");
    } finally {
      event.target.value = "";
    }
  };

  const handlePreviewChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPreviewError(null);

    if (!rect) {
      setPreviewError("请先上传区域文件。");
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const parsed = parseStrokes(data);

      if (parsed.length === 0) {
        setPreviewError("未找到有效的拖动轨迹。");
        return;
      }

      setStrokes(parsed);
    } catch {
      setPreviewError("文件内容不是有效 JSON。");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleFilePick}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400"
          >
            上传区域
          </button>
          <button
            type="button"
            onClick={handlePreviewPick}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400"
          >
            上传预览
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={previewInputRef}
            type="file"
            accept=".txt,application/json"
            className="hidden"
            onChange={handlePreviewChange}
          />
        </div>

        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : null}
        {previewError ? (
          <div className="text-sm text-red-600">{previewError}</div>
        ) : null}

        {rect ? (
          <div className="flex h-[700px] w-[700px] items-center justify-center">
            <canvas
              ref={canvasRef}
              className="block border border-zinc-300"
            />
          </div>
        ) : (
          <div className="text-sm text-zinc-600">请上传区域</div>
        )}
      </div>
    </main>
  );
}
