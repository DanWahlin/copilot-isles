// Injected before any page script (page.addInitScript) by tools/video/lib.mjs. It taps every node
// that connects to an AudioContext's destination into a recorder, so the game's mix (voices, music,
// ambience, sfx) is captured without any change to the game. Nothing here runs in normal play.
//
// window.__rec.start() begins capturing 16-bit stereo PCM and returns the epoch ms of its first
// sample; the PCM is pushed to Node in ~1 s chunks through the exposed `__recPush(base64)`.
// window.__rec.stop() flushes and resolves with { frames, sampleRate }.
(() => {
  if (window.__rec) return;
  const connect = AudioNode.prototype.connect;
  const taps = new Map();
  let lastCtx = null;

  const WORKLET = `
    class RecTap extends AudioWorkletProcessor {
      constructor() {
        super();
        this.from = Infinity;
        this.until = Infinity;
        this.buf = new Int16Array(48000 * 2);
        this.n = 0;
        this.port.onmessage = (e) => {
          if (e.data.start !== undefined) {
            this.from = e.data.start;
            this.until = Infinity;
            this.first = undefined;
          }
          if (e.data.stop) this.until = currentFrame;
        };
      }
      flush(final) {
        if (this.n) this.port.postMessage({ pcm: this.buf.slice(0, this.n * 2) });
        this.n = 0;
        if (final) this.port.postMessage({ done: true });
      }
      process(inputs) {
        const f0 = currentFrame;
        if (this.until === -1) return true;
        if (f0 >= this.until) {
          this.flush(true);
          this.until = -1;
          return true;
        }
        const input = inputs[0];
        const l = input && input[0];
        const r = input && (input[1] || input[0]);
        const len = l ? l.length : 128;
        for (let i = 0; i < len; i++) {
          if (f0 + i < this.from) continue;
          if (this.first === undefined) {
            this.first = f0 + i;
            this.port.postMessage({ first: this.first });
          }
          const a = l ? Math.max(-1, Math.min(1, l[i])) : 0;
          const b = r ? Math.max(-1, Math.min(1, r[i])) : 0;
          this.buf[this.n * 2] = a * 32767;
          this.buf[this.n * 2 + 1] = b * 32767;
          this.n++;
          if (this.n * 2 >= this.buf.length) this.flush(false);
        }
        return true;
      }
    }
    registerProcessor('rec-tap', RecTap);
  `;

  function tapFor(ctx) {
    let t = taps.get(ctx);
    if (t) return t;
    const input = ctx.createGain();
    input.channelCount = 2;
    input.channelCountMode = 'explicit';
    t = { ctx, input, node: null, ready: null };
    const tap = t;
    t.ready = ctx.audioWorklet
      .addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })))
      .then(() => {
        const node = new AudioWorkletNode(ctx, 'rec-tap', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
        });
        const mute = ctx.createGain();
        mute.gain.value = 0;
        connect.call(input, node);
        connect.call(node, mute);
        connect.call(mute, ctx.destination);
        tap.node = node;
      })
      .catch((e) => console.warn('[rec] worklet failed', e));
    taps.set(ctx, t);
    return t;
  }

  AudioNode.prototype.connect = function (dest, output, input) {
    const r = connect.call(this, dest, output, input);
    try {
      if (dest instanceof AudioDestinationNode) {
        const t = tapFor(this.context);
        lastCtx = this.context;
        connect.call(this, t.input, output ?? 0);
      }
    } catch (e) {
      console.warn('[rec] tap failed', e);
    }
    return r;
  };

  let pending = Promise.resolve();
  let frames = 0;
  let finished = null;
  let first = null;
  let startFrame = 0;
  window.__rec = {
    state: () => (lastCtx ? lastCtx.state : 'none'),
    /** The context being recorded (the game's), for tools that add their own test sounds. */
    context: () => lastCtx,
    async start() {
      const t = lastCtx && taps.get(lastCtx);
      if (!t) return null;
      await t.ready;
      if (!t.node) return null;
      frames = 0;
      first = null;
      finished = new Promise((resolve) => {
        t.node.port.onmessage = (e) => {
          if (e.data.first !== undefined) first = e.data.first;
          if (e.data.pcm) {
            frames += e.data.pcm.length / 2;
            const bytes = new Uint8Array(e.data.pcm.buffer);
            let s = '';
            for (let i = 0; i < bytes.length; i += 0x8000)
              s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            const b64 = btoa(s);
            pending = pending.then(() => window.__recPush(b64));
          }
          if (e.data.done) pending.then(() => resolve());
        };
      });
      // The first captured sample is the one the context renders as this JS turn reads currentTime.
      const ctx = t.ctx;
      const start = Math.ceil(ctx.currentTime * ctx.sampleRate);
      startFrame = start;
      const at = performance.timeOrigin + performance.now();
      t.node.port.postMessage({ start });
      return { at, sampleRate: ctx.sampleRate };
    },
    async stop() {
      const t = lastCtx && taps.get(lastCtx);
      if (!t?.node || !finished) return null;
      t.node.port.postMessage({ stop: true });
      await finished;
      await pending;
      // Samples the worklet had already rendered before the start message reached it are lost, so
      // the first one captured may be a little later than `start`.
      return { frames, sampleRate: t.ctx.sampleRate, late: first === null ? 0 : first - startFrame };
    },
  };
})();
