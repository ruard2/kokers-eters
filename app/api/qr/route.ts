import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const text = url.searchParams.get("text") || "";
  const format = url.searchParams.get("format");

  if (!text || text.length > 1000) {
    return new Response("Ongeldige QR-tekst.", { status: 400 });
  }

  if (format === "png") {
    const png = await QRCode.toBuffer(text, {
      type: "png",
      width: 640,
      margin: 2,
      color: {
        dark: "#17211c",
        light: "#ffffff"
      }
    });

    return new Response(png, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "image/png"
      }
    });
  }

  const svg = await QRCode.toString(text, {
    type: "svg",
    width: 220,
    margin: 1,
    color: {
      dark: "#17211c",
      light: "#ffffff"
    }
  });

  return new Response(svg, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "image/svg+xml"
    }
  });
}
