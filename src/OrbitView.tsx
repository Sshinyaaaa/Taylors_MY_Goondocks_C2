import { useEffect, useRef, useState } from "react";

// 2D mission-control orbit view. Pure mock visuals: no real trajectory data is drawn here.
export default function OrbitView() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tca, setTca] = useState(18 * 3600 + 42 * 60);

  useEffect(() => { const i = setInterval(() => setTca((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(i); }, []);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const draw = (time: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.17;

      // stars
      ctx.fillStyle = "#3f3f46";
      for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % w, (i * 53) % h, 1, 1);

      // earth
      const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R);
      g.addColorStop(0, "#1e3a5f"); g.addColorStop(1, "#0b1220");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#155e75"; ctx.lineWidth = 1; ctx.stroke();

      const t = time / 1000;
      const orbit = (rx: number, ry: number, rot: number, color: string) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1; ctx.setLineDash([]);
      };
      const pos = (rx: number, ry: number, rot: number, a: number) => {
        const x = rx * Math.cos(a), y = ry * Math.sin(a);
        return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)];
      };
      const A = { rx: R * 2.1, ry: R * 1.5, rot: -0.35 }, B = { rx: R * 2.0, ry: R * 1.62, rot: 0.25 };
      orbit(A.rx, A.ry, A.rot, "#f59e0b"); orbit(B.rx, B.ry, B.rot, "#06b6d4");

      // conjunction point: where the two ellipses nearly meet (fixed mock location)
      const [px, py] = pos(A.rx, A.ry, A.rot, -0.95);
      const pulse = 1 + 0.15 * Math.sin(t * 3);
      ctx.strokeStyle = "#ef4444"; ctx.fillStyle = "rgba(239,68,68,0.10)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 22 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fca5a5"; ctx.font = "11px ui-monospace, monospace";
      ctx.fillText("5 km WARNING BUBBLE", px + 28, py - 6);
      ctx.fillText("PREDICTED MISS 2.4 km", px + 28, py + 8);

      const sat = (x: number, y: number, color: string, label: string) => {
        ctx.fillStyle = color; ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.font = "11px ui-monospace, monospace"; ctx.fillText(label, x + 8, y - 8);
      };
      const [ax, ay] = pos(A.rx, A.ry, A.rot, -0.95 - 0.9 + ((t * 0.05) % 0.9));
      const [bx, by] = pos(B.rx, B.ry, B.rot, -1.55 - 0.9 + ((t * 0.05) % 0.9));
      sat(ax, ay, "#f59e0b", "USA-326 (Classified DoD)");
      sat(bx, by, "#06b6d4", "Starlink-4921 (Commercial)");
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hh = Math.floor(tca / 3600), mm = Math.floor((tca % 3600) / 60), ss = tca % 60;
  return (
    <div className="relative border border-zinc-800 rounded-lg bg-black overflow-hidden">
      <canvas ref={ref} className="w-full h-[320px] block" />
      <div className="absolute top-3 left-3 font-mono text-xs text-zinc-400">ORBIT VIEW · ECI (mock)</div>
      <div className="absolute top-3 right-3 font-mono text-right">
        <div className="text-[10px] text-zinc-500">TIME TO CLOSEST APPROACH</div>
        <div className="text-lg text-red-400">TCA T-{hh}h {String(mm).padStart(2, "0")}m <span className="text-xs text-red-500/70">{String(ss).padStart(2, "0")}s</span></div>
      </div>
    </div>
  );
}
