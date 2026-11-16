#!/usr/bin/env node
/*
 * StorySync P5 diagnostic: why can't WebKit decode the AAC/M4A it publishes?
 *
 * Run with the repo root as the working directory (it uses the repo's node_modules/playwright,
 * node_modules/mp4-muxer and tests/fixtures/aac-tone.m4a; the file itself can sit anywhere):
 *   node /path/to/diag-webkit-aac.cjs [outDir]          (outDir defaults to ./diag-out)
 * Engines: webkit and chromium (Playwright's own builds). DIAG_ENGINES=webkit,chromium,chrome
 * adds Google Chrome (channel "chrome"). DIAG_FAKE_ENCODER=asc|esds|adts replaces AudioEncoder
 * with a stub that replays the fixture's AAC frames (only for testing this script).
 *
 * In each engine, on a secure origin, it:
 *   A. decodes tests/fixtures/aac-tone.m4a (ffmpeg's AAC) with decodeAudioData and an <audio>;
 *   B. encodes a 1 s 440 Hz tone with AudioEncoder exactly as src/lib/audio/transcode.ts does
 *      and records what the encoder hands back (decoderConfig, description bytes, chunks);
 *   C. muxes those chunks with mp4-muxer as the app does (V0) and as candidate fixes
 *      (V1 no description, V2 ASC pulled out of an ES descriptor, V3 ADTS headers stripped,
 *      V4 a fresh 2-byte ASC from the configured rate/channels), then tries to decode and play
 *      each one in the same engine.
 * Then every produced file is tried in every other engine, and each file's MP4 boxes are dumped.
 * Output: <outDir>/report.json, <outDir>/<engine>-<variant>.m4a. Prints a short summary.
 */
const fs = require("fs");
const path = require("path");
// resolve from the repo (cwd), wherever this file sits
const pw = require(require.resolve("playwright", { paths: [process.cwd()] }));

const ROOT = process.cwd();
const OUT = path.resolve(process.argv[2] || "diag-out");
const FIXTURE = path.join(ROOT, "tests/fixtures/aac-tone.m4a");
const MUXER = path.join(ROOT, "node_modules/mp4-muxer/build/mp4-muxer.js");
const ENGINES = (process.env.DIAG_ENGINES || "webkit,chromium").split(",").map((s) => s.trim()).filter(Boolean);
const FAKE = process.env.DIAG_FAKE_ENCODER || "";
const ORIGIN = "https://diag.storysync.test";

fs.mkdirSync(OUT, { recursive: true });

/* ----------------------------------------------------------------- page side */

// Runs inside the browser. Must be self-contained.
async function inPage({ fixtureB64, fake }) {
  const out = { userAgent: navigator.userAgent, secure: isSecureContext, hasAudioEncoder: typeof AudioEncoder !== "undefined" };
  const hex = (u8, n = 96) => Array.from(u8.slice(0, n), (b) => b.toString(16).padStart(2, "0")).join("");
  const toB64 = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  const asU8 = (d) => (d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength));

  async function tryDecode(bytes) {
    try {
      const ctx = new OfflineAudioContext(1, 48000, 48000);
      const buf = await ctx.decodeAudioData(bytes.slice().buffer);
      return { ok: true, duration: +buf.duration.toFixed(3), sampleRate: buf.sampleRate, channels: buf.numberOfChannels };
    } catch (e) {
      return { ok: false, error: `${e && e.name}: ${e && e.message}` };
    }
  }
  function tryElement(bytes, how) {
    return new Promise((resolve) => {
      const a = document.createElement("audio");
      a.muted = true;
      let url = null;
      let settled = false;
      const done = (r) => {
        if (settled) return;
        settled = true;
        if (url) URL.revokeObjectURL(url);
        resolve({ ...r, readyState: a.readyState, currentTime: +a.currentTime.toFixed(3), duration: a.duration });
      };
      a.addEventListener("error", () => done({ ok: false, error: a.error ? `code ${a.error.code} ${a.error.message || ""}`.trim() : "error" }));
      a.addEventListener("ended", () => done({ ok: true, ended: true }));
      a.addEventListener("loadedmetadata", () => {
        a.play().catch((e) => done({ ok: false, error: `play(): ${e && e.name}: ${e && e.message}` }));
      });
      setTimeout(() => done({ ok: false, error: "timeout (8 s)" }), 8000);
      if (how === "data") a.src = `data:audio/mp4;base64,${toB64(bytes)}`;
      else a.src = url = URL.createObjectURL(new Blob([bytes], { type: "audio/mp4" }));
      a.load();
    });
  }
  async function tryAll(bytes) {
    return { decodeAudioData: await tryDecode(bytes), audioBlobUrl: await tryElement(bytes, "blob"), audioDataUrl: await tryElement(bytes, "data") };
  }

  /* ES descriptor → AudioSpecificConfig (accepts a bare ES_Descriptor, an esds body, or a whole esds box) */
  function readDesc(u8, pos) {
    const tag = u8[pos++];
    let size = 0;
    for (let n = 0; n < 4; n++) {
      const b = u8[pos++];
      size = (size << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return { tag, start: pos, end: pos + size };
  }
  function ascFromEsds(u8) {
    let p = 0;
    if (u8.length > 12 && String.fromCharCode(u8[4], u8[5], u8[6], u8[7]) === "esds") p = 12;
    else if (u8[0] !== 0x03 && u8[4] === 0x03) p = 4;
    if (u8[p] !== 0x03) return null;
    const es = readDesc(u8, p);
    p = es.start;
    const flags = u8[p + 2];
    p += 3;
    if (flags & 0x80) p += 2;
    if (flags & 0x40) p += 1 + u8[p];
    if (flags & 0x20) p += 2;
    if (u8[p] !== 0x04) return null;
    p = readDesc(u8, p).start + 13;
    if (u8[p] !== 0x05) return null;
    const dsi = readDesc(u8, p);
    return u8.slice(dsi.start, dsi.end);
  }
  function parseAsc(u8) {
    if (!u8 || u8.length < 2) return null;
    let bit = 0;
    const read = (n) => {
      let v = 0;
      for (let i = 0; i < n; i++, bit++) v = (v << 1) | ((u8[bit >> 3] >> (7 - (bit & 7))) & 1);
      return v;
    };
    let objectType = read(5);
    if (objectType === 31) objectType = 32 + read(6);
    const freqIndex = read(4);
    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    const sampleRate = freqIndex === 15 ? read(24) : rates[freqIndex];
    const channelConfig = read(4);
    return { objectType, freqIndex, sampleRate, channelConfig };
  }
  const isAdts = (d) => d.length > 7 && d[0] === 0xff && (d[1] & 0xf6) === 0xf0;
  const adtsHeaderLength = (d) => ((d[1] & 1) ? 7 : 9);
  function makeAsc(objectType, sampleRate, channels) {
    const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
    const fi = rates.indexOf(sampleRate);
    return new Uint8Array([(objectType << 3) | (fi >> 1), ((fi & 1) << 7) | (channels << 3)]);
  }

  /* A. baseline: ffmpeg's AAC/M4A */
  const fixture = fromB64(fixtureB64);
  out.fixture = await tryAll(fixture);

  /* optional stub encoder that replays the fixture's frames (script self-test only) */
  if (fake) {
    const frames = window.__fixtureFrames.map(fromB64);
    const asc = makeAsc(2, 48000, 1);
    const esds = new Uint8Array([0x03, 0x19, 0x00, 0x00, 0x00, 0x04, 0x11, 0x40, 0x15, 0, 0, 0, 0, 1, 0x77, 0, 0, 1, 0x77, 0, 0x05, 0x02, ...asc, 0x06, 0x01, 0x02]);
    window.AudioEncoder = class {
      static async isConfigSupported(c) { return { supported: true, config: c }; }
      constructor(init) { this.init = init; this.n = 0; }
      configure(c) { this.c = c; }
      encode() {}
      async flush() {
        frames.forEach((f, i) => {
          let data = f;
          if (fake === "adts") {
            const len = f.length + 7;
            data = new Uint8Array([0xff, 0xf1, 0x4c, 0x40 | (len >> 11), (len >> 3) & 0xff, ((len & 7) << 5) | 0x1f, 0xfc, ...f]);
          }
          const chunk = { type: "key", timestamp: Math.round((i * 1024 * 1e6) / 48000), duration: Math.round((1024 * 1e6) / 48000), byteLength: data.length, copyTo: (dst) => dst.set(data) };
          const meta = i === 0 ? { decoderConfig: { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 1, description: fake === "esds" ? esds.buffer : asc.buffer } } : undefined;
          this.init.output(chunk, meta);
        });
      }
      close() {}
    };
  }

  if (typeof AudioEncoder === "undefined") return out;
  const SR = 48000;
  const config = { codec: "mp4a.40.2", sampleRate: SR, numberOfChannels: 1, bitrate: 96000 };
  try {
    out.isConfigSupported = await AudioEncoder.isConfigSupported(config).then((r) => ({ supported: r.supported, config: JSON.parse(JSON.stringify(r.config)) }));
  } catch (e) {
    out.isConfigSupported = { error: String(e) };
  }
  if (!out.isConfigSupported.supported) return out;

  /* B. encode a 1 s tone exactly as transcode.ts encodeAacM4a does */
  const pcm = new Float32Array(SR);
  for (let i = 0; i < SR; i++) pcm[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / SR);
  const chunks = [];
  const metas = [];
  let encoderError = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ type: chunk.type, timestamp: chunk.timestamp, duration: chunk.duration, data });
      metas.push(meta);
    },
    error: (e) => {
      encoderError = String(e);
    },
  });
  encoder.configure(config);
  for (let offset = 0; offset < pcm.length; offset += SR) {
    const slice = pcm.subarray(offset, Math.min(offset + SR, pcm.length));
    const data = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: slice.length, numberOfChannels: 1, timestamp: Math.round((offset / SR) * 1e6), data: slice.slice().buffer });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();

  const firstMetaIndex = metas.findIndex((m) => m && m.decoderConfig);
  const dc = firstMetaIndex >= 0 ? metas[firstMetaIndex].decoderConfig : null;
  let desc = null;
  if (dc && dc.description) {
    const u8 = asU8(dc.description);
    const fromEsds = ascFromEsds(u8);
    desc = {
      jsType: Object.prototype.toString.call(dc.description),
      byteLength: u8.length,
      hex: hex(u8, 128),
      parsedAsAsc: parseAsc(u8),
      looksLikeEsDescriptor: u8[0] === 0x03 || (u8.length > 8 && String.fromCharCode(u8[4], u8[5], u8[6], u8[7]) === "esds"),
      ascFromEsds: fromEsds ? { hex: hex(fromEsds), parsed: parseAsc(fromEsds) } : null,
    };
  }
  out.encoder = {
    error: encoderError,
    chunkCount: chunks.length,
    metasWithDecoderConfig: metas.filter((m) => m && m.decoderConfig).length,
    firstMetaIndex,
    decoderConfig: dc ? { keys: Object.keys(dc), codec: dc.codec, sampleRate: dc.sampleRate, numberOfChannels: dc.numberOfChannels, hasDescriptionKey: "description" in dc, description: desc } : null,
    firstChunks: chunks.slice(0, 4).map((c) => ({ type: c.type, timestamp: c.timestamp, duration: c.duration, byteLength: c.data.length, head: hex(c.data, 12), adts: isAdts(c.data) })),
    lastChunk: chunks.length ? (({ type, timestamp, duration, data }) => ({ type, timestamp, duration, byteLength: data.length }))(chunks[chunks.length - 1]) : null,
    totalBytes: chunks.reduce((n, c) => n + c.data.length, 0),
    anyAdts: chunks.some((c) => isAdts(c.data)),
    durationsNullOrZero: chunks.filter((c) => !c.duration).length,
  };

  /* C. mux as the app does, and as candidate fixes */
  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  function mux(transformMeta, transformData) {
    const muxer = new Muxer({ target: new ArrayBufferTarget(), audio: { codec: "aac", sampleRate: SR, numberOfChannels: 1 }, fastStart: "in-memory" });
    chunks.forEach((c, i) => {
      const meta = transformMeta(metas[i]);
      const data = transformData ? transformData(c.data) : c.data;
      const chunk = new EncodedAudioChunk({ type: c.type, timestamp: c.timestamp, duration: c.duration ?? undefined, data });
      muxer.addAudioChunk(chunk, meta);
    });
    muxer.finalize();
    return new Uint8Array(muxer.target.buffer);
  }
  const withDescription = (m, d) => (m && m.decoderConfig ? { ...m, decoderConfig: { ...m.decoderConfig, description: d } } : m);
  const withoutDescription = (m) => {
    if (!m || !m.decoderConfig) return m;
    const { description, ...rest } = m.decoderConfig; // eslint-disable-line no-unused-vars
    return { ...m, decoderConfig: rest };
  };
  const variants = {
    "V0-as-app": () => mux((m) => m),
    "V1-no-description": () => mux(withoutDescription),
    "V4-fresh-asc": () => mux((m) => withDescription(m, makeAsc(2, SR, 1))),
  };
  if (desc && desc.ascFromEsds) variants["V2-asc-from-esds"] = () => mux((m) => withDescription(m, fromB64(toB64(ascFromEsds(asU8(dc.description))))));
  if (out.encoder.anyAdts) variants["V3-adts-stripped"] = () => mux(withoutDescription, (d) => (isAdts(d) ? d.subarray(adtsHeaderLength(d)) : d));
  out.variants = {};
  out.files = {};
  for (const [name, build] of Object.entries(variants)) {
    try {
      const bytes = build();
      out.files[name] = toB64(bytes);
      out.variants[name] = { byteLength: bytes.length, ...(await tryAll(bytes)) };
    } catch (e) {
      out.variants[name] = { muxError: `${e && e.name}: ${e && e.message}` };
    }
  }
  return out;
}

async function crossTry({ b64 }) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    const ctx = new OfflineAudioContext(1, 48000, 48000);
    const buf = await ctx.decodeAudioData(bytes.slice().buffer);
    return { ok: true, duration: +buf.duration.toFixed(3) };
  } catch (e) {
    return { ok: false, error: `${e && e.name}: ${e && e.message}` };
  }
}

/* --------------------------------------------------------------- node side */

/** A small MP4 box dumper: the parts that matter for an AAC audio track. */
function dumpMp4(buf) {
  const out = [];
  const u32 = (o) => buf.readUInt32BE(o);
  const type = (o) => buf.toString("latin1", o + 4, o + 8);
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "udta", "dinf"]);
  function walk(start, end, depth) {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(o);
      const t = type(o);
      let header = 8;
      if (size === 1) {
        size = Number(buf.readBigUInt64BE(o + 8));
        header = 16;
      } else if (size === 0) size = end - o;
      if (size < header || o + size > end) {
        out.push(`${"  ".repeat(depth)}!! bad box '${t}' size ${size} at ${o}`);
        return;
      }
      const body = o + header;
      let note = "";
      if (t === "ftyp") note = `major=${buf.toString("latin1", body, body + 4)} brands=${buf.toString("latin1", body + 8, o + size).match(/.{4}/g)}`;
      if (t === "mvhd" || t === "mdhd") {
        const v = buf[body];
        const ts = v === 1 ? u32(body + 20) : u32(body + 12);
        const dur = v === 1 ? Number(buf.readBigUInt64BE(body + 24)) : u32(body + 16);
        note = `timescale=${ts} duration=${dur} (${(dur / ts).toFixed(3)} s)`;
      }
      if (t === "hdlr") note = `handler=${buf.toString("latin1", body + 8, body + 12)}`;
      if (t === "stts" || t === "elst" || t === "stsc") {
        const n = u32(body + 4);
        const w = t === "stsc" ? 12 : t === "elst" ? (buf[body] === 1 ? 20 : 12) : 8;
        const entries = [];
        for (let i = 0; i < Math.min(n, 4); i++) {
          const e = body + 8 + i * w;
          entries.push(t === "elst" && buf[body] !== 1 ? [u32(e), buf.readInt32BE(e + 4)] : Array.from({ length: w / 4 }, (_, k) => u32(e + k * 4)));
        }
        note = `entries=${n} first=${JSON.stringify(entries)}`;
      }
      if (t === "stsz") note = `defaultSize=${u32(body + 4)} count=${u32(body + 8)}`;
      if (t === "stco") note = `count=${u32(body + 4)} first=${u32(body + 8)}`;
      if (t === "mdat") note = `bytes=${size - header}`;
      out.push(`${"  ".repeat(depth)}${t} [${size}] ${note}`.trimEnd());
      if (containers.has(t)) walk(body, o + size, depth + 1);
      if (t === "stsd") {
        const entry = body + 8;
        const et = type(entry);
        const es = u32(entry);
        if (et === "mp4a") {
          const ch = buf.readUInt16BE(entry + 24);
          const bits = buf.readUInt16BE(entry + 26);
          const rate = u32(entry + 32) / 65536;
          out.push(`${"  ".repeat(depth + 1)}mp4a [${es}] channels=${ch} sampleSize=${bits} sampleRate=${rate}`);
          let c = entry + 36;
          while (c + 8 <= entry + es) {
            const cs = u32(c);
            if (cs < 8) break;
            out.push(`${"  ".repeat(depth + 2)}${type(c)} [${cs}] ${buf.subarray(c + 8, c + cs).toString("hex")}`);
            c += cs;
          }
        } else out.push(`${"  ".repeat(depth + 1)}${et} [${es}]`);
      }
      o += size;
    }
  }
  walk(0, buf.length, 0);
  return out;
}

/** The fixture's raw AAC frames (for the DIAG_FAKE_ENCODER self-test). */
function fixtureFrames(buf) {
  const find = (start, end, path) => {
    let o = start;
    while (o + 8 <= end) {
      const size = buf.readUInt32BE(o);
      const t = buf.toString("latin1", o + 4, o + 8);
      if (t === path[0]) return path.length === 1 ? [o + 8, o + size] : find(o + 8, o + size, path.slice(1));
      o += size;
    }
    return null;
  };
  const [stsz] = find(0, buf.length, ["moov", "trak", "mdia", "minf", "stbl", "stsz"]);
  const [stco] = find(0, buf.length, ["moov", "trak", "mdia", "minf", "stbl", "stco"]);
  const [stsc] = find(0, buf.length, ["moov", "trak", "mdia", "minf", "stbl", "stsc"]);
  const count = buf.readUInt32BE(stsz + 8);
  const sizes = Array.from({ length: count }, (_, i) => buf.readUInt32BE(stsz + 12 + i * 4));
  const chunkOffsets = Array.from({ length: buf.readUInt32BE(stco + 4) }, (_, i) => buf.readUInt32BE(stco + 8 + i * 4));
  const stscEntries = Array.from({ length: buf.readUInt32BE(stsc + 4) }, (_, i) => [buf.readUInt32BE(stsc + 8 + i * 12), buf.readUInt32BE(stsc + 12 + i * 12)]);
  const frames = [];
  let s = 0;
  chunkOffsets.forEach((off, ci) => {
    let per = stscEntries[0][1];
    for (const [first, n] of stscEntries) if (ci + 1 >= first) per = n;
    for (let k = 0; k < per && s < count; k++) {
      frames.push(buf.subarray(off, off + sizes[s]).toString("base64"));
      off += sizes[s++];
    }
  });
  return frames;
}

async function launch(engine) {
  if (engine === "chrome") return pw.chromium.launch({ channel: "chrome" });
  if (engine === "chromium" && fs.existsSync("/opt/pw-browsers/chromium")) return pw.chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  return pw[engine].launch();
}

async function openPage(browser, extraInit) {
  const page = await browser.newPage();
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/mp4-muxer.js") return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(MUXER) });
    return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta charset="utf-8"><title>diag</title><script src="/mp4-muxer.js"></script>' });
  });
  if (extraInit) await page.addInitScript(extraInit.fn, extraInit.arg);
  await page.goto(`${ORIGIN}/`);
  return page;
}

(async () => {
  const fixture = fs.readFileSync(FIXTURE);
  const report = { when: new Date().toISOString(), node: process.version, platform: `${process.platform} ${process.arch}`, engines: {}, cross: {}, boxes: {} };
  const files = {};
  for (const engine of ENGINES) {
    let browser;
    try {
      browser = await launch(engine);
      const init = FAKE ? { fn: (frames) => { window.__fixtureFrames = frames; }, arg: fixtureFrames(fixture) } : null;
      const page = await openPage(browser, init);
      const r = await page.evaluate(inPage, { fixtureB64: fixture.toString("base64"), fake: FAKE });
      r.browserVersion = browser.version();
      for (const [name, b64] of Object.entries(r.files || {})) {
        const file = `${engine}-${name}.m4a`;
        fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, "base64"));
        files[file] = b64;
      }
      delete r.files;
      report.engines[engine] = r;
    } catch (e) {
      report.engines[engine] = { launchOrRunError: String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e) };
    } finally {
      if (browser) await browser.close();
    }
  }
  report.boxes["fixture aac-tone.m4a"] = dumpMp4(fixture);
  for (const [file, b64] of Object.entries(files)) report.boxes[file] = dumpMp4(Buffer.from(b64, "base64"));
  for (const engine of ENGINES) {
    if (report.engines[engine] && report.engines[engine].launchOrRunError) continue;
    let browser;
    try {
      browser = await launch(engine);
      const page = await openPage(browser);
      report.cross[engine] = {};
      for (const [file, b64] of Object.entries(files)) report.cross[engine][file] = await page.evaluate(crossTry, { b64 });
    } catch (e) {
      report.cross[engine] = { error: String(e) };
    } finally {
      if (browser) await browser.close();
    }
  }
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  /* summary */
  const ok = (x) => (x ? (x.ok ? "ok" : `FAIL (${x.error})`) : "-");
  for (const [engine, r] of Object.entries(report.engines)) {
    console.log(`\n=== ${engine} ${r.browserVersion || ""}`);
    if (r.launchOrRunError) {
      console.log(`  could not run: ${r.launchOrRunError}`);
      continue;
    }
    console.log(`  secure=${r.secure} AudioEncoder=${r.hasAudioEncoder} supported=${r.isConfigSupported && r.isConfigSupported.supported}`);
    console.log(`  fixture: decodeAudioData ${ok(r.fixture.decodeAudioData)} | <audio> blob ${ok(r.fixture.audioBlobUrl)} | <audio> data ${ok(r.fixture.audioDataUrl)}`);
    if (r.encoder) {
      const d = r.encoder.decoderConfig;
      console.log(`  encoder: ${r.encoder.chunkCount} chunks, error=${r.encoder.error}, adts=${r.encoder.anyAdts}, zero durations=${r.encoder.durationsNullOrZero}`);
      console.log(`  decoderConfig: ${d ? JSON.stringify({ codec: d.codec, sampleRate: d.sampleRate, channels: d.numberOfChannels, keys: d.keys }) : "none"}`);
      console.log(`  description: ${d && d.description ? `${d.description.byteLength} bytes ${d.description.hex} asESDS=${d.description.looksLikeEsDescriptor} asc=${JSON.stringify(d.description.parsedAsAsc)} ascFromEsds=${JSON.stringify(d.description.ascFromEsds)}` : "none"}`);
      console.log(`  first chunks: ${JSON.stringify(r.encoder.firstChunks)}`);
    }
    for (const [name, v] of Object.entries(r.variants || {})) {
      console.log(`  ${name}: ${v.muxError ? `mux error ${v.muxError}` : `decodeAudioData ${ok(v.decodeAudioData)} | <audio> blob ${ok(v.audioBlobUrl)} | <audio> data ${ok(v.audioDataUrl)}`}`);
    }
  }
  for (const [engine, files] of Object.entries(report.cross)) {
    console.log(`\n=== decodeAudioData in ${engine} of every produced file`);
    for (const [file, r] of Object.entries(files)) console.log(`  ${file}: ${ok(r)}`);
  }
  console.log(`\nfull report: ${path.join(OUT, "report.json")}`);
})();
