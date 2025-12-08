

   export function defaultFilenameBase() {
    const { studyId, visitId } = (window.APP_DATA || {});
    const sid = studyId ;
    const vid = visitId ;
    const date = dateDDMMYYYY();
    if (!sid || sid === 'unknown') {
    return `session-${vid}-${date}`;
    }
    return `${sid}-${vid}-${date}`;
    }




    export function sanitizePart(s) {
  return String(s || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, ''); // keep alnum, dot, underscore, dash
}
    export function dateDDMMYYYY(d = new Date()) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}${mm}${yyyy}`;
    }

function pickSupported(types) {
  for (const t of types) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return ''; // let browser choose
}
function guessExt(mime) {
  return mime?.includes('mp4') ? 'mp4' : 'webm';
}
function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

const RawSessionRecorder = (() => {
  let mediaRecorder = null;
  let chunks = [];
  let outStream = null;   
  let lastMime = '';

  async function start({ videoEl, includeMic = false, videoBitsPerSecond } = {}) {
    const video = videoEl || document.getElementById('webcam') || document.querySelector('video');
    if (!video) throw new Error('RawSessionRecorder.start: <video> element not found.');

    let camStream = video.srcObject;
    if (!(camStream instanceof MediaStream)) {
      camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    const vTrack = camStream.getVideoTracks()[0];
    if (!vTrack) throw new Error('No video track available from camera.');

    outStream = new MediaStream();
    outStream.addTrack(vTrack.clone());

    // Optional audio
    if (includeMic) {
      const aTrack = camStream.getAudioTracks?.()[0];
      if (aTrack) {
        outStream.addTrack(aTrack.clone());
      } else {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const micTrack = mic.getAudioTracks()[0];
          if (micTrack) outStream.addTrack(micTrack);
        } catch (e) {
          console.warn('[RawSessionRecorder] Mic unavailable; continuing video-only.', e);
        }
      }
    }

    chunks = [];
    const mimeType = pickSupported([
      'video/mp4;codecs=h264,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ]);
    lastMime = mimeType || '';

    const opts = lastMime ? { mimeType: lastMime } : {};
    if (videoBitsPerSecond) opts.videoBitsPerSecond = videoBitsPerSecond;

    mediaRecorder = new MediaRecorder(outStream, opts);
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mediaRecorder.start();
  }




  function stop({ download = true, filenameBase = defaultFilenameBase() } = {}) {
 return new Promise((resolve) => {
   if (!mediaRecorder) return resolve(null);
   mediaRecorder.onstop = () => {
     try {
       // Stop our cloned tracks
       outStream?.getTracks().forEach(t => t.stop());
       const type = mediaRecorder.mimeType || lastMime || 'video/webm';
       const ext  = guessExt(type);        // your existing helper
       const blob = new Blob(chunks, { type });
       const url  = URL.createObjectURL(blob);
       // Build final filename
       const base = sanitizePart(filenameBase) || defaultFilenameBase();
       const filename = `${base}.${ext}`;
       if (download) {
         const a = document.createElement('a');
         a.href = url;
         a.download = filename;
         document.body.appendChild(a);
         a.click();
         a.remove();
         setTimeout(() => URL.revokeObjectURL(url), 10_000);
       }
       mediaRecorder = null;
       chunks = [];
       outStream = null;
       lastMime = '';
       resolve({ blob, url, filename, type });
     } catch (err) {
       console.error('[RawSessionRecorder] stop failed:', err);
       resolve(null);
     }
   };
   mediaRecorder.stop();
 });
}


  function isRecording() {
    return !!mediaRecorder && mediaRecorder.state === 'recording';
  }

  return { start, stop, isRecording };
})();

// Thin exports you can import from sitstand.js
export async function startSessionRecording(opts = {}) {
  try { await RawSessionRecorder.start(opts); }
  catch (e) { console.error('[startSessionRecording] failed:', e); throw e; }
}





export async function stopSessionRecording(reason = 'finished') {
  const filenameBase = defaultFilenameBase();

  try {
    return await RawSessionRecorder.stop({
      download: false,          // <-- IMPORTANT: no direct video download
      filenameBase,
    });
  } catch (e) {
    console.error('[stopSessionRecording] failed:', e);
    return null;
  }
}

export function isSessionRecording() {
  return RawSessionRecorder.isRecording();
}

