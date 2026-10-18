let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = new AudioContextClass();
  }
  return sharedAudioContext;
}

export type SoundCategory = "master" | "dice" | "footsteps" | "alerts";

export function readVolume(category: SoundCategory): number {
  const settingKey = `volume${category.charAt(0).toUpperCase()}${category.slice(1)}`;
  try {
    const raw = game.settings.get("core", settingKey);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return Math.max(0, Math.min(100, Math.round(raw)));
    }
  } catch {
    /* setting not yet initialized or fallback */
  }
  return category === "master" ? 100 : category === "footsteps" ? 50 : 80;
}

export function effectiveVolume(category: "dice" | "footsteps" | "alerts"): number {
  const master = readVolume("master") / 100;
  const specific = readVolume(category) / 100;
  return Math.max(0, Math.min(1, master * specific));
}

function scheduleClick(context: AudioContext, startTime: number, volume: number): void {
  const length = Math.floor(context.sampleRate * 0.03);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1800 + Math.random() * 1600;
  const gain = context.createGain();
  gain.gain.value = Math.max(volume, 0.01);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(startTime);
}

/** Synthesized dice tumbling and rattle sound */
export function playDiceSound(): void {
  const volume = effectiveVolume("dice");
  if (volume <= 0.001) return;
  try {
    const context = getAudioContext();
    if (context.state === "suspended") void context.resume();
    for (let hit = 0; hit < 5; hit += 1) {
      const hitTime = context.currentTime + hit * 0.085 + Math.random() * 0.035;
      const hitVolume = (0.35 - hit * 0.05) * volume;
      scheduleClick(context, hitTime, Math.max(0.01, hitVolume));
    }
  } catch {
    /* Audio optional */
  }
}

/** Synthesized tactile footstep tap/thump with variation */
export function playFootstepSound(variation = 0): void {
  const volume = effectiveVolume("footsteps");
  if (volume <= 0.001) return;
  try {
    const context = getAudioContext();
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;

    // Low thump impact (heel/sole contact)
    const osc = context.createOscillator();
    const oscGain = context.createGain();
    const baseFreq = 80 + (variation % 3) * 14 + Math.random() * 8;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.065);
    oscGain.gain.setValueAtTime(volume * 0.38, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.connect(oscGain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.08);

    // Subtle surface scuff (soft texture tap)
    const length = Math.floor(context.sampleRate * 0.03);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 4;
    }
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420 + (variation % 2) * 90, now);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.28, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    noise.connect(filter).connect(noiseGain).connect(context.destination);
    noise.start(now);
  } catch {
    /* Audio optional */
  }
}

/** Synthesized clean musical chime for alerts and pings */
export function playAlertSound(): void {
  const volume = effectiveVolume("alerts");
  if (volume <= 0.001) return;
  try {
    const context = getAudioContext();
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;

    const osc1 = context.createOscillator();
    const gain1 = context.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(volume * 0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc1.connect(gain1).connect(context.destination);
    osc1.start(now);
    osc1.stop(now + 0.16);

    const osc2 = context.createOscillator();
    const gain2 = context.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.08); // A5
    gain2.gain.setValueAtTime(volume * 0.3, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc2.connect(gain2).connect(context.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.28);
  } catch {
    /* Audio optional */
  }
}

/** Plays sample sound for configuration feedback */
export function testSound(category: SoundCategory): void {
  if (category === "dice") playDiceSound();
  else if (category === "footsteps") playFootstepSound(Math.floor(Math.random() * 4));
  else if (category === "alerts" || category === "master") playAlertSound();
}
