"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSegmentsData } from "../lib/strokeSegments";
import type {
  CanvasSize,
  MouseEventItem,
  RectData,
  Stroke,
  Vertex,
} from "../lib/types";

type StoredImage = {
  dataUrl: string;
  width: number;
  height: number;
};

const STORAGE_KEY = "auto-draw:rect-vertices";
const MIN_STROKE_WIDTH = 8;
const MAX_STROKE_WIDTH = 20;
const BW_THRESHOLD = 34;

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
      typeof parsed?.maxY === "number"
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function getCanvasSize(ratio: number): CanvasSize {
  const BOX_SIZE = 700;
  const width =
    ratio >= 1 ? BOX_SIZE : Math.max(1, Math.round(BOX_SIZE * ratio));
  const height =
    ratio >= 1 ? Math.max(1, Math.round(BOX_SIZE / ratio)) : BOX_SIZE;

  return { width, height };
}

function formatPercent(value: number) {
  return `${Number(value.toFixed(6))}%`;
}

export default function ManualPage() {
  const [rect, setRect] = useState<RectData | null>(null);
  const [processedImage, setProcessedImage] = useState<StoredImage | null>(
    null
  );
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordedStrokes, setRecordedStrokes] = useState<Stroke[]>([]);
  const [generatedEvents, setGeneratedEvents] = useState<MouseEventItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const latestPointRef = useRef<Vertex | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const recordingRef = useRef(false);

  const ratio = useMemo(() => {
    if (!rect) {
      return 1;
    }
    const width = rect.maxX - rect.minX;
    const height = rect.maxY - rect.minY;
    return width / height;
  }, [rect]);

  const canvasSize = useMemo(() => getCanvasSize(ratio), [ratio]);

  useEffect(() => {
    const stored = parseStoredRect(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      setRect(stored);
    }
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    let cancelled = false;

    const fetchStored = async () => {
      try {
        const res = await fetch("/api/manual-image");
        const data = (await res.json()) as StoredImage | null;
        if (!cancelled && data?.dataUrl) {
          setProcessedImage(data);
        }
      } catch {
        // ignore
      }
    };

    fetchStored();

    return () => {
      cancelled = true;
    };
  }, []);

  const drawStrokes = useCallback(
    (ctx: CanvasRenderingContext2D, strokes: Stroke[]) => {
      if (!rect || strokes.length === 0) {
        return;
      }
      const data = buildSegmentsData(strokes, rect, canvasSize);
      if (!data) {
        return;
      }

      const span = Math.max(1e-6, data.maxD - data.minD);
      ctx.strokeStyle = "#111111";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      for (const seg of data.segments) {
        const t = (seg.d - data.minD) / span;
        const width = MAX_STROKE_WIDTH - t * (MAX_STROKE_WIDTH - MIN_STROKE_WIDTH);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
    },
    [rect, canvasSize]
  );

  const drawMainCanvas = useCallback(
    (strokes: Stroke[]) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

      if (imageRef.current) {
        ctx.drawImage(
          imageRef.current,
          0,
          0,
          canvasSize.width,
          canvasSize.height
        );
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      }

      drawStrokes(ctx, strokes);
    },
    [canvasSize, drawStrokes]
  );

  const drawPreviewCanvas = useCallback(
    (strokesOverride?: Stroke[]) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    drawStrokes(ctx, strokesOverride ?? recordedStrokes);
    },
    [canvasSize, recordedStrokes, drawStrokes]
  );

  useEffect(() => {
    drawMainCanvas(recordedStrokes);
    drawPreviewCanvas();
  }, [drawMainCanvas, drawPreviewCanvas, recordedStrokes, processedImage]);

  const handleUploadPick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const processImage = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvasSize.width;
      canvas.height = canvasSize.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("canvas context not available");
      }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const scale = Math.min(
        canvas.width / bitmap.width,
        canvas.height / bitmap.height
      );
      const drawW = bitmap.width * scale;
      const drawH = bitmap.height * scale;
      const offsetX = (canvas.width - drawW) / 2;
      const offsetY = (canvas.height - drawH) / 2;

      ctx.drawImage(bitmap, offsetX, offsetY, drawW, drawH);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < BW_THRESHOLD) {
          data[i] = 0x55;
          data[i + 1] = 0x55;
          data[i + 2] = 0x55;
        } else {
          data[i] = 0xff;
          data[i + 1] = 0xff;
          data[i + 2] = 0xff;
        }
        data[i + 3] = 0xff;
      }

      ctx.putImageData(imageData, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      return { dataUrl, width: canvas.width, height: canvas.height };
    } finally {
      bitmap.close?.();
    }
  };

  const handleUploadChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!rect) {
      setError("请先在首页上传区域。");
      event.target.value = "";
      return;
    }

    setError(null);

    try {
      const processed = await processImage(file);
      setProcessedImage(processed);
      setRecordedStrokes([]);
      setGeneratedEvents([]);
      strokesRef.current = [];
      currentStrokeRef.current = null;
      latestPointRef.current = null;

      await fetch("/api/manual-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(processed),
      });
    } catch {
      setError("图片处理失败，请重试。");
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    if (!processedImage) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      drawMainCanvas(recordedStrokes);
    };
    img.src = processedImage.dataUrl;
  }, [processedImage, drawMainCanvas, recordedStrokes]);

  const toVertexFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!rect) {
      return null;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const box = canvas.getBoundingClientRect();
    const px = Math.min(Math.max(event.clientX - box.left, 0), box.width);
    const py = Math.min(Math.max(event.clientY - box.top, 0), box.height);
    const rectWidth = rect.maxX - rect.minX;
    const rectHeight = rect.maxY - rect.minY;
    return {
      x: rect.minX + (px / box.width) * rectWidth,
      y: rect.minY + (py / box.height) * rectHeight,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!recordingRef.current || !rect || !processedImage) {
      return;
    }

    const point = toVertexFromEvent(event);
    if (!point) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    latestPointRef.current = point;
    currentStrokeRef.current = [point];
    drawMainCanvas([...strokesRef.current, currentStrokeRef.current]);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!recordingRef.current || !isDrawingRef.current) {
      return;
    }

    const point = toVertexFromEvent(event);
    if (!point) {
      return;
    }

    latestPointRef.current = point;
  };

  const finalizeStroke = () => {
    const stroke = currentStrokeRef.current;
    if (!stroke || stroke.length === 0) {
      currentStrokeRef.current = null;
      isDrawingRef.current = false;
      return;
    }

    strokesRef.current = [...strokesRef.current, stroke];
    currentStrokeRef.current = null;
    isDrawingRef.current = false;
    setRecordedStrokes(strokesRef.current);
  };

  const handlePointerUp = () => {
    if (!recordingRef.current || !isDrawingRef.current) {
      return;
    }
    finalizeStroke();
    drawMainCanvas(strokesRef.current);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startRecording = () => {
    if (!processedImage || !rect) {
      setError("请先上传图片并确保已上传区域。");
      return;
    }

    setError(null);
    setRecording(true);
    recordingRef.current = true;
    setRecordedStrokes([]);
    setGeneratedEvents([]);
    strokesRef.current = [];
    currentStrokeRef.current = null;
    latestPointRef.current = null;
    drawMainCanvas([]);

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(() => {
      if (!recordingRef.current || !isDrawingRef.current) {
        return;
      }
      const point = latestPointRef.current;
      const stroke = currentStrokeRef.current;
      if (!point || !stroke) {
        return;
      }
      const last = stroke[stroke.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        stroke.push(point);
        drawMainCanvas([...strokesRef.current, stroke]);
      }
    }, 25);
  };

  const stopRecording = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRecording(false);
    recordingRef.current = false;

    if (isDrawingRef.current) {
      finalizeStroke();
    }

    const strokes = strokesRef.current;
    const events: MouseEventItem[] = [];
    for (let s = 0; s < strokes.length; s += 1) {
      const stroke = strokes[s];
      if (stroke.length === 0) {
        continue;
      }

      if (events.length > 0) {
        const start = stroke[0];
        events.push([
          24,
          "EM",
          "mouse move",
          [formatPercent(start.x), formatPercent(start.y)],
        ]);
      }

      if (stroke.length === 1) {
        const point = stroke[0];
        events.push([
          24,
          "EM",
          "mouse left down",
          [formatPercent(point.x), formatPercent(point.y)],
        ]);
        events.push([
          24,
          "EM",
          "mouse left up",
          [formatPercent(point.x), formatPercent(point.y)],
        ]);
        continue;
      }

      for (let i = 0; i < stroke.length; i += 1) {
        const point = stroke[i];
        const action =
          i === 0
            ? "mouse left down"
            : i === stroke.length - 1
              ? "mouse left up"
              : "mouse move";
        events.push([
          24,
          "EM",
          action,
          [formatPercent(point.x), formatPercent(point.y)],
        ]);
      }
    }

    setGeneratedEvents(events);
    setRecordedStrokes(strokes);
    drawPreviewCanvas(strokes);
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
    link.download = "manual-draw.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400"
          >
            返回
          </Link>
          <button
            type="button"
            onClick={handleUploadPick}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400"
          >
            上传图片
          </button>
          <button
            type="button"
            onClick={startRecording}
            disabled={recording || !processedImage}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            开始录制
          </button>
          <button
            type="button"
            onClick={stopRecording}
            disabled={!recording}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            停止录制
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={generatedEvents.length === 0}
            className="h-10 rounded border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            下载
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUploadChange}
          />
        </div>

        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        {!rect ? (
          <div className="text-sm text-zinc-600">请先在首页上传区域</div>
        ) : null}

        <div className="flex flex-col items-start gap-4">
          <div className="flex h-[700px] w-[700px] items-center justify-center">
            <canvas
              ref={canvasRef}
              className="block border border-zinc-300 touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm text-zinc-700">录制预览</div>
            <div className="flex h-[700px] w-[700px] items-center justify-center">
              <canvas
                ref={previewCanvasRef}
                className="block border border-zinc-300"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
