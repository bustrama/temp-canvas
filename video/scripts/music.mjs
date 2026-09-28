/**
 * The promo's music, written as code: a small offline synthesizer (no dependencies) that renders the
 * soundtrack sample-aligned to the video, into public/music/theme.wav.
 *
 * Timing: 112.5 BPM, which is 16 video frames per beat and 64 per bar, counted from "Draw it with
 * your pen." (frame 98). src/Promo.tsx cuts on that grid, so the music changes with the picture:
 *
 *   bar -1.5  "Explaining with a mouse?"  a muffled chord and a riser
 *   bar 0     "Draw it with your pen."    the groove starts (frame 98)
 *   bar 1     title                       the tune starts (162)
 *   bar 2     live ink                    arpeggio (226)
 *   bar 4.5   five people                 four on the floor (386)
 *   bar 6     end logo                    home to F, left to ring (482)
 *
 *   npm run music             (writes the WAV, then the AAC copy the video uses)
 *   node scripts/music.mjs --stats
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const FPS = 30;
/** The video's length in frames (DURATION in src/Promo.tsx). */
const FRAMES = 632;
const N = Math.ceil((FRAMES / FPS) * SR);
const BEAT = 16 / FPS;
/** Seconds at a bar and beat (bar 0 starts on "Draw it with your pen."). */
const at = (bar, beat = 0) => (98 + (bar * 4 + beat) * 16) / FPS;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// Deterministic randomness: every render of the track is identical.
let seed = 0x2f6b1c3d;
function rand() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
const noise = () => rand() * 2 - 1;

// ---------------------------------------------------------------------------------------------
// Building blocks

class Stereo {
  constructor() {
    this.l = new Float32Array(N);
    this.r = new Float32Array(N);
  }
}

function put(bus, i, l, r) {
  if (i < 0 || i >= N) return;
  bus.l[i] += l;
  bus.r[i] += r;
}

/** Equal-power pan gains, unity in the centre. */
function panGains(pan) {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}

/** Topology-preserving state variable filter (Simper). */
class SVF {
  s1 = 0;
  s2 = 0;
  lp = 0;
  bp = 0;
  hp = 0;
  static g(fc) {
    return Math.tan((Math.PI * Math.min(Math.max(fc, 10), SR * 0.45)) / SR);
  }
  run(x, g, k) {
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - this.s2;
    const v1 = a1 * this.s1 + a2 * v3;
    const v2 = this.s2 + a2 * this.s1 + a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
  }
}

/** PolyBLEP correction for a band-limited sawtooth. */
function blep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

const release = (t, dur, tau) => (t > dur ? Math.exp(-(t - dur) / tau) : 1);

// ---------------------------------------------------------------------------------------------
// Instruments. Each writes one note or hit into a stereo bus, starting at t0 seconds.

function kick(bus, t0, vel = 1) {
  const n0 = Math.round(t0 * SR);
  let ph = 0;
  for (let i = 0; i < 0.55 * SR; i++) {
    const t = i / SR;
    ph += (TAU * (52 + 120 * Math.exp(-t / 0.032) + 70 * Math.exp(-t / 0.004))) / SR;
    const body = Math.tanh(1.8 * Math.sin(ph)) * Math.min(1, t / 0.001) * Math.exp(-t / 0.26);
    const v = (body + noise() * Math.exp(-t / 0.002) * 0.25) * vel;
    put(bus, n0 + i, v, v);
  }
}

function clap(bus, t0, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const fl = new SVF();
  const fr = new SVF();
  const gl = SVF.g(1500);
  const gr = SVF.g(1800);
  for (let i = 0; i < 0.45 * SR; i++) {
    const t = i / SR;
    let env = Math.exp(-t / 0.0032);
    if (t >= 0.0095) env += 0.85 * Math.exp(-(t - 0.0095) / 0.0032);
    if (t >= 0.019) env += 0.75 * Math.exp(-(t - 0.019) / 0.0032);
    if (t >= 0.026) env += 0.5 * Math.exp(-(t - 0.026) / 0.11);
    fl.run(noise(), gl, 1);
    fr.run(noise(), gr, 1);
    put(bus, n0 + i, fl.bp * env * vel * 1.8, fr.bp * env * vel * 1.8);
  }
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540, 800];
function hat(bus, t0, vel, decay, pan = 0.25) {
  const n0 = Math.round(t0 * SR);
  const ph = HAT_F.map(() => rand());
  const band = new SVF();
  const high = new SVF();
  const gb = SVF.g(8000);
  const gh = SVF.g(7000);
  const [pl, pr] = panGains(pan);
  for (let i = 0; i < decay * 7 * SR; i++) {
    const t = i / SR;
    let metal = 0;
    for (let j = 0; j < 6; j++) {
      ph[j] += (HAT_F[j] * 1.5) / SR;
      if (ph[j] >= 1) ph[j] -= 1;
      metal += ph[j] < 0.5 ? 1 : -1;
    }
    band.run(metal * 0.08 + noise() * 0.6, gb, 0.8);
    high.run(band.bp, gh, 1.4);
    const v = high.hp * Math.min(1, t / 0.0005) * Math.exp(-t / decay) * vel;
    put(bus, n0 + i, v * pl, v * pr);
  }
}

function shaker(bus, t0, vel, pan = -0.35) {
  const n0 = Math.round(t0 * SR);
  const f = new SVF();
  const g = SVF.g(6000);
  const [pl, pr] = panGains(pan);
  for (let i = 0; i < 0.25 * SR; i++) {
    const t = i / SR;
    f.run(noise(), g, 1.1);
    const v = f.bp * Math.min(1, t / 0.006) * Math.exp(-t / 0.045) * vel;
    put(bus, n0 + i, v * pl, v * pr);
  }
}

function bass(bus, t0, dur, midi, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const f = mtof(midi);
  const dt = f / SR;
  const flt = new SVF();
  let ph = 0;
  let sp = rand();
  for (let i = 0; i < (dur + 0.12) * SR; i++) {
    const t = i / SR;
    ph += TAU * dt;
    sp += dt;
    if (sp >= 1) sp -= 1;
    flt.run(2 * sp - 1 - blep(sp, dt), SVF.g(170 + 1000 * vel * Math.exp(-t / 0.07)), 1.1);
    const amp = Math.min(1, t / 0.004) * (0.7 + 0.3 * Math.exp(-t / 0.15)) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.08) : 1);
    const v = Math.tanh(1.4 * (0.8 * Math.sin(ph) + 0.5 * flt.lp)) * amp * vel;
    put(bus, n0 + i, v, v);
  }
}

/** Electric piano: two-operator FM with a short metallic tine on the attack, and a slow autopan. */
function ep(bus, t0, dur, midi, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const f = mtof(midi);
  let pc = rand() * 0.5;
  let pm = 0;
  let pt = 0;
  const index = 1.4 + 2.4 * vel;
  for (let i = 0; i < (dur + 0.8) * SR; i++) {
    const t = i / SR;
    pc += (TAU * f) / SR;
    pm += (TAU * f) / SR;
    pt += (TAU * f * 7) / SR;
    const body = Math.sin(pc + (index * Math.exp(-t / 0.3) + 0.25) * Math.sin(pm));
    const tine = Math.sin(pt) * 0.2 * vel * Math.exp(-t / 0.03);
    const amp = Math.min(1, t / 0.003) * (0.75 * Math.exp(-t / 1.8) + 0.25 * Math.exp(-t / 0.2)) * release(t, dur, 0.13);
    const v = (body + tine) * amp * vel;
    const pan = 0.14 * Math.sin(TAU * 0.35 * (t0 + t));
    put(bus, n0 + i, v * (1 - pan), v * (1 + pan));
  }
}

/** Soft pad: three detuned saws per note, spread across the stereo field, through a low-pass. */
function pad(bus, t0, dur, notes, vel = 1, cutoff = 1800) {
  const n0 = Math.round(t0 * SR);
  const voices = [];
  for (const m of notes) {
    for (const [cents, pan] of [
      [-9, -0.7],
      [0, 0],
      [9, 0.7],
    ]) {
      const [gl, gr] = panGains(pan);
      voices.push({ dt: (mtof(m) * 2 ** (cents / 1200)) / SR, p: rand(), gl, gr });
    }
  }
  const fl = new SVF();
  const fr = new SVF();
  const norm = vel / Math.sqrt(voices.length);
  for (let i = 0; i < (dur + 1.4) * SR; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    for (const v of voices) {
      v.p += v.dt;
      if (v.p >= 1) v.p -= 1;
      const s = 2 * v.p - 1 - blep(v.p, v.dt);
      l += s * v.gl;
      r += s * v.gr;
    }
    const g = SVF.g(cutoff * (1 + 0.15 * Math.sin(TAU * 0.25 * (t0 + t))));
    fl.run(l, g, 1.2);
    fr.run(r, g, 1.2);
    const amp = Math.min(1, t / 0.35) * release(t, dur, 0.45) * norm;
    put(bus, n0 + i, fl.lp * amp, fr.lp * amp);
  }
}

/** Marimba-like mallet: partials tuned 1 : 4 : 10, as on a real bar. */
function mallet(bus, t0, midi, vel = 1, pan = 0.1) {
  const n0 = Math.round(t0 * SR);
  const f = mtof(midi);
  const [pl, pr] = panGains(pan);
  const parts = [
    [1, 1, 0.6],
    [4, 0.2, 0.09],
    [9.9, 0.05, 0.025],
  ].filter(([k]) => f * k < SR * 0.4);
  for (let i = 0; i < 2.2 * SR; i++) {
    const t = i / SR;
    let v = noise() * 0.08 * Math.exp(-t / 0.0015);
    for (const [k, a, tau] of parts) v += Math.sin(TAU * f * k * t) * a * Math.exp(-t / tau);
    v *= Math.min(1, t / 0.001) * vel;
    put(bus, n0 + i, v * pl, v * pr);
  }
}

/** Glockenspiel: the inharmonic partials of a free steel bar. */
function glock(bus, t0, midi, vel = 1, pan = -0.15) {
  const n0 = Math.round(t0 * SR);
  const f = mtof(midi);
  const [pl, pr] = panGains(pan);
  const parts = [
    [1, 1, 1.5],
    [2.76, 0.35, 0.35],
    [5.4, 0.15, 0.12],
    [8.93, 0.06, 0.05],
  ].filter(([k]) => f * k < SR * 0.4);
  for (let i = 0; i < 2.6 * SR; i++) {
    const t = i / SR;
    let v = 0;
    for (const [k, a, tau] of parts) v += Math.sin(TAU * f * k * t) * a * Math.exp(-t / tau);
    v *= Math.min(1, t / 0.0008) * vel;
    put(bus, n0 + i, v * pl, v * pr);
  }
}

function pluck(bus, t0, midi, vel = 1, pan = 0) {
  const n0 = Math.round(t0 * SR);
  const dt = mtof(midi) / SR;
  const flt = new SVF();
  const [pl, pr] = panGains(pan);
  let p = rand();
  for (let i = 0; i < 0.8 * SR; i++) {
    const t = i / SR;
    p += dt;
    if (p >= 1) p -= 1;
    flt.run(2 * p - 1 - blep(p, dt), SVF.g(500 + 5000 * vel * Math.exp(-t / 0.05)), 0.8);
    const v = flt.lp * Math.min(1, t / 0.002) * Math.exp(-t / 0.18) * vel;
    put(bus, n0 + i, v * pl, v * pr);
  }
}

function crash(bus, t0, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const fl = new SVF();
  const fr = new SVF();
  const g = SVF.g(3000);
  const tl = new SVF();
  const tr = new SVF();
  const gTop = SVF.g(9000);
  const rings = [3150, 4420, 5870, 7230, 8610].map((f) => [f, rand() * TAU]);
  for (let i = 0; i < 3 * SR; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.002) * (0.6 * Math.exp(-t / 1.1) + 0.4 * Math.exp(-t / 0.12));
    tl.run(noise(), gTop, 1.4);
    tr.run(noise(), gTop, 1.4);
    fl.run(tl.lp, g, 1.4);
    fr.run(tr.lp, g, 1.4);
    let ring = 0;
    for (const [f, ph] of rings) ring += Math.sin(TAU * f * t + ph);
    ring *= 0.04 * Math.exp(-t / 0.7);
    put(bus, n0 + i, (fl.hp * env + ring) * vel, (fr.hp * env + ring) * vel);
  }
}

/** Filtered noise sweeping up to the downbeat at t1. */
function riser(bus, t0, t1, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const len = t1 - t0;
  const fl = new SVF();
  const fr = new SVF();
  for (let i = 0; i < len * SR; i++) {
    const u = i / SR / len;
    const g = SVF.g(300 * (8000 / 300) ** u);
    fl.run(noise(), g, 0.4);
    fr.run(noise(), g, 0.4);
    const env = u ** 2.5 * Math.min(1, (len - i / SR) / 0.008) * vel;
    put(bus, n0 + i, fl.bp * env, fr.bp * env);
  }
}

/** A reversed cymbal swell that cuts off on the downbeat at t1. */
function swell(bus, t0, t1, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const len = t1 - t0;
  const fl = new SVF();
  const fr = new SVF();
  const g = SVF.g(5000);
  for (let i = 0; i < len * SR; i++) {
    const u = i / SR / len;
    fl.run(noise(), g, 1.4);
    fr.run(noise(), g, 1.4);
    const env = u ** 3 * Math.min(1, (len - i / SR) / 0.005) * vel;
    put(bus, n0 + i, fl.hp * env, fr.hp * env);
  }
}

/** Low sub hit for the big moments. */
function boom(bus, t0, vel = 1) {
  const n0 = Math.round(t0 * SR);
  const thump = new SVF();
  const g = SVF.g(180);
  let ph = 0;
  for (let i = 0; i < 3 * SR; i++) {
    const t = i / SR;
    ph += (TAU * (44 + 60 * Math.exp(-t / 0.09))) / SR;
    thump.run(noise(), g, 1.4);
    const v = (Math.sin(ph) * Math.exp(-t / 1.0) + thump.lp * 0.6 * Math.exp(-t / 0.04)) * Math.min(1, t / 0.002) * vel;
    put(bus, n0 + i, v, v);
  }
}

// ---------------------------------------------------------------------------------------------
// Harmony and tunes (F major)

const CHORDS = {
  F: { root: 41, ep: [57, 60, 64, 67], pad: [53, 57, 60, 64], arp: [65, 69, 72, 76] }, // Fmaj9
  C: { root: 36, ep: [52, 55, 60, 62], pad: [48, 55, 60, 64], arp: [67, 72, 74, 76] }, // Cadd9
  Dm: { root: 38, ep: [53, 57, 60, 64], pad: [50, 57, 60, 65], arp: [65, 69, 72, 74] }, // Dm9
  Bb: { root: 34, ep: [53, 58, 60, 62], pad: [46, 53, 58, 62], arp: [65, 70, 72, 74] }, // Bb add9
};

/** [bar, first beat, end beat, chord, groove]: A is a loose pop groove, B is four on the floor. */
const CHART = [
  [0, 0, 2, 'Bb', 'A'],
  [0, 2, 4, 'C', 'A'],
  [1, 0, 4, 'F', 'A'],
  [2, 0, 4, 'C', 'A'],
  [3, 0, 4, 'Dm', 'A'],
  [4, 0, 2, 'Bb', 'A'],
  [4, 2, 4, 'Bb', 'B'],
  [5, 0, 4, 'C', 'B'],
];

// [beat, length in beats, MIDI note] per bar. The tune falls C–A–F, G–E–C, A–F–D, climbs back, then
// steps up D–E–F onto the last chord.
const TUNE = [
  [1, [[0, 0.75, 84], [0.75, 0.75, 81], [1.5, 0.5, 77], [2, 0.5, 79], [2.5, 1.5, 81]]],
  [2, [[0, 0.75, 79], [0.75, 0.75, 76], [1.5, 0.5, 72], [2, 0.5, 74], [2.5, 1.5, 76]]],
  [3, [[0, 0.75, 81], [0.75, 0.75, 77], [1.5, 0.5, 74], [2, 0.5, 76], [2.5, 1.5, 77]]],
  [4, [[0, 0.5, 77], [0.5, 0.5, 79], [1, 0.5, 81], [1.5, 0.5, 82], [2, 1, 86], [3, 1, 84]]],
  [5, [[0, 0.75, 88], [0.75, 0.75, 84], [1.5, 0.5, 79], [2, 0.5, 81], [2.5, 0.5, 84], [3, 0.5, 86], [3.5, 0.5, 88]]],
];

const KICKS = { A: [0, 1.5, 2.5], B: [0, 1, 2, 3] };
const BASS = {
  A: [[0, 0.6, 0], [0.75, 0.2, 12], [1.5, 0.45, 0], [2.5, 0.4, 0], [3, 0.3, 7], [3.5, 0.4, 12]],
  B: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((k) => [k, 0.4, k % 1 ? 12 : 0]),
};
const KEYS = {
  A: [[0, 1.3, 1], [1.5, 0.9, 0.75], [3, 0.9, 0.85]],
  B: [[0.5, 0.35, 0.8], [1.5, 0.35, 0.7], [2.5, 0.35, 0.8], [3.5, 0.35, 0.7]],
};
const ARP_ORDER = [0, 2, 1, 3, 2, 1, 3, 2];

// ---------------------------------------------------------------------------------------------
// The score: a list of events, each played into one stem.

const events = [];
const ev = (stem, t, fn, ...args) => events.push({ stem, t, play: (bus) => fn(bus, t, ...args) });
const human = (t) => t + (rand() - 0.5) * 0.006;
/** A light 16th swing for the hats and shaker. */
const swung = (bar, beat) => at(bar, beat + (beat % 0.5 === 0.25 ? 0.035 : 0));

// Intro, "Explaining with a mouse?": a muffled chord and a timid little figure, then a riser.
ev('pad', 0, pad, at(0) - 0.25, CHORDS.Dm.pad, 0.55, 650);
[
  [-2, 2, 69],
  [-2, 3, 72],
  [-1, 0, 74],
  [-1, 1, 72],
].forEach(([b, k, m]) => ev('arp', at(b, k), pluck, m, 0.3, 0));
ev('fx', 44 / FPS, riser, at(0), 0.5);
ev('fx', at(-1, 2), swell, at(0), 0.35);

// The hits on the cuts.
ev('fx', at(0), boom, 0.8);
ev('fx', at(0), crash, 0.55);
ev('fx', at(0, 2), swell, at(1), 0.3);
ev('fx', at(1), crash, 0.5);
ev('fx', at(2), crash, 0.3);
ev('fx', at(4), swell, at(4, 2), 0.3);
ev('fx', at(4, 2), crash, 0.45);
ev('fx', at(4, 2), riser, at(6), 0.3);
ev('fx', at(5, 2), swell, at(6), 0.4);
[3, 3.25, 3.5, 3.75].forEach((k, i) => ev('drums', at(5, k), clap, 0.35 + 0.18 * i));
// A glockenspiel run up into the title.
[72, 76, 79, 84].forEach((m, i) => ev('bells', at(0, 3 + i * 0.25), glock, m, 0.5));

for (const [bar, from, to, name, groove] of CHART) {
  const chord = CHORDS[name];
  const inside = (k) => k >= from && k < to;
  const lift = bar >= 4 ? 2 : bar >= 2 ? 1 : 0; // title, live ink, five people

  for (const k of KICKS[groove]) if (inside(k)) ev('kick', at(bar, k), kick, k === 0 ? 1 : 0.85);
  for (const k of [1, 3]) if (inside(k)) ev('drums', human(at(bar, k)), clap, 0.9);
  for (let k = from; k < to; k += 0.5) {
    if (groove === 'A') ev('drums', swung(bar, k), hat, k % 1 ? 0.38 : 0.2, 0.035);
    else ev('drums', at(bar, k), hat, k % 1 ? 0.32 : 0.18, k % 1 ? 0.14 : 0.03);
  }
  for (let k = from; k < to; k += 0.25) ev('drums', swung(bar, k), shaker, k % 0.5 ? 0.3 : 0.5);

  // A chord change always gets a bass note and a chord, even where the pattern has a rest.
  const bassNotes = BASS[groove].filter(([k]) => inside(k));
  if (!bassNotes.some(([k]) => k === from)) bassNotes.unshift([from, 0.45, 0]);
  for (const [k, d, iv] of bassNotes) ev('bass', at(bar, k), bass, d * BEAT, chord.root + iv, groove === 'B' && k % 1 ? 0.8 : 1);

  const hits = KEYS[groove].filter(([k]) => inside(k));
  if (groove === 'A' && !hits.some(([k]) => k === from)) hits.unshift([from, 0.9, 0.9]);
  for (const [k, d, v] of hits) {
    const t = human(at(bar, k));
    chord.ep.forEach((m, j) => ev('keys', t + j * 0.004, ep, d * BEAT, m, v * (0.9 + 0.2 * rand())));
  }

  ev('pad', at(bar, from), pad, (to - from) * BEAT, chord.pad, [0.35, 0.45, 0.55][lift], [2200, 3200, 4200][lift]);
  if (lift > 0) {
    for (let s = from * 4; s < to * 4; s++) ev('arp', at(bar, s / 4), pluck, chord.arp[ARP_ORDER[s % 8]], (s % 4 === 0 ? 0.9 : 0.6) * (lift === 2 ? 0.85 : 0.65), s % 2 ? 0.4 : -0.4);
  }
}

for (const [bar, notes] of TUNE) {
  for (const [k, , m] of notes) {
    const t = human(at(bar, k));
    const v = k % 1 === 0 ? 1 : 0.85;
    ev('lead', t, mallet, m, v);
    ev('bells', t, glock, m, v * (bar === 5 ? 0.5 : 0.3));
  }
}

// Bar 6, the end logo: home to F, left to ring, with the bells falling away.
ev('fx', at(6), crash, 0.5);
ev('fx', at(6), boom, 0.7);
ev('kick', at(6), kick, 0.9);
CHORDS.F.ep.forEach((m, j) => ev('keys', at(6) + j * 0.012, ep, 6 * BEAT, m, 0.9));
ev('pad', at(6), pad, 8 * BEAT, CHORDS.F.pad, 0.5, 1800);
ev('bass', at(6), bass, 4 * BEAT, 41, 0.9);
ev('lead', at(6), mallet, 89, 0.8);
[
  [0, 89, 0.5],
  [1, 84, 0.35],
  [1.5, 81, 0.3],
  [2, 77, 0.25],
].forEach(([k, m, v]) => ev('bells', at(6, k), glock, m, v));

// ---------------------------------------------------------------------------------------------
// Mixing

const LEVEL = { kick: 0.9, drums: 0.5, bass: 0.5, keys: 0.13, pad: 0.22, lead: 0.12, bells: 0.15, arp: 0.15, fx: 0.3 };
const REVERB_SEND = { drums: 0.12, keys: 0.25, pad: 0.35, lead: 0.3, bells: 0.45, arp: 0.2, fx: 0.25 };
const DELAY_SEND = { lead: 0.22, bells: 0.25, arp: 0.3 };
const DUCK = { bass: 0.4, keys: 0.3, pad: 0.55, arp: 0.3 };

function duckCurve(kicks, depth) {
  const g = new Float32Array(N).fill(1);
  for (const t0 of kicks) {
    const n0 = Math.round(t0 * SR);
    for (let i = 0; i < 0.6 * SR; i++) {
      const n = n0 + i;
      if (n < 0 || n >= N) continue;
      const t = i / SR;
      const shape = t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.13);
      g[n] = Math.min(g[n], 1 - depth * shape);
    }
  }
  return g;
}

/** Freeverb (Jezar's public-domain design), mono in, stereo out. */
function reverb(input, size = 0.84, damp = 0.3, predelay = 0.025) {
  const scale = SR / 44100;
  const spread = Math.round(23 * scale);
  const pd = Math.round(predelay * SR);
  const out = new Stereo();
  // Keep the low end out of the reverb.
  const hp = new SVF();
  const g = SVF.g(250);
  const mono = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    hp.run(input.l[n] + input.r[n], g, 1.4);
    mono[n] = hp.hp * 0.015;
  }
  for (const [ch, off] of [
    ['l', 0],
    ['r', spread],
  ]) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ buf: new Float32Array(Math.round(d * scale) + off), i: 0, store: 0 }));
    const passes = [556, 441, 341, 225].map((d) => ({ buf: new Float32Array(Math.round(d * scale) + off), i: 0 }));
    const o = out[ch];
    for (let n = 0; n < N; n++) {
      const x = n >= pd ? mono[n - pd] : 0;
      let y = 0;
      for (const c of combs) {
        const b = c.buf[c.i];
        c.store = b * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * size;
        if (++c.i >= c.buf.length) c.i = 0;
        y += b;
      }
      for (const a of passes) {
        const b = a.buf[a.i];
        a.buf[a.i] = y + b * 0.5;
        if (++a.i >= a.buf.length) a.i = 0;
        y = b - y;
      }
      o[n] = y;
    }
  }
  return out;
}

function pingPong(input, time, feedback = 0.38, tone = 3500) {
  const d = Math.round(time * SR);
  const bl = new Float32Array(d);
  const br = new Float32Array(d);
  const out = new Stereo();
  const a = 1 - Math.exp((-TAU * tone) / SR);
  let i = 0;
  let lpL = 0;
  let lpR = 0;
  for (let n = 0; n < N; n++) {
    const dl = bl[i];
    const dr = br[i];
    lpL += a * (dl - lpL);
    lpR += a * (dr - lpR);
    bl[i] = (input.l[n] + input.r[n]) * 0.5 + lpR * feedback;
    br[i] = lpL * feedback;
    out.l[n] = dl;
    out.r[n] = dr;
    if (++i >= d) i = 0;
  }
  return out;
}

const stats = {};
const rmsDb = (a) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return 10 * Math.log10(s / a.length + 1e-20);
};

/** Plays the events through the stems, sends and effects into one stereo mix. */
function render(list) {
  const stems = Object.fromEntries(Object.keys(LEVEL).map((k) => [k, new Stereo()]));
  for (const e of list) e.play(stems[e.stem]);
  const kicks = list.filter((e) => e.stem === 'kick').map((e) => e.t);
  for (const [stem, depth] of Object.entries(DUCK)) {
    const g = duckCurve(kicks, depth);
    for (let n = 0; n < N; n++) {
      stems[stem].l[n] *= g[n];
      stems[stem].r[n] *= g[n];
    }
  }
  const send = (levels) => {
    const bus = new Stereo();
    for (const [stem, lvl] of Object.entries(levels)) {
      const s = stems[stem];
      const k = lvl * LEVEL[stem];
      for (let n = 0; n < N; n++) {
        bus.l[n] += s.l[n] * k;
        bus.r[n] += s.r[n] * k;
      }
    }
    return bus;
  };
  const verb = reverb(send(REVERB_SEND));
  const echo = pingPong(send(DELAY_SEND), 0.75 * BEAT);
  const mix = new Stereo();
  for (const [stem, lvl] of Object.entries(LEVEL)) {
    const s = stems[stem];
    for (let n = 0; n < N; n++) {
      mix.l[n] += s.l[n] * lvl;
      mix.r[n] += s.r[n] * lvl;
    }
    stats[stem] = rmsDb(s.l.map((v) => v * lvl));
  }
  for (let n = 0; n < N; n++) {
    mix.l[n] += verb.l[n] * 1.6 + echo.l[n] * 0.5;
    mix.r[n] += verb.r[n] * 1.6 + echo.r[n] * 0.5;
  }
  return mix;
}

const t = performance.now();
const out = render(events);

// Master: a low cut at 30 Hz, a dip at 1 kHz and a lift around 2.3 kHz, a gentle compressor, loudness to about
// -16 dB RMS, then a look-ahead limiter at -1 dBFS.
{
  const gLow = SVF.g(30);
  const gBox = SVF.g(900);
  const gPresence = SVF.g(2300);
  for (const ch of ['l', 'r']) {
    const a = out[ch];
    const low = new SVF();
    const box = new SVF();
    const presence = new SVF();
    for (let n = 0; n < N; n++) {
      low.run(a[n], gLow, 1.4);
      box.run(low.hp, gBox, 0.7);
      const x = low.hp - box.bp * 0.7 * 0.45;
      presence.run(x, gPresence, 1.25);
      a[n] = x + presence.bp * 1.25 * 0.7;
    }
  }
  const att = Math.exp(-1 / (0.01 * SR));
  const rel = Math.exp(-1 / (0.15 * SR));
  let env = 0;
  for (let n = 0; n < N; n++) {
    const x = Math.max(Math.abs(out.l[n]), Math.abs(out.r[n]));
    env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
    const db = 20 * Math.log10(env + 1e-9);
    const gain = db > -12 ? 10 ** ((-(db + 12) * (1 - 1 / 2)) / 20) : 1;
    out.l[n] *= gain;
    out.r[n] *= gain;
  }
  // Loudness over the grooving part of the track.
  const a = Math.round(at(0) * SR);
  const b = Math.round(at(6) * SR);
  let s = 0;
  for (let n = a; n < b; n++) s += (out.l[n] ** 2 + out.r[n] ** 2) / 2;
  const makeup = 10 ** (-16 / 20) / Math.sqrt(s / (b - a));
  const ceiling = 10 ** (-1 / 20);
  const look = Math.round(0.003 * SR);
  const need = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const p = Math.max(Math.abs(out.l[n]), Math.abs(out.r[n])) * makeup;
    need[n] = p > ceiling ? ceiling / p : 1;
  }
  // Minimum over the look-ahead window, smoothed by a moving average of the same length, with a slow release.
  const minAhead = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    let m = 1;
    for (let k = n; k < Math.min(N, n + look); k++) if (need[k] < m) m = need[k];
    minAhead[n] = m;
  }
  const relG = Math.exp(-1 / (0.08 * SR));
  let g = 1;
  let acc = 0;
  const ring = new Float32Array(look).fill(1);
  acc = look;
  for (let n = 0; n < N; n++) {
    acc += minAhead[n] - ring[n % look];
    ring[n % look] = minAhead[n];
    const target = Math.min(acc / look, minAhead[n]);
    g = target < g ? target : relG * g + (1 - relG) * target;
    out.l[n] *= makeup * g;
    out.r[n] *= makeup * g;
  }
}

// 16-bit WAV with TPDF dither.
const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'public', 'music', 'theme.wav');
mkdirSync(dirname(file), { recursive: true });
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
const q = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767 + rand() - rand())));
let peak = 0;
for (let n = 0; n < N; n++) {
  peak = Math.max(peak, Math.abs(out.l[n]), Math.abs(out.r[n]));
  buf.writeInt16LE(q(out.l[n]), 44 + n * 4);
  buf.writeInt16LE(q(out.r[n]), 46 + n * 4);
}
writeFileSync(file, buf);

console.log(`${events.length} notes, ${(N / SR).toFixed(2)} s, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS, ${((performance.now() - t) / 1000).toFixed(1)} s → ${file}`);
if (process.argv.includes('--stats')) for (const [k, v] of Object.entries(stats)) if (v > -90) console.log(`  ${k.padEnd(12)} ${v.toFixed(1)} dB`);
