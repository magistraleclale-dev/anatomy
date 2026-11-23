// Fig: the heart as a double piston pump on a bench.
// Two identical pumps share one septum. Each has an atrium (reservoir with a small primer piston),
// an inlet poppet valve (tricuspid / mitral), a ventricle (barrel with a piston whose height is its volume),
// an outlet poppet valve (pulmonary / aortic) and an artery (a windkessel chamber), plus a manometer.
// Everything that moves is driven by model.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import { EDV, ESV, heartAt, PHASES } from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 600;
const HEIGHT = 350;

// World layout (units ~ px). x runs right heart (−) to left heart (+), y toward the front.
const PLATE = { x: -170, y: -64, w: 340, d: 144, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;
const MAN_H = 10;
const SIDE_X = { right: -88, left: 88 };

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);

// Per-side geometry, relative to the side's x.
const GEO = (X) => ({
  manifold: { x: X - 66, y: -46, w: 128, d: 76, r: 4 },
  atrium: [X - 46, -18],
  artery: [X + 44, -18],
  av: [X - 24, 14],
  sl: [X + 24, 14],
  ventricle: [X, -18],
  gauge: [X, 47],
});

const V = { flangeR: 25, barrelR: 21, z0: MAN_H, flangeTop: MAN_H + 3, topFlange: 49, topFlangeH: 4, glandR: 8, glandTop: 58 };
const pistonZ = (vol) => V.glandTop + 8 + (vol - ESV) * 0.36;
const A = { r: 15, top: 40, lidTop: 43, collarTop: 47 };
const HOUSING_TOP = MAN_H + 7;
const GAUGE = { r: 15, z: 16, h: 7 };
const GAUGE_TOP = GAUGE.z + GAUGE.h;
const SWEEP = { from: (-3 * Math.PI) / 4, span: (3 * Math.PI) / 2, max: 150 };

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [SIDE_X.right, -18, pistonZ(EDV) + 4],
    [SIDE_X.left, -18, pistonZ(EDV) + 4],
    [SIDE_X.right + 44, -18, 76],
    [SIDE_X.left + 44, -18, 76],
  ],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 60 },
);

const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---------- Dynamic parts: rebuilt per frame in the page from the same source ----------
function pistonSvg(cx, cy, z, lit) {
  const rod = k.cylinder(cx, cy, 2.6, V.glandTop, z - V.glandTop, P, 20);
  const cap = k.cylinder(cx, cy, 7, z, 4, P, 36, 0.5);
  return (
    k.solidSvg(rod, { tone: "hi", crease: "none", lit }) +
    k.solidSvg(cap, { tone: "hi", crease: "lo", lit }) +
    k.lineSvg(k.knurl(cx, cy, 7, z + 0.6, z + 3.4, 30, P, 0.3), { tone: "lo" }) +
    k.lineSvg(k.ring(cx, cy, 4.4, z + 4, P, 28), { tone: "lo" }) +
    k.dotsSvg([k.iso([cx, cy, z + 4], P)], { size: 0.55, tone: "hi" })
  );
}
function poppetSvg(cx, cy, open) {
  const lift = 0.2 + open * 4.2;
  const z = HOUSING_TOP + lift;
  const stem = lift > 0.5 ? k.solidSvg(k.cylinder(cx, cy, 1.1, HOUSING_TOP, lift, P, 14), { tone: "mid", crease: "none" }) : "";
  return stem + k.solidSvg(k.cylinder(cx, cy, 4.1, z, 1.4, P, 28, 0.3), { tone: "hi", crease: "lo" }) + k.dotsSvg([k.iso([cx, cy, z + 1.4], P)], { size: 0.45, tone: "mid" });
}
function primerSvg(cx, cy, push) {
  const z = A.collarTop + 0.6 + 2.6 * (1 - push);
  return (
    k.solidSvg(k.cylinder(cx, cy, 1.6, A.collarTop, z - A.collarTop, P, 14), { tone: "mid", crease: "none" }) +
    k.solidSvg(k.cylinder(cx, cy, 4.6, z, 2.8, P, 28, 0.4), { tone: "hi", crease: "lo" }) +
    k.lineSvg(k.knurl(cx, cy, 4.6, z + 0.4, z + 2.4, 20, P, 0.3), { tone: "lo" })
  );
}
function needleD(cx, cy, mmHg) {
  const angle = SWEEP.from + (Math.min(SWEEP.max, Math.max(0, mmHg)) / SWEEP.max) * SWEEP.span;
  const reach = GAUGE.r - 4;
  return k.lineOnTop([cx - Math.sin(angle) * 3, cy + Math.cos(angle) * 3], [cx + Math.sin(angle) * reach, cy - Math.cos(angle) * reach], GAUGE_TOP + 0.2, P);
}

// ---------- Static parts ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // ruler strip along the front edge
  const strip = { x: -116, y: PLATE.y + PLATE.d - 14, w: 270, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate, front left
  const label = { x: -160, y: 38, w: 34, d: 22, r: 1.5 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 7], [label.x + 28, label.y + 7], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 11], [label.x + 22, label.y + 11], 0.8, P), { tone: "lo", free: true }));
  out.push(L(k.lineOnTop([label.x + 5, label.y + 15], [label.x + 25, label.y + 15], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.4 }));
  return out.join("");
}

// A closed slot engraved on the manifold top between two floor points: the bored channel under it.
function slot(a, b, w) {
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy);
  const ox = (-dy / n) * w / 2, oy = (dx / n) * w / 2;
  return k.onTop([[a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy]], MAN_H, P, true);
}

function manifold(G) {
  const m = G.manifold;
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(m, 2), 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(m, 0, MAN_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(m, 4, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(m, 3), MAN_H, P, 4), { tone: "faint" }));
  const screws = k.corners(m, 6);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.8, MAN_H, P, 14)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, MAN_H])), { size: 0.45 }));
  const toward = (from, to, by) => { const dx = to[0] - from[0], dy = to[1] - from[1], n = Math.hypot(dx, dy); return [from[0] + (dx / n) * by, from[1] + (dy / n) * by]; };
  const channels = [
    [G.atrium, G.av, 18.5, 7.5],
    [G.av, G.ventricle, 7.5, 26.5],
    [G.ventricle, G.sl, 26.5, 7.5],
    [G.sl, G.artery, 7.5, 15.5],
  ];
  out.push(L(channels.map(([a, b, ra, rb]) => { const n = Math.hypot(b[0] - a[0], b[1] - a[1]); return slot(toward(a, b, ra), toward(a, b, n - rb), 3.2); }).join(""), { tone: "faint" }));
  return out.join("");
}

function septum() {
  const s = { x: -5, y: -46, w: 10, d: 76, r: 2 };
  const out = [S(k.slabOf(s, 0, 26, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(s, MAN_H, P, 3), { tone: "faint" }) })];
  out.push(L(k.planOutline(k.insetPlan(s, 2.4), 26, P, 3), { tone: "faint" }));
  out.push(D([-40, -20, 0, 20].map((y) => at([0, y, 26])), { size: 0.45 }));
  out.push(L([-30, -10, 10].map((y) => k.segment([5, y, 0], [5, y, 26], P)).join(""), { tone: "faint" }));
  return out.join("");
}

function atrium([x, y], side) {
  const out = [];
  out.push(S(k.cylinder(x, y, A.r + 2, MAN_H, 2, P, 40), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, A.r, MAN_H + 2, A.top - MAN_H - 2, P, 48), { tone: "mid", crease: "none", inner: L(k.sideArc(x, y, A.r, 26, P, 28), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, A.r + 1.5, A.top, A.lidTop - A.top, P, 48, 0.5), { tone: "mid" }));
  const bolts = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.2; return [x + Math.cos(a) * (A.r - 1), y + Math.sin(a) * (A.r - 1)]; });
  out.push(D(bolts.map(([bx, by]) => at([bx, by, A.lidTop])), { size: 0.4, tone: "mid" }));
  // inflow ports: venae cavae (right) / pulmonary veins (left)
  for (const [dx, dy] of byDepth([[-10, -4], [6, -10]].map(([dx, dy]) => [x + dx, y + dy]))) {
    out.push(S(k.cylinder(dx, dy, 2.8, A.lidTop, 6, P, 20), { tone: "mid", inner: L(k.sideArc(dx, dy, 2.8, A.lidTop + 2, P, 12), { tone: "faint" }) }));
    out.push(L(k.ring(dx, dy, 1.6, A.lidTop + 6, P, 16), { tone: "lo" }));
  }
  out.push(S(k.cylinder(x, y, 6, A.lidTop, A.collarTop - A.lidTop, P, 28), { tone: "mid" }));
  out.push(`<g data-part="primer-${side}">${primerSvg(x, y, 0)}</g>`);
  return out.join("");
}

function artery([x, y]) {
  const out = [];
  out.push(S(k.cylinder(x, y, 14, MAN_H, 2, P, 40), { tone: "mid" }));
  const inner = L(k.sideArc(x, y, 12, 30, P, 24) + k.sideArc(x, y, 12, 44, P, 24), { tone: "faint" });
  out.push(S(k.cylinder(x, y, 12, MAN_H + 2, 58 - MAN_H - 2, P, 44), { tone: "mid", crease: "none", inner }));
  out.push(S(k.cylinder(x, y, 12.8, 58, 3, P, 44, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 10, 61, 3, P, 40), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 7, 64, 2.4, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 3.2, 66.4, 7, P, 20), { tone: "mid", inner: L(k.sideArc(x, y, 3.2, 69, P, 12), { tone: "faint" }) }));
  out.push(L(k.ring(x, y, 2, 73.4, P, 16), { tone: "lo" }));
  const bolts = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return [x + Math.cos(a) * 11.2, y + Math.sin(a) * 11.2]; });
  out.push(D(bolts.map(([bx, by]) => at([bx, by, 61])), { size: 0.4, tone: "mid" }));
  return out.join("");
}

function valve([x, y], name) {
  const out = [];
  out.push(S(k.cylinder(x, y, 6.5, MAN_H, 2, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 5, MAN_H + 2, HOUSING_TOP - MAN_H - 2, P, 28, 0.4), { tone: "mid" }));
  out.push(L(k.ring(x, y, 4.4, HOUSING_TOP, P, 24), { tone: "lo" }));
  const bolts = [0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; return [x + Math.cos(a) * 5.8, y + Math.sin(a) * 5.8]; });
  out.push(D(bolts.map(([bx, by]) => at([bx, by, MAN_H + 2])), { size: 0.4, tone: "mid" }));
  out.push(`<g data-part="${name}">${poppetSvg(x, y, 0)}</g>`);
  return out.join("");
}

function ventricle([x, y], side) {
  const out = [];
  const view = k.towardViewer(P);
  const rods = [0, 1, 2, 3].map((i) => { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; return [x + Math.cos(a) * 23, y + Math.sin(a) * 23]; });
  const front = (p) => (p[0] - x) * view[0] + (p[1] - y) * view[1] > 0;
  const rod = ([rx, ry]) => S(k.cylinder(rx, ry, 1.1, V.flangeTop, V.topFlange - V.flangeTop, P, 12), { tone: "mid", crease: "none" });
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 22, y: y - 22, w: 44, d: 44, r: 22 }, MAN_H, 0.1, P)}" style="filter:blur(4px)"/>`);
  out.push(S(k.cylinder(x, y, V.flangeR, MAN_H, 3, P, 56, 0.5), { tone: "mid" }));
  out.push(D(byDepth(rods).map(([rx, ry]) => at([rx, ry, V.flangeTop])), { size: 0.5, tone: "mid" }));
  out.push(byDepth(rods).filter((p) => !front(p)).map(rod).join(""));
  const bands = L(k.sideArc(x, y, V.barrelR, 22, P, 40) + k.sideArc(x, y, V.barrelR, 40, P, 40), { tone: "lo" });
  out.push(S(k.cylinder(x, y, V.barrelR, V.flangeTop, V.topFlange - V.flangeTop, P, 64), { tone: "hi", crease: "none", inner: bands }));
  out.push(byDepth(rods).filter(front).map(rod).join(""));
  out.push(S(k.cylinder(x, y, V.flangeR, V.topFlange, V.topFlangeH, P, 56, 0.5), { tone: "mid" }));
  for (const [rx, ry] of byDepth(rods)) out.push(S(k.cylinder(rx, ry, 2, V.topFlange + V.topFlangeH, 1.6, P, 6), { tone: "mid", crease: "none" }));
  const top = V.topFlange + V.topFlangeH;
  out.push(L(k.ring(x, y, 12, top, P, 40), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, V.glandR + 2, top, 1.4, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, V.glandR, top + 1.4, V.glandTop - top - 1.4, P, 32, 0.4), { tone: "mid" }));
  out.push(L(k.ring(x, y, 3.2, V.glandTop, P, 18), { tone: "lo" }));
  out.push(`<g data-part="piston-${side}">${pistonSvg(x, y, pistonZ(EDV), side === "left")}</g>`);
  return out.join("");
}

function gauge([x, y], G, side) {
  const out = [];
  out.push(S(k.cylinder(x, y, 5, 0, 2.5, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.2, 2.5, GAUGE.z - 2.5, P, 16), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, GAUGE.r, GAUGE.z, GAUGE.h, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, GAUGE.r, GAUGE_TOP - 3, GAUGE_TOP, 70, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, GAUGE.r, GAUGE_TOP - 3, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, GAUGE.r - 2, GAUGE_TOP, P, 56), { tone: "lo" }));
  const t = k.radialTicks(x, y, GAUGE.r - 2.6, 30, 5, GAUGE_TOP, [1.1, 2.4], P, SWEEP.from, SWEEP.span);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(k.ring(x, y, 1.4, GAUGE_TOP, P, 14), { tone: "mid" }));
  if (side === "left") out.push(k.faceTextSvg(k.topMatrix([x, y + 6.5], GAUGE_TOP, P, "x"), "mmHg", { size: 2.2, tone: "lo", anchor: "middle" }));
  out.push(`<path data-part="needle-${side}" class="iso-line" data-tone="hi" data-free="start" d="${needleD(x, y, 0)}" style="stroke-width:1.1"/>`);
  return out.join("");
}

function senseLine(G) {
  const [gx, gy] = G.gauge;
  const m = G.manifold;
  const from = [gx - 8, m.y + m.d, 5];
  const to = [gx - 3.6, gy - 3.4, 1.4];
  return k.wireSvg(at(from), at(to), { via: [at([gx - 8, m.y + m.d + 6, 0.6]), at([gx - 8, gy - 8, 0.6])], tone: "lo" });
}

function pacemaker(G) {
  const [ax, ay] = G.atrium;
  const box = { x: ax - 12, y: ay + 26, w: 12, d: 12, r: 2 };
  const top = MAN_H + 8;
  const out = [S(k.slabOf(box, MAN_H, 8, P, 3, 0.5), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(box, 2), top, P, 3), { tone: "faint" }));
  const c = [box.x + 6, box.y + 6];
  out.push(L(k.ring(c[0], c[1], 2.2, top, P, 16), { tone: "lo" }));
  out.push(`<g data-part="node">${D([at([c[0], c[1], top])], { size: 1.1, tone: "hi" })}</g>`);
  const dir = [-0.18, 0.98];
  const land = [ax + dir[0] * A.r, ay + dir[1] * A.r, 32];
  out.push(k.wireSvg(at([box.x + 6, box.y + 3, top]), at(land), { via: [at([box.x + 6, box.y + 3, top + 12]), at([land[0] - 0.4, land[1] + 2.5, 32])], tone: "lo" }));
  return out.join("");
}

function sideSvg(side) {
  const X = SIDE_X[side];
  const G = GEO(X);
  const items = [
    { at: G.atrium, svg: atrium(G.atrium, side) },
    { at: G.artery, svg: artery(G.artery) },
    { at: G.av, svg: valve(G.av, `av-${side}`) },
    { at: G.sl, svg: valve(G.sl, `sl-${side}`) },
    { at: G.ventricle, svg: ventricle(G.ventricle, side) },
    { at: G.gauge, svg: gauge(G.gauge, G, side) },
  ];
  if (side === "right") items.push({ at: [G.atrium[0] - 6, G.atrium[1] + 32], svg: pacemaker(G) });
  items.sort((a, b) => k.depthOf([a.at[0], a.at[1], 0], P) - k.depthOf([b.at[0], b.at[1], 0], P));
  return manifold(G) + senseLine(G) + items.map((i) => i.svg).join("");
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Il cuore costruito come una doppia pompa a pistone su un banco. A sinistra il cuore destro, a destra il cuore sinistro, separati da un setto. Ogni metà ha un atrio con un piccolo pistone di adescamento, una valvola d'ingresso a fungo (tricuspide o mitrale), un ventricolo a cilindro il cui pistone sale con il volume, una valvola d'uscita (polmonare o aortica) e un'arteria a camera d'aria. Due manometri leggono la pressione nei ventricoli: stessi 70 mL per battito, pressioni molto diverse.",
  body: [plate(), sideSvg("right"), septum(), sideSvg("left")],
});

// ---------- Live code ----------
const source = (file) => readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const GEOS = { right: GEO(SIDE_X.right), left: GEO(SIDE_X.left) };
const live = `
${source("model.mjs")}
const k = { cylinder, solidSvg, lineSvg, dotsSvg, knurl, ring, iso, lineOnTop };
const P = ${JSON.stringify(P)};
const V = ${JSON.stringify(V)}, A = ${JSON.stringify(A)}, HOUSING_TOP = ${HOUSING_TOP}, GAUGE = ${JSON.stringify(GAUGE)}, GAUGE_TOP = ${GAUGE_TOP};
const SWEEP = ${JSON.stringify(SWEEP)};
const GEOS = ${JSON.stringify(GEOS)};
const pistonZ = ${pistonZ.toString()};
${pistonSvg.toString()}
${poppetSvg.toString()}
${primerSvg.toString()}
${needleD.toString()}
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const parts = {};
for (const side of ["right", "left"]) {
  parts[side] = { piston: part("piston-" + side), primer: part("primer-" + side), av: part("av-" + side), sl: part("sl-" + side), needle: part("needle-" + side), open: { av: 0, sl: 0 }, shown: {} };
}
const node = part("node");
const BPM = [45, 150];
let bpm = 72, target = 72, frac = 0.62, frame = 0, last = 0, visible = false, idle = 0;
const set = (el, key, html, store) => { if (store[key] !== html) { store[key] = html; el.innerHTML = html; } };
function draw(dt) {
  const T = 60 / bpm;
  const h = heartAt(frac * T, bpm);
  for (const side of ["right", "left"]) {
    const s = h[side], p = parts[side], G = GEOS[side];
    const ease = still.matches || !dt ? 1 : 1 - Math.exp(-dt / 0.035);
    p.open.av += (s.av - p.open.av) * ease;
    p.open.sl += (s.sl - p.open.sl) * ease;
    const r = (v) => Math.round(v * 20) / 20;
    set(p.piston, "piston", pistonSvg(G.ventricle[0], G.ventricle[1], r(pistonZ(s.V)), side === "left"), p.shown);
    set(p.primer, "primer", primerSvg(G.atrium[0], G.atrium[1], r(s.atrial)), p.shown);
    set(p.av, "av", poppetSvg(G.av[0], G.av[1], r(p.open.av)), p.shown);
    set(p.sl, "sl", poppetSvg(G.sl[0], G.sl[1], r(p.open.sl)), p.shown);
    p.needle.setAttribute("d", needleD(G.gauge[0], G.gauge[1], s.P));
  }
  const u = (frac % 1) * T;
  node.style.opacity = String(0.25 + 0.75 * Math.exp(-Math.max(0, (u < T - 0.12 ? u + 0.12 : u - T + 0.12)) / 0.07));
  const text = PHASES[h.phase] + " · VS " + Math.round(h.left.P) + " · VD " + Math.round(h.right.P) + " mmHg · " + Math.round(bpm) + " bpm";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(bpm)));
  stage.setAttribute("aria-valuetext", Math.round(bpm) + " battiti al minuto, " + PHASES[h.phase] + ", gittata " + (h.output).toFixed(1) + " L/min");
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 0;
  last = now;
  if (still.matches) { bpm = target; frac = 0.97; draw(0); frame = 0; return; }
  bpm += (target - bpm) * (1 - Math.exp(-dt / 0.6));
  frac += dt / (60 / bpm);
  draw(dt);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => { target = Math.min(BPM[1], Math.max(BPM[0], next)); clearTimeout(idle); idle = setTimeout(() => { target = 72; run(); }, 5000); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = Math.min(1, Math.max(0, ((event.clientX - box.left) / box.width - 0.15) / 0.7));
  steer(BPM[0] + share * (BPM[1] - BPM[0]));
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + 10;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - 10;
  if (event.key === "Home") to = BPM[0];
  if (event.key === "End") to = BPM[1];
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
still.addEventListener("change", run);
draw(0);
`;

const first = heartAt(0.62 * (60 / 72), 72);
const body = k.plateHtml({
  fig: "Fig 1",
  title: "Il cuore come doppia pompa",
  hint: "Puntatore: 45–150 bpm",
  readout: `${PHASES[first.phase]} · VS ${Math.round(first.left.P)} · VD ${Math.round(first.right.P)} mmHg · 72 bpm`,
  keys: [
    { mark: "lit", label: "Pistone del ventricolo sinistro: la sua altezza è il volume (50–120 mL)" },
    { mark: "raised", label: "Valvole a fungo: si aprono solo quando la pressione le spinge" },
    { mark: "edge", label: "Manometri 0–150 mmHg sui due ventricoli" },
  ],
  caption:
    "Due pompe identiche battono insieme. A ogni battito ciascun ventricolo spinge fuori 70 mL dei suoi 120 (frazione di eiezione 58 %), ma il sinistro deve vincere un'aorta a 80 mmHg e arriva a 120, mentre il destro spinge nel circolo polmonare a soli 25. Il nodo senoatriale (il punto che lampeggia) dà il tempo; la sistole si accorcia con la radice del periodo, quindi a frequenze alte si accorcia soprattutto la diastole. Valori di un adulto a riposo.",
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Cuore a doppia pompa: frecce per cambiare la frequenza cardiaca" aria-valuemin="${45}" aria-valuemax="${150}" aria-valuenow="72">${svg}</div>`,
});

const name = theme === "light" ? "heart-pump-light.html" : "heart-pump.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Il cuore come doppia pompa", theme, body, script: kitScript() + live }));
console.log("wrote", name);
