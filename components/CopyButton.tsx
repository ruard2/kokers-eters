"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type CopyButtonProps = {
  value: string;
};

export function CopyButton({ value }: CopyButtonProps) {
  const t = useTranslations("copy");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="secondary" onClick={copy} type="button">
      {copied ? t("copied") : t("copyLink")}
    </button>
  );
}
