// Shared camera / microphone streams for the site-visit screen.
//
// Every getUserMedia() call can make the browser ask "Allow camera /
// microphone?" again (Safari especially), so instead of opening a new stream
// each time the camera tab is shown or a voice memo starts, the screen opens
// each device once and reuses it:
//   • the camera stays open while you're on the site-visit screen and is
//     released when you leave it or the app goes to the background;
//   • the microphone is kept for a short while after a memo (so back-to-back
//     memos don't ask again) and then released, so the "mic in use"
//     indicator doesn't stay on.
// A track the system ends (e.g. tapping the iPad's recording indicator)
// drops out of the cache, and the next request opens a fresh one.

const MIC_IDLE_MS = 60 * 1000

const cache = { camera: null, mic: null }
let micTimer = null

const alive = (stream) => stream && stream.getTracks().some((t) => t.readyState === 'live')

function remember(kind, stream) {
  cache[kind] = stream
  for (const t of stream.getTracks()) {
    t.addEventListener('ended', () => { if (cache[kind] === stream) cache[kind] = null })
  }
  return stream
}

const VIDEO = { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }
const AUDIO = { echoCancellation: true, noiseSuppression: true }

// The camera is opened TOGETHER with the microphone: iOS/iPadOS allows one
// capture at a time, so opening the mic separately for a voice memo would cut
// the camera off (and re-opening the camera would cut the mic off — a loop of
// permission prompts). One combined stream = one prompt, and memos recorded
// from the camera screen reuse its audio track.
export async function getCameraStream() {
  if (alive(cache.camera)) return cache.camera
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: AUDIO })
  } catch (err) {
    // Mic refused / missing: still give them the camera.
    if (err?.name === 'NotAllowedError' && !(await cameraAllowed())) throw err
    stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false })
  }
  return remember('camera', stream)
}

async function cameraAllowed() {
  try { return (await navigator.permissions?.query({ name: 'camera' }))?.state !== 'denied' } catch { return true }
}

// A stream for recording a voice memo. If the camera is open with a live mic
// track, reuse that (no new capture, no prompt); otherwise open the mic alone.
export async function getMicStream() {
  clearTimeout(micTimer)
  const camAudio = alive(cache.camera) ? cache.camera.getAudioTracks().filter((t) => t.readyState === 'live') : []
  if (camAudio.length) return new MediaStream(camAudio)
  if (alive(cache.mic)) return cache.mic
  const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO })
  return remember('mic', stream)
}

// Called when a memo finishes: keep the mic around briefly for the next one.
export function idleMic() {
  clearTimeout(micTimer)
  micTimer = setTimeout(() => release('mic'), MIC_IDLE_MS)
}

export function release(kind) {
  const kinds = kind ? [kind] : ['camera', 'mic']
  for (const k of kinds) {
    cache[k]?.getTracks().forEach((t) => t.stop())
    cache[k] = null
  }
  if (!kind || kind === 'mic') clearTimeout(micTimer)
}
