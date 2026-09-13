const SAMPLE_FILE_URL =
  "https://ibfcwcbmnkgigkybluiu.supabase.co/storage/v1/object/public/public-assets/sample.pdf";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sampleFile = await fetch(SAMPLE_FILE_URL, {
      next: { revalidate: 3600 },
    });

    if (!sampleFile.ok || !sampleFile.body) {
      return new Response("نمونه‌کار در حال حاضر در دسترس نیست.", { status: 502 });
    }

    return new Response(sampleFile.body, {
      headers: {
        "Content-Type": sampleFile.headers.get("content-type") ?? "application/pdf",
        "Content-Disposition": 'attachment; filename="daneshyar-sample-work.pdf"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("نمونه‌کار در حال حاضر در دسترس نیست.", { status: 502 });
  }
}
