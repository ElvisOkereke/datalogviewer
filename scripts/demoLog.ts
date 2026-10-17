/**
 * Deterministic, physically plausible demo log: 8 minutes at 20 Hz from a turbocharged 5-speed car —
 * warm-up idle, cruising, three full-throttle pulls with gear changes, coast-downs, then idle.
 */
export const DEMO_HEADER = [
  'Time (s)',
  'Engine Speed (rpm)',
  'MAP (kPa)',
  'AFR',
  'Accelerator Position (%)',
  'Coolant Temperature (°C)',
  'Intake Air Temperature (°C)',
  'Ignition Advance (°)',
  'Battery Voltage (V)',
  'Fuel Mode',
];

const HZ = 20;
const SECONDS = 480;
const IDLE_RPM = 900;
const REDLINE = 6800;
const SHIFT_RATIO = 0.68;

type Phase = 'idle' | 'cruise' | 'pull' | 'decel';

const SCRIPT: { until: number; phase: Phase }[] = [
  { until: 40, phase: 'idle' },
  { until: 110, phase: 'cruise' },
  { until: 124, phase: 'pull' },
  { until: 140, phase: 'decel' },
  { until: 230, phase: 'cruise' },
  { until: 244, phase: 'pull' },
  { until: 260, phase: 'decel' },
  { until: 350, phase: 'cruise' },
  { until: 365, phase: 'pull' },
  { until: 390, phase: 'decel' },
  { until: SECONDS, phase: 'idle' },
];

/** Small seeded PRNG so the sample file is identical on every run. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const toward = (v: number, target: number, k: number) => v + (target - v) * k;

export function generateDemoLog(seed = 412): string {
  const rand = mulberry32(seed);
  const noise = (amp: number) => (rand() * 2 - 1) * amp;
  const dt = 1 / HZ;

  let phase: Phase = 'idle';
  let rpm = IDLE_RPM;
  let gear = 1;
  let tps = 0;
  let afr = 14.7;
  let clt = 62;
  let iat = 24;
  const rows = [DEMO_HEADER.join(',')];

  for (let i = 0; i < SECONDS * HZ; i++) {
    const t = i * dt;
    const next = SCRIPT.find((s) => t < s.until)!.phase;
    if (next !== phase) {
      if (next === 'pull') {
        gear = 2;
        rpm = Math.max(rpm, 2400);
      }
      if (next === 'cruise') gear = 4;
      phase = next;
    }

    const targetTps = phase === 'pull' ? 100 : phase === 'cruise' ? 18 + 6 * Math.sin(t / 7) : 0;
    tps = clamp(toward(tps, targetTps, phase === 'pull' ? 0.35 : 0.12) + noise(0.4), 0, 100);

    if (phase === 'pull') {
      rpm += (2600 / gear) * (tps / 100) * dt;
      if (rpm > REDLINE) {
        if (gear < 5) {
          gear++;
          rpm *= SHIFT_RATIO;
        } else rpm = REDLINE;
      }
    } else if (phase === 'cruise') rpm = toward(rpm, 2300 + 400 * Math.sin(t / 11), 0.03);
    else if (phase === 'decel') rpm = toward(rpm, 1300, 0.02);
    else rpm = toward(rpm, IDLE_RPM, 0.05);
    rpm += noise(12);

    const load = tps / 100;
    const spool = clamp((rpm - 2500) / 2500, 0, 1);
    const coasting = phase === 'decel' && tps < 2;
    const map = coasting ? 22 + noise(1) : 30 + load * (70 + 110 * spool) + noise(1.2);

    const mode =
      coasting && rpm > 1500
        ? 'Decel Cut'
        : map > 105
          ? 'Open Loop'
          : phase === 'idle'
            ? 'Idle'
            : 'Closed Loop';
    const targetAfr =
      mode === 'Decel Cut'
        ? 21.5
        : mode === 'Open Loop'
          ? 12.6 - 1.2 * clamp((map - 105) / 75, 0, 1)
          : 14.7;
    afr = toward(afr, targetAfr, 0.15) + noise(0.08);

    clt = clt < 88 ? clt + 0.0045 : 88;
    const coolant = clt >= 88 ? 88 + 1.2 * Math.sin(t / 40) : clt;
    iat = toward(iat, 24 + 18 * spool * load, 0.002) + noise(0.02);
    const ignition =
      map > 100
        ? 14 - (map - 100) * 0.05
        : phase === 'idle'
          ? 12
          : 22 + 12 * (1 - load) * clamp(rpm / 4000, 0, 1);
    const battery = 14.1 - 0.25 * load + noise(0.04);

    rows.push(
      [
        t.toFixed(3),
        Math.round(rpm),
        map.toFixed(1),
        afr.toFixed(2),
        tps.toFixed(1),
        coolant.toFixed(1),
        iat.toFixed(1),
        (ignition + noise(0.2)).toFixed(1),
        battery.toFixed(2),
        mode,
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}
