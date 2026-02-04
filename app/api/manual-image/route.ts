import { NextResponse } from "next/server";

type StoredImage = {
  dataUrl: string;
  width: number;
  height: number;
};

let stored: StoredImage | null = null;

export async function GET() {
  return NextResponse.json(stored);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as StoredImage;
    if (
      typeof body?.dataUrl !== "string" ||
      typeof body?.width !== "number" ||
      typeof body?.height !== "number"
    ) {
      return NextResponse.json(
        { error: "invalid payload" },
        { status: 400 }
      );
    }

    stored = {
      dataUrl: body.dataUrl,
      width: body.width,
      height: body.height,
    };

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
}
