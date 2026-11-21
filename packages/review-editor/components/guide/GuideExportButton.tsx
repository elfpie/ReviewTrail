import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface GuideExportButtonProps {
  /** Live guide job id or `saved:{id}`. */
  jobId: string;
}

interface ExportInfo {
  bytes: number;
  filename: string;
}

function parseExportInfo(input: unknown): ExportInfo | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  if (typeof r.bytes !== 'number' || !Number.isFinite(r.bytes) || typeof r.filename !== 'string') return null;
  return { bytes: r.bytes, filename: r.filename };
}

const HEADER_CONTROL_CLASS =
  'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-border hover:text-foreground';

export function useGuideExportInfo(jobId: string, enabled = true) {
  const [info, setInfo] = useState<ExportInfo | null>(null);
  const encoded = encodeURIComponent(jobId);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setInfo(null);
    fetch(`/api/guide/${encoded}/export-info`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setInfo(parseExportInfo(data));
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [encoded, enabled]);

  return { info, encoded };
}

export function GuideExportButton({ jobId }: GuideExportButtonProps) {
  const { info, encoded } = useGuideExportInfo(jobId);
  if (!info) return null;
  return <a href={`/api/guide/${encoded}/export`} download={info.filename} className={HEADER_CONTROL_CLASS}
    title="Save the guide and diff as a single offline HTML file" data-testid="guide-export">
    <Download size={13} /> Download portable guide
  </a>;
}
