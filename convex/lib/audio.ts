// WhatsApp voice notes are Ogg/Opus; Meta's audio inputs take WAV or MP3 only. Decode (WebAssembly, so it runs in
// the normal Convex runtime), mix to mono, resample to 16 kHz and wrap as 16-bit PCM WAV.
export async function oggToWav(bytes: Uint8Array, rate = 16000): Promise<Uint8Array> {
  // The decoder package also ships a web-worker variant that touches `Worker` when it loads, which Convex's runtime
  // lacks. We only use the main-thread decoder, so a stand-in class is enough, and the import waits until needed.
  const g = globalThis as { Worker?: unknown };
  g.Worker ??= class {};
  const { OggOpusDecoder } = await import("ogg-opus-decoder");
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  try {
    const { channelData, samplesDecoded, sampleRate } = await decoder.decodeFile(bytes);
    if (samplesDecoded === 0) throw new Error("Voice note has no audio");
    const mono = new Float32Array(samplesDecoded);
    for (const ch of channelData) for (let i = 0; i < samplesDecoded; i++) mono[i] += ch[i] / channelData.length;
    return wav(resample(mono, sampleRate, rate), rate);
  } finally {
    decoder.free();
  }
}

// Linear interpolation is plenty for speech going 48 kHz -> 16 kHz.
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const out = new Float32Array(Math.floor((input.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const x = (i * from) / to, j = Math.floor(x), t = x - j;
    out[i] = input[j] * (1 - t) + (input[j + 1] ?? input[j]) * t;
  }
  return out;
}

export function wav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Uint8Array(buf);
}
