'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { Button } from '@/components/staff-ui/button';

function PdfPage({
    pdf, number, width, zoom,
}: {
    pdf: PDFDocumentProxy;
    number: number;
    width: number;
    zoom: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState('');
    const [accessibleText, setAccessibleText] = useState('');

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || width === 0) return;
        let cancelled = false;
        let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | null = null;
        pdf.getPage(number).then(async (page) => {
            if (cancelled) return;
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: width * zoom / base.width });
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.ceil(viewport.width * pixelRatio);
            canvas.height = Math.ceil(viewport.height * pixelRatio);
            canvas.style.width = `${Math.ceil(viewport.width)}px`;
            canvas.style.height = `${Math.ceil(viewport.height)}px`;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas is unavailable.');
            renderTask = page.render({
                canvas,
                canvasContext: context,
                viewport,
                transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
            });
            await renderTask.promise;
            const content = await page.getTextContent();
            if (!cancelled) setAccessibleText(content.items
                .filter((item): item is typeof item & { str: string } => 'str' in item)
                .map((item) => item.str).join(' ').slice(0, 20_000));
        }).catch((reason) => {
            if (!cancelled && reason?.name !== 'RenderingCancelledException') {
                setError('This PDF page could not be displayed.');
            }
        });
        return () => {
            cancelled = true;
            renderTask?.cancel();
        };
    }, [pdf, number, width, zoom]);

    return <div className="mx-auto w-fit max-w-none bg-white shadow-sm">
        {error ? <p role="alert" className="p-4 text-sm text-destructive">{error}</p> : null}
        <canvas ref={canvasRef} role="img" aria-label={`Page ${number} of ${pdf.numPages}`} />
        {accessibleText ? <p className="sr-only">{accessibleText}</p> : null}
    </div>;
}

export function PdfDocumentPreview({
    documentId, filename,
}: {
    documentId: string;
    filename: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
    const [error, setError] = useState('');
    const [width, setWidth] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [pageNumber, setPageNumber] = useState(1);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(() => setWidth(Math.max(0, container.clientWidth - 32)));
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let loadingTask: ReturnType<typeof import('pdfjs-dist')['getDocument']> | null = null;
        fetch(`/api/staff/documents/${documentId}?view=bytes`, {
            signal: controller.signal, cache: 'no-store',
        }).then(async (response) => {
            if (!response.ok) throw new Error('This PDF could not be previewed.');
            const data = new Uint8Array(await response.arrayBuffer());
            const pdfjs = await import('pdfjs-dist/webpack.mjs');
            if (controller.signal.aborted) return;
            loadingTask = pdfjs.getDocument({ data });
            const loaded = await loadingTask.promise;
            if (!controller.signal.aborted) setPdf(loaded);
        }).catch(() => {
            if (!controller.signal.aborted) setError('This PDF could not be previewed.');
        });
        return () => {
            controller.abort();
            void loadingTask?.destroy();
        };
    }, [documentId]);

    return <div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
                {pdf ? `${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}` : 'PDF'}
            </span>
            <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" title="Previous page"
                    aria-label="Previous page" disabled={!pdf || pageNumber <= 1}
                    onClick={() => {
                        setPageNumber((value) => value - 1);
                        containerRef.current?.scrollTo({ top: 0 });
                    }}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-10 text-center text-xs tabular-nums">
                    {pdf ? `${pageNumber}/${pdf.numPages}` : '—'}
                </span>
                <Button size="icon" variant="ghost" title="Next page"
                    aria-label="Next page" disabled={!pdf || pageNumber >= pdf.numPages}
                    onClick={() => {
                        setPageNumber((value) => value + 1);
                        containerRef.current?.scrollTo({ top: 0 });
                    }}>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" title="Zoom out"
                    aria-label="Zoom out" disabled={zoom <= 0.75}
                    onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}>
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="w-11 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" title="Zoom in"
                    aria-label="Zoom in" disabled={zoom >= 2}
                    onClick={() => setZoom((value) => Math.min(2, value + 0.25))}>
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" asChild>
                    <a href={`/api/staff/documents/${documentId}?view=inline`}
                        target="_blank" rel="noreferrer"
                        title={`Open original ${filename}`} aria-label={`Open original ${filename}`}>
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </Button>
            </div>
        </div>
        <div ref={containerRef} className="max-h-[min(70vh,720px)] overflow-auto bg-muted p-4">
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
                : pdf && width ? <PdfPage key={pageNumber} pdf={pdf}
                    number={pageNumber} width={width} zoom={zoom} />
                    : <p role="status" className="text-sm text-muted-foreground">
                    Loading PDF…</p>}
        </div>
    </div>;
}
