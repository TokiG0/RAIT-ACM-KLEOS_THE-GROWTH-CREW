import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export const FIELD_COLORS = {
  supplier_name:  '#4ade80',
  supplier_gstin: '#60a5fa',
  invoice_number: '#f59e0b',
  invoice_date:   '#a78bfa',
  taxable_value:  '#34d399',
  grand_total:    '#22d3ee',
  cgst_amount:    '#f87171',
  sgst_amount:    '#fb923c',
  igst_amount:    '#e879f9',
};

// Correct for objectFit:contain letterboxing on an <img> element
function getRenderedRect(imgEl) {
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;
  const ew = imgEl.offsetWidth;
  const eh = imgEl.offsetHeight;
  if (!nw || !nh) return { x: 0, y: 0, w: ew, h: eh };
  const scale = Math.min(ew / nw, eh / nh);
  const rw = nw * scale;
  const rh = nh * scale;
  return { x: (ew - rw) / 2, y: (eh - rh) / 2, w: rw, h: rh };
}

export default function InvoiceImageViewer({
  imageUrl, fileType, fieldBbox, activeField, onFieldClick,
}) {
  const containerRef  = useRef(null);
  const imgRef        = useRef(null);    // <img> for image files
  const pdfBaseRef    = useRef(null);    // <canvas> PDF page render
  const overlayRef    = useRef(null);    // <canvas> bbox overlay (both modes)

  const [imgLoaded,    setImgLoaded]    = useState(false);
  const [pdfReady,     setPdfReady]     = useState(false);
  const [pdfDims,      setPdfDims]      = useState({ w: 0, h: 0 });
  const [hoveredField, setHoveredField] = useState(null);

  const isPdf = fileType === 'application/pdf';
  const hasBbox = fieldBbox && Object.keys(fieldBbox).length > 0;

  // ── Render PDF page ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPdf || !imageUrl) return;
    setPdfReady(false);

    (async () => {
      try {
        const pdfDoc  = await pdfjsLib.getDocument(imageUrl).promise;
        const page    = await pdfDoc.getPage(1);

        // Render at 2× device pixel ratio — keeps borders sharp when scaled by CSS
        const dpr     = window.devicePixelRatio || 1;
        const contW   = containerRef.current?.offsetWidth || 720;
        const rawVp   = page.getViewport({ scale: 1 });
        const scale   = (contW / rawVp.width) * Math.max(dpr, 2);
        const vp      = page.getViewport({ scale });

        const base    = pdfBaseRef.current;
        base.width    = vp.width;
        base.height   = vp.height;
        // CSS width:100% will shrink it back to contW — result is crisp
        base.style.width  = '100%';
        base.style.height = 'auto';

        await page.render({ canvasContext: base.getContext('2d'), viewport: vp }).promise;
        setPdfDims({ w: vp.width, h: vp.height });
        setPdfReady(true);
      } catch (err) {
        console.error('[PDF render]', err);
      }
    })();
  }, [imageUrl, isPdf]);

  // ── Draw bbox overlay ────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    let W, H, ox, oy, rw, rh;

    if (isPdf) {
      if (!pdfReady || !pdfDims.w) return;
      W = pdfDims.w; H = pdfDims.h;
      ox = 0; oy = 0; rw = W; rh = H;
    } else {
      const img = imgRef.current;
      if (!img || !imgLoaded) return;
      W = img.offsetWidth; H = img.offsetHeight;
      const r = getRenderedRect(img);
      ox = r.x; oy = r.y; rw = r.w; rh = r.h;
    }

    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    if (!hasBbox) return;

    Object.entries(fieldBbox).forEach(([field, bbox]) => {
      if (!bbox || bbox.length !== 4) return;
      const [x1, y1, x2, y2] = bbox;
      const px = ox + x1 * rw;
      const py = oy + y1 * rh;
      const pw = (x2 - x1) * rw;
      const ph = (y2 - y1) * rh;
      if (pw <= 0 || ph <= 0) return;

      const color    = FIELD_COLORS[field] || '#ffffff';
      const isActive = field === activeField;
      const isHover  = field === hoveredField;

      ctx.save();
      if (isActive) {
        // Filled highlight + solid border + label tag
        ctx.fillStyle   = color + '28';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2.5;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 12;
        ctx.setLineDash([]);
        ctx.strokeRect(px, py, pw, ph);
        ctx.shadowBlur  = 0;

        // Label tag above the box
        ctx.font      = 'bold 10px sans-serif';
        const label   = field.replace(/_/g, ' ').toUpperCase();
        const textW   = ctx.measureText(label).width + 8;
        const tagH    = 16;
        const tagY    = py < tagH ? py + ph : py - tagH;
        ctx.fillStyle = color + 'dd';
        ctx.fillRect(px, tagY, textW, tagH);
        ctx.fillStyle = '#000';
        ctx.fillText(label, px + 4, tagY + tagH - 4);
      } else if (isHover) {
        ctx.strokeStyle = color + 'bb';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(px, py, pw, ph);
      } else {
        ctx.strokeStyle = color + '44';
        ctx.lineWidth   = 1;
        ctx.setLineDash([3, 6]);
        ctx.strokeRect(px, py, pw, ph);
      }
      ctx.restore();
    });
  }, [fieldBbox, activeField, hoveredField, imgLoaded, isPdf, pdfReady, pdfDims, hasBbox]);

  useEffect(() => { redraw(); }, [redraw]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [redraw]);

  // ── Hit-test: CSS click → normalized [0-1] → bbox match ─────────────────────
  const hitTest = useCallback((clientX, clientY) => {
    const canvas = overlayRef.current;
    if (!canvas || !fieldBbox) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;

    let mx, my;
    if (isPdf) {
      // Overlay canvas CSS size matches pdfBase CSS size (width:100% height:auto)
      mx = cx / rect.width;
      my = cy / rect.height;
    } else {
      const img = imgRef.current;
      if (!img) return null;
      const { x: ox, y: oy, w: rw, h: rh } = getRenderedRect(img);
      // Convert CSS px inside canvas → image pixel → normalize
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      mx = (cx * scaleX - ox) / rw;
      my = (cy * scaleY - oy) / rh;
    }

    let hit = null;
    Object.entries(fieldBbox).forEach(([field, bbox]) => {
      if (!bbox || bbox.length !== 4) return;
      const [x1, y1, x2, y2] = bbox;
      if (mx >= x1 && mx <= x2 && my >= y1 && my <= y2) hit = field;
    });
    return hit;
  }, [fieldBbox, isPdf]);

  const handleClick     = (e) => { if (onFieldClick) onFieldClick(hitTest(e.clientX, e.clientY)); };
  const handleMouseMove = (e) => { const f = hitTest(e.clientX, e.clientY); if (f !== hoveredField) setHoveredField(f); };
  const handleMouseLeave = () => setHoveredField(null);

  const overlayStyle = {
    position: 'absolute', top: 0, left: 0,
    width: '100%', height: '100%',
    cursor: hasBbox ? 'crosshair' : 'default',
    pointerEvents: hasBbox ? 'auto' : 'none',
  };

  return (
    <div ref={containerRef} style={{ width: '100%' }}>

      {/* ── PDF mode ────────────────────────────────────────────────────────── */}
      {isPdf && (
        <div style={{
          position: 'relative', width: '100%',
          maxHeight: '75vh', overflowY: 'auto',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          background: '#fff',
        }}>
          {/* Base: PDF page rendered to canvas */}
          <canvas
            ref={pdfBaseRef}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          {/* Overlay: bounding boxes */}
          {pdfReady && (
            <canvas
              ref={overlayRef}
              width={pdfDims.w}
              height={pdfDims.h}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={overlayStyle}
            />
          )}
          {!pdfReady && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              color: '#555', fontSize: '13px',
            }}>
              Rendering PDF…
            </div>
          )}
        </div>
      )}

      {/* ── Image mode ──────────────────────────────────────────────────────── */}
      {!isPdf && (
        <div style={{ position: 'relative', width: '100%' }}>
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Uploaded Invoice"
            onLoad={() => setImgLoaded(true)}
            style={{
              width: '100%', maxHeight: '420px',
              objectFit: 'contain', display: 'block',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: '#fff',
            }}
          />
          {imgLoaded && (
            <canvas
              ref={overlayRef}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={overlayStyle}
            />
          )}
        </div>
      )}

      {hasBbox && (
        <div style={{
          fontSize: '10px', color: 'var(--text-secondary)',
          textAlign: 'center', marginTop: '4px', opacity: 0.65,
        }}>
          Click ⊕ on any field — or tap the {isPdf ? 'document' : 'image'} — to highlight its source location
        </div>
      )}
    </div>
  );
}
