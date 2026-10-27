// Janela escondida que pega o som do PC (loopback) para as gravações e manda para o processo principal em PCM
// 16 bits, 48 kHz, estéreo. A imagem que vem junto é descartada: o vídeo é capturado pelo ffmpeg.
const api = window.cartucho;

async function start() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((t) => t.stop());
  if (!stream.getAudioTracks().length) throw new Error('sem trilha de som');
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 2, 2);
  node.onaudioprocess = (e) => {
    const input = e.inputBuffer;
    const left = input.getChannelData(0);
    const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
    const out = new Int16Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
      out[i * 2] = Math.max(-1, Math.min(1, left[i])) * 0x7fff;
      out[i * 2 + 1] = Math.max(-1, Math.min(1, right[i])) * 0x7fff;
    }
    api.sendAudio(new Uint8Array(out.buffer));
  };
  // A saída fica em silêncio (nada é escrito nela); a ligação só existe para o processamento rodar.
  source.connect(node);
  node.connect(ctx.destination);
}

start().catch((err) => api.sendAudioError(err && err.message ? err.message : String(err)));
