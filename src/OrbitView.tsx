import { useEffect, useRef, useState } from "react";

// Mission-control orbit view: a rotatable pseudo-3D Earth with both tracks and the conjunction
// point (visual design adapted from the team's OrbitalCanvas). Pure mock visuals: no real
// trajectory data is drawn, and nothing here touches TideCloak.
//
// Camera state lives in refs so the animation loop never re-renders React.

const HOME = { yaw: 0.45, pitch: 0.32 };

export default function OrbitView({ dodIngested, starlinkIngested, resolved }: {
  dodIngested: boolean;
  starlinkIngested: boolean;
  resolved: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ ...HOME, zoom: 1, dragging: false, lastX: 0, lastY: 0 });
  const timeRef = useRef(0.72);
  const props = useRef({ dodIngested, starlinkIngested, resolved });
  props.current = { dodIngested, starlinkIngested, resolved };

  const [timeProgress, setTimeProgress] = useState(0.72);
  const [tca, setTca] = useState(18 * 3600 + 42 * 60);

  useEffect(() => { const i = setInterval(() => setTca((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { timeRef.current = timeProgress; }, [timeProgress]);

  useEffect(() => {
    const canvas = canvasRef.current!, box = boxRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0, liveOffset = 0;

    const render = (ts: number) => {
      const { dodIngested, starlinkIngested, resolved } = props.current;
      const c = cam.current;
      const w = Math.max(300, Math.floor(box.clientWidth)), h = Math.max(300, Math.floor(box.clientHeight));
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!c.dragging) { c.yaw += 0.002; liveOffset += 0.012; }
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.3 * c.zoom;

      // grid
      ctx.strokeStyle = "rgba(39,39,42,0.4)"; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const P = (x: number, y: number, z: number) => {
        const x1 = x * Math.cos(c.yaw) - z * Math.sin(c.yaw);
        const z1 = x * Math.sin(c.yaw) + z * Math.cos(c.yaw);
        const y2 = y * Math.cos(c.pitch) - z1 * Math.sin(c.pitch);
        return { px: cx + x1 * R, py: cy + y2 * R };
      };

      // atmosphere + planet + wireframe
      const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.4);
      glow.addColorStop(0, "rgba(14,116,144,0.22)"); glow.addColorStop(1, "rgba(9,9,11,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2); ctx.fill();
      const pg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
      pg.addColorStop(0, "#0f172a"); pg.addColorStop(0.8, "#082f49"); pg.addColorStop(1, "#020617");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(56,189,248,0.45)"; ctx.lineWidth = 1.1;
      for (let lat = -60; lat <= 60; lat += 30) {
        const lr = (lat * Math.PI) / 180, rl = Math.cos(lr), yl = Math.sin(lr);
        ctx.beginPath();
        for (let lon = 0; lon <= 360; lon += 8) {
          const a = (lon * Math.PI) / 180, p = P(rl * Math.cos(a), yl, rl * Math.sin(a));
          lon === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(56,189,248,0.7)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

      // tracks
      const S = 1.28;
      const dod = (t: number) => { const i = (62 * Math.PI) / 180; return { x: S * Math.cos(t), y: S * Math.sin(t) * Math.sin(i), z: S * Math.sin(t) * Math.cos(i) }; };
      const star = (t: number) => {
        const i = (-53 * Math.PI) / 180, shift = resolved ? 0.16 : 0, r = resolved ? S + 0.1 : S, a = t - 1.7;
        return { x: r * Math.cos(a), y: r * Math.sin(a) * Math.sin(i) + shift, z: r * Math.sin(a) * Math.cos(i) };
      };
      const track = (fn: (t: number) => { x: number; y: number; z: number }, color: string, width: number) => {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.05; a += 0.05) { const v = fn(a), p = P(v.x, v.y, v.z); a === 0 ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py); }
        ctx.stroke();
      };
      track(dod, dodIngested ? "rgba(245,158,11,0.85)" : "rgba(245,158,11,0.3)", dodIngested ? 2.2 : 1.2);
      track(star, resolved ? "rgba(16,185,129,0.9)" : starlinkIngested ? "rgba(6,182,212,0.85)" : "rgba(6,182,212,0.3)", starlinkIngested ? 2.2 : 1.2);

      // conjunction point with 5 km warning bubble
      const cv = dod(0.85), cp = P(cv.x, cv.y, cv.z), pulse = (Math.sin(ts / 180) + 1) / 2;
      ctx.beginPath(); ctx.arc(cp.px, cp.py, 16 + pulse * 12, 0, Math.PI * 2);
      ctx.fillStyle = resolved ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.3)"; ctx.fill();
      ctx.strokeStyle = resolved ? "#10b981" : "#ef4444"; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.font = "10px ui-monospace, monospace"; ctx.fillStyle = resolved ? "#6ee7b7" : "#fca5a5";
      ctx.textAlign = "right";
      ctx.fillText(resolved ? "CLEAR · 18.2 km" : "5 km WARNING BUBBLE", cp.px - 32, cp.py + 4);
      ctx.textAlign = "left";

      // satellites
      const base = 0.85 - (1 - timeRef.current) * 0.9 + liveOffset * 0.2;
      const dn = dod(base), sn = star(base + 0.85);
      const dp = P(dn.x, dn.y, dn.z), sp = P(sn.x, sn.y, sn.z);
      ctx.font = "bold 11px ui-monospace, monospace";
      ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(dp.px, dp.py, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fcd34d"; ctx.fillText("USA-326 (Classified DoD)", dp.px + 12, dp.py - 4);
      ctx.fillStyle = resolved ? "#10b981" : "#06b6d4"; ctx.beginPath(); ctx.arc(sp.px, sp.py, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = resolved ? "#6ee7b7" : "#67e8f9";
      ctx.fillText(resolved ? "Starlink-4921 [+0.38 m/s BURN]" : "Starlink-4921 (Commercial)", sp.px + 12, sp.py + 16);

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  const down = (e: React.PointerEvent) => {
    const c = cam.current; c.dragging = true; c.lastX = e.clientX; c.lastY = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const c = cam.current; if (!c.dragging) return;
    c.yaw += (e.clientX - c.lastX) * 0.008;
    c.pitch = Math.max(-1.2, Math.min(1.2, c.pitch + (e.clientY - c.lastY) * 0.008));
    c.lastX = e.clientX; c.lastY = e.clientY;
  };
  const up = () => { cam.current.dragging = false; };
  const zoomBy = (d: number) => { cam.current.zoom = Math.max(0.65, Math.min(1.5, cam.current.zoom + d)); };

  const hh = Math.floor(tca / 3600), mm = Math.floor((tca % 3600) / 60), ss = tca % 60;
  const ctrl = "w-7 h-7 grid place-items-center bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-sm";

  return (
    <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2 pb-2 mb-2 border-b border-zinc-800">
        <span className="font-mono text-xs tracking-wider text-zinc-300">LEO CONJUNCTION VIEW · 550 km SHELL</span>
        <span className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded border border-violet-500/70 text-violet-300 bg-violet-950/40">SIMULATED RADAR &amp; ORBITS</span>
        <span className={`ml-auto font-mono text-[11px] px-2 py-0.5 rounded-full border ${resolved ? "border-emerald-700 text-emerald-300 bg-emerald-950/60" : "border-red-700 text-red-300 bg-red-950/60 animate-pulse"}`}>
          {resolved ? "SAFE SEPARATION · 18.2 km" : "PREDICTED MISS · 2.4 km"}
        </span>
      </div>

      <div ref={boxRef}
        className="relative h-[340px] bg-zinc-950 rounded border border-zinc-800/80 overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
        <div className="absolute top-2 left-3 font-mono text-right pointer-events-none">
          <div className="text-[10px] text-zinc-500 text-left">TIME TO CLOSEST APPROACH</div>
          <div className="text-lg text-red-400">TCA T-{hh}h {String(mm).padStart(2, "0")}m <span className="text-xs text-red-500/70">{String(ss).padStart(2, "0")}s</span></div>
        </div>
        <div className="absolute top-2 right-2 flex flex-col gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
          <button className={ctrl} title="Zoom in" onClick={() => zoomBy(0.15)}>+</button>
          <button className={ctrl} title="Zoom out" onClick={() => zoomBy(-0.15)}>−</button>
          <button className={ctrl} title="Reset camera" onClick={() => Object.assign(cam.current, HOME, { zoom: 1 })}>⟲</button>
        </div>
        <div className="absolute bottom-2 left-3 font-mono text-[10px] text-zinc-600 pointer-events-none">drag to rotate</div>
      </div>

      <div className="mt-2 flex items-center gap-3 font-mono text-[11px]">
        <span className="text-zinc-400 whitespace-nowrap">Scrub T-{((1 - timeProgress) * 18.5).toFixed(1)}h</span>
        <input type="range" min={0} max={1} step={0.01} value={timeProgress}
          onChange={(e) => setTimeProgress(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
        <span className="text-amber-400 whitespace-nowrap">TCA</span>
      </div>
    </div>
  );
}
