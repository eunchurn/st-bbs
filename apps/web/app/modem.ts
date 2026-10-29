// 모뎀음은 저작권 문제가 없도록 WebAudio로 직접 합성한다.
const DTMF: Record<string, [number, number]> = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "0": [941, 1336],
};

function tone(ctx: AudioContext, freqs: number[], start: number, dur: number, volume = 0.08) {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(ctx.destination);
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + dur);
  }
}

function hiss(ctx: AudioContext, start: number, dur: number) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.value = 0.15;
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(start);
}

// 발신음 → 번호 누르는 소리 → 응답음 → 접속 협상. 걸리는 시간(초)을 돌려준다.
export function playDial(ctx: AudioContext, number: string) {
  let t = ctx.currentTime + 0.1;
  tone(ctx, [350, 440], t, 1);
  t += 1.2;
  for (const d of number) {
    if (DTMF[d]) tone(ctx, DTMF[d], t, 0.12);
    t += 0.2;
  }
  t += 1;
  tone(ctx, [2100], t, 1.2, 0.06);
  t += 1.3;
  const pairs = [[1200, 2400], [980, 1180], [1650, 1850]];
  for (let i = 0; i < 6; i++) {
    tone(ctx, pairs[i % 3], t, 0.25, 0.05);
    hiss(ctx, t + 0.25, 0.25);
    t += 0.5;
  }
  return t - ctx.currentTime;
}
