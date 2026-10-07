"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Finger/mouse signature for the client agreement. Produces a PNG data URL
 * (white background, navy ink) or null while empty. Pointer events cover
 * touch, pen and mouse; the canvas is scaled for sharp lines on Retina phones.
 */
export function SignaturePad({
  onChange,
  disabled,
  language,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  language: "en" | "ru";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);
  const ru = language === "ru";

  function setup() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#10253f";
    ctx.lineWidth = 2.4;
  }

  useEffect(() => {
    setup();
  }, []);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = event.currentTarget.getContext("2d");
    const p = point(event);
    if (!ctx || !last.current) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk.current) {
      hasInk.current = true;
      setEmpty(false);
    }
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk.current) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    setup();
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="rp-signature">
      <div className="rp-signature-head">
        <span>{ru ? "Подпись" : "Signature"}</span>
        <button type="button" onClick={clear} disabled={disabled || empty} className="rp-link-button">
          {ru ? "Стереть" : "Clear"}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="rp-signature-canvas"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        aria-label={ru ? "Поле для подписи пальцем" : "Sign here with your finger"}
      />
      {empty ? <div className="rp-signature-hint">{ru ? "Распишитесь пальцем или мышью" : "Sign with your finger or mouse"}</div> : null}
    </div>
  );
}
