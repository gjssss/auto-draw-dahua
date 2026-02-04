"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DebugPanel } from "./components/DebugPanel";
import { bwGridToDotGrid, dotGridToStrokesAndEvents } from "./lib/gridToPath";
import { imageFileToBWGrid } from "./lib/imageToBWGrid";
import { buildSegmentsData } from "./lib/strokeSegments";
import type {
  BWGrid,
  CanvasSize,
  DotGrid,
  MouseEventItem,
  RectData,
  Stroke,
  Vertex,
} from "./lib/types";

const STORAGE_KEY = "auto-draw:rect-vertices";
const MIN_STROKE_WIDTH = 8;
const MAX_STROKE_WIDTH = 20;
const PIXEL_BLOCK_SIZE = 6;
const BW_THRESHOLD = 34;
const DOT_BLOCK_SIZE = 3;

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

function getCanvasSize(ratio: number): CanvasSize {
  const BOX_SIZE = 700;
  const width =
    ratio >= 1 ? BOX_SIZE : Math.max(1, Math.round(BOX_SIZE * ratio));
  const height =
    ratio >= 1 ? Math.max(1, Math.round(BOX_SIZE / ratio)) : BOX_SIZE;

  return { width, height };
}

export default function Home() {
  const [rect, setRect] = useState<RectData | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedEvents, setGeneratedEvents] = useState<MouseEventItem[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugCount, setDebugCount] = useState(0);
  const [bwGrid, setBwGrid] = useState<BWGrid | null>(null);
  const [dotGrid, setDotGrid] = useState<DotGrid | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bwCanvasRef = useRef<HTMLCanvasElement>(null);

  const ratio = useMemo(() => {
    if (!rect) {
      return 1;
    }
    const width = rect.maxX - rect.minX;
    const height = rect.maxY - rect.minY;
    return width / height;
  }, [rect]);

  const isDev = process.env.NODE_ENV === "development";
  const canvasSize = useMemo(() => getCanvasSize(ratio), [ratio]);

  const segmentsData = useMemo(
    () => (rect ? buildSegmentsData(strokes, rect, canvasSize) : null),
    [rect, strokes, canvasSize]
  );

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

    const { width, height } = canvasSize;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, width, height);

    if (!segmentsData) {
      return;
    }

    ctx.strokeStyle = "#111111";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const minWidth = MIN_STROKE_WIDTH;
    const maxWidth = MAX_STROKE_WIDTH;
    const span = Math.max(1e-6, segmentsData.maxD - segmentsData.minD);

    for (const seg of segmentsData.segments) {
      const t = (seg.d - segmentsData.minD) / span;
      const width = maxWidth - t * (maxWidth - minWidth);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
  }, [rect, canvasSize, segmentsData]);

  useEffect(() => {
    if (!bwGrid) {
      return;
    }

    const canvas = bwCanvasRef.current;
    if (!canvas) {
      return;
    }

    const width = Math.max(1, bwGrid.width * PIXEL_BLOCK_SIZE);
    const height = Math.max(1, bwGrid.height * PIXEL_BLOCK_SIZE);
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#000000";

    for (let y = 0; y < bwGrid.height; y += 1) {
      for (let x = 0; x < bwGrid.width; x += 1) {
        if (!bwGrid.data[y][x]) {
          continue;
        }
        ctx.fillRect(
          x * PIXEL_BLOCK_SIZE,
          y * PIXEL_BLOCK_SIZE,
          PIXEL_BLOCK_SIZE,
          PIXEL_BLOCK_SIZE
        );
      }
    }
  }, [bwGrid]);

  const handleFilePick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handlePreviewPick = () => {
    setPreviewError(null);
    previewInputRef.current?.click();
  };

  const handleImagePick = () => {
    setImageError(null);
    imageInputRef.current?.click();
  };

  const handleDownload = () => {
    if (generatedEvents.length === 0) {
      return;
    }

    const blob = new Blob([JSON.stringify(generatedEvents, null, 2)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "auto-draw.txt";
    link.click();
    URL.revokeObjectURL(url);
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
      setGeneratedEvents([]);
      setStrokes([]);
      setBwGrid(null);
      setDotGrid(null);
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
      setGeneratedEvents([]);
      setBwGrid(null);
      setDotGrid(null);
    } catch {
      setPreviewError("文件内容不是有效 JSON。");
    } finally {
      event.target.value = "";
    }
  };

  const handleImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setImageError(null);

    if (!rect) {
      setImageError("请先上传区域文件。");
      event.target.value = "";
      return;
    }

    setIsProcessing(true);

    try {
      const { width: canvasWidth, height: canvasHeight } = canvasSize;
      const gridW = Math.max(1, Math.floor(canvasWidth / PIXEL_BLOCK_SIZE));
      const gridH = Math.max(1, Math.floor(canvasHeight / PIXEL_BLOCK_SIZE));
      const grid = await imageFileToBWGrid(file, {
        gridWidth: gridW,
        gridHeight: gridH,
        threshold: BW_THRESHOLD,
      });
      setBwGrid(grid);

      const dots = bwGridToDotGrid(grid, DOT_BLOCK_SIZE);
      setDotGrid(dots);

      const { strokes: dfsStrokes, events } = dotGridToStrokesAndEvents(
        dots,
        rect
      );

      if (dfsStrokes.length === 0) {
        setImageError("未生成有效的轨迹。");
        return;
      }

      setGeneratedEvents(events);
      setStrokes(dfsStrokes);
      setDebugCount(dfsStrokes.length);
    } catch {
      setImageError("图片处理失败，请重试。");
    } finally {
      setIsProcessing(false);
      event.target.value = "";
    }
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/manual"
            className="inline-flex h-10 items-center rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400"
          >
            手动绘制
          </Link>
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
          <button
            type="button"
            onClick={handleImagePick}
            disabled={isProcessing}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            上传图片
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={generatedEvents.length === 0}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            下载
          </button>
          {isDev ? (
            <button
              type="button"
              onClick={() => setDebugOpen((prev) => !prev)}
              className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400"
            >
              {debugOpen ? "关闭调试" : "打开调试"}
            </button>
          ) : null}
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
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </div>

        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : null}
        {previewError ? (
          <div className="text-sm text-red-600">{previewError}</div>
        ) : null}
        {imageError ? (
          <div className="text-sm text-red-600">{imageError}</div>
        ) : null}

        {rect ? (
          <div className="flex flex-col items-start gap-4">
            <div className="flex h-[700px] w-[700px] items-center justify-center">
              <canvas
                ref={canvasRef}
                className="block border border-zinc-300"
              />
            </div>
            {isDev ? (
              <DebugPanel
                open={debugOpen}
                strokesLength={strokes.length}
                debugCount={debugCount}
                onDebugCountChange={setDebugCount}
                segmentsData={segmentsData}
                canvasSize={canvasSize}
                minStrokeWidth={MIN_STROKE_WIDTH}
                maxStrokeWidth={MAX_STROKE_WIDTH}
                dotGrid={dotGrid}
              />
            ) : null}
            {bwGrid ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm text-zinc-700">黑白方格结果</div>
                <div className="flex h-[700px] w-[700px] items-center justify-center">
                  <canvas
                    ref={bwCanvasRef}
                    className="block border border-zinc-300"
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-zinc-600">请上传区域</div>
        )}
      </div>
    </main>
  );
}
