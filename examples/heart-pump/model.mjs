// The cardiac cycle of a resting adult, as a pure function of time.
// Textbook values (Guyton & Hall, Wiggers diagram): EDV 120 mL, ESV 50 mL, SV 70 mL, EF 58 %;
// left ventricle 120/8 mmHg into an aorta at 120/80; right ventricle 25/4 into a pulmonary artery at 25/10.
// Both ventricles move the same volume every beat; only the pressure differs.

export const EDV = 120;
export const ESV = 50;
export const SV = EDV - ESV;

export const SIDES = {
  right: { name: "destro", peak: 25, artLow: 10, edp: 4, atrium: 2, kick: 3 },
  left: { name: "sinistro", peak: 120, artLow: 80, edp: 8, atrium: 6, kick: 5 },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

// Durations in seconds for a beat at `bpm`. Systole shortens with the square root of the period (Bazett).
export function timing(bpm) {
  const T = 60 / bpm;
  const ivc = 0.05;
  const systole = 0.33 * Math.sqrt(T);
  const eject = systole - ivc;
  const ivr = 0.08;
  const kick = Math.min(0.1, (T - systole - ivr) * 0.3);
  return { T, ivc, eject, ivr, kick, systole, fill: T - systole - ivr - kick };
}

export const PHASES = [
  "contrazione isovolumetrica",
  "eiezione",
  "rilasciamento isovolumetrico",
  "riempimento",
  "sistole atriale",
];

// State of one side at time t (seconds from the start of systole).
export function sideAt(t, bpm, side) {
  const S = SIDES[side];
  const m = timing(bpm);
  const u = ((t % m.T) + m.T) % m.T;
  const ejectShape = (s) => S.artLow + (S.peak - S.artLow) * Math.sin(Math.PI * 0.8 * s) / Math.sin(Math.PI * 0.5);
  const endEject = ejectShape(1);
  const out = { phase: 0, P: 0, V: EDV, art: 0, av: 0, sl: 0, atrial: 0 };
  if (u < m.ivc) {
    const s = u / m.ivc;
    out.phase = 0;
    out.P = S.edp + (S.artLow - S.edp) * smooth(s);
    out.V = EDV;
    out.art = S.artLow;
  } else if (u < m.systole) {
    const s = (u - m.ivc) / m.eject;
    out.phase = 1;
    out.P = ejectShape(s);
    out.V = EDV - SV * Math.sin((Math.PI / 2) * s) ** 1.2;
    out.art = out.P;
    out.sl = 1;
  } else if (u < m.systole + m.ivr) {
    const s = (u - m.systole) / m.ivr;
    out.phase = 2;
    out.P = endEject + (S.atrium - endEject) * smooth(s);
    out.V = ESV;
    out.art = endEject - (endEject - S.artLow) * 0.18 * s;
  } else {
    const since = u - m.systole - m.ivr;
    const diastole = m.fill + m.kick;
    const runoff = endEject - (endEject - S.artLow) * 0.18;
    out.art = S.artLow + (runoff - S.artLow) * (1 - since / diastole);
    out.av = 1;
    const passive = 0.85 * SV;
    if (since < m.fill) {
      const s = since / m.fill;
      out.phase = 3;
      out.V = ESV + passive * (1 - Math.exp(-s * 4.5)) / (1 - Math.exp(-4.5));
      out.P = S.atrium + 1.5 * s;
    } else {
      const s = (since - m.fill) / m.kick;
      out.phase = 4;
      out.atrial = Math.sin(Math.PI * s);
      out.V = ESV + passive + (SV - passive) * smooth(s);
      out.P = S.atrium + 1.5 + (S.edp - S.atrium - 1.5) * smooth(s) + S.kick * out.atrial * 0.4;
    }
  }
  return out;
}

export function heartAt(t, bpm) {
  const right = sideAt(t, bpm, "right");
  const left = sideAt(t, bpm, "left");
  return { right, left, phase: left.phase, output: (SV * bpm) / 1000 };
}
