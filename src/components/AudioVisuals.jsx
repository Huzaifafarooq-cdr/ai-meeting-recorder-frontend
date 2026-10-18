import { useEffect, useRef } from 'react';

export function Waveform({ analyserRef, active, paused, height = 96 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    const bars = 64;
    const history = new Array(bars).fill(0);
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const analyser = analyserRef.current;
      if (analyser && active && !paused && frame++ % 3 === 0) {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
        history.push(Math.min(1, peak * 2.2));
        history.shift();
      }

      const gap = 3;
      const barW = Math.max(2, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        const v = active ? history[i] : 0;
        const barH = Math.max(4, v * (h - 8));
        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        ctx.fillStyle = !active ? '#cbd5e1' : paused ? '#94a3b8' : `rgba(251, 94, 0, ${0.35 + 0.65 * (i / bars)})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, active, paused]);

  return <canvas ref={canvasRef} className="block w-full" style={{ height }} role="img" aria-label={active ? 'Live audio waveform' : 'Audio waveform (idle)'} />;
}

export function LevelMeter({ analyserRef, active }) {
  const barRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    let raf;
    let smoothed = 0;
    let lastLabel = 0;
    const tick = () => {
      const analyser = analyserRef.current;
      let level = 0;
      if (analyser && active) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const db = 20 * Math.log10(Math.max(rms, 1e-5));
        level = Math.min(1, Math.max(0, (db + 60) / 60));
      }
      smoothed = smoothed * 0.8 + level * 0.2;
      if (barRef.current) {
        barRef.current.style.width = `${Math.round(smoothed * 100)}%`;
        barRef.current.style.backgroundColor = smoothed > 0.9 ? '#e11d48' : smoothed > 0.25 ? '#10b981' : '#f59e0b';
      }
      const now = performance.now();
      if (labelRef.current && now - lastLabel > 500) {
        lastLabel = now;
        labelRef.current.setAttribute('aria-valuenow', String(Math.round(smoothed * 100)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef, active]);

  return (
    <div ref={labelRef} role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div ref={barRef} className="h-full w-0 rounded-full transition-[background-color] duration-300" />
    </div>
  );
}
