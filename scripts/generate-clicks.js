/**
 * Generates two short WAV click audio files for the metronome:
 *   - click-high.wav (1600 Hz sine, ~80ms)
 *   - click-low.wav  (800 Hz sine, ~80ms)
 *
 * Run with: bun scripts/generate-clicks.js
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "src", "assets");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

function generateClick(frequency, durationMs, sampleRate = 44100) {
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  // RIFF header
  buffer.write("RIFF", offset);
  offset += 4;
  buffer.writeUInt32LE(fileSize, offset);
  offset += 4;
  buffer.write("WAVE", offset);
  offset += 4;

  // fmt chunk
  buffer.write("fmt ", offset);
  offset += 4;
  buffer.writeUInt32LE(16, offset);
  offset += 4; // chunk size
  buffer.writeUInt16LE(1, offset);
  offset += 2; // PCM
  buffer.writeUInt16LE(numChannels, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buffer.writeUInt32LE(byteRate, offset);
  offset += 4;
  buffer.writeUInt16LE(blockAlign, offset);
  offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  // data chunk
  buffer.write("data", offset);
  offset += 4;
  buffer.writeUInt32LE(dataSize, offset);
  offset += 4;

  // Generate sine wave with exponential decay envelope
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 40); // fast decay
    const sample = Math.sin(2 * Math.PI * frequency * t) * envelope;
    const intSample = Math.max(
      -32768,
      Math.min(32767, Math.floor(sample * 32767 * 0.8))
    );
    buffer.writeInt16LE(intSample, offset);
    offset += 2;
  }

  return buffer;
}

// Generate click-high (1600 Hz, 80ms)
const highClick = generateClick(1600, 80);
writeFileSync(join(outDir, "click-high.wav"), highClick);
console.log("✓ Generated click-high.wav");

// Generate click-low (800 Hz, 80ms)
const lowClick = generateClick(800, 80);
writeFileSync(join(outDir, "click-low.wav"), lowClick);
console.log("✓ Generated click-low.wav");

console.log(`\nAudio files written to ${outDir}`);
