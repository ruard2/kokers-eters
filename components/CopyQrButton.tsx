"use client";

import { useState } from "react";

type CopyQrButtonProps = {
  value: string;
};

export function CopyQrButton({ value }: CopyQrButtonProps) {
  const [copied, setCopied] = useState<"idle" | "image" | "link">("idle");

  async function copy() {
    const qrUrl = `/api/qr?format=png&text=${encodeURIComponent(value)}`;

    if ("clipboard" in navigator && "write" in navigator.clipboard && typeof ClipboardItem !== "undefined") {
      const response = await fetch(qrUrl, { cache: "no-store" });
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied("image");
    } else {
      await navigator.clipboard.writeText(new URL(qrUrl, window.location.origin).toString());
      setCopied("link");
    }

    window.setTimeout(() => setCopied("idle"), 1800);
  }

  const label = copied === "image" ? "QR gekopieerd" : copied === "link" ? "QR-link gekopieerd" : "Kopieer QR-code";

  return (
    <button className="secondary" onClick={copy} type="button">
      {label}
    </button>
  );
}
