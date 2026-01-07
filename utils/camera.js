import { canvas, adjustCanvasSize } from './canvas.js';
import { predict } from '../script.js';
const video = document.getElementById('webcam');
const spinner = document.getElementById('spinner');

export async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      spinner.style.display = 'none';

      adjustCanvasSize();

      video.style.visibility = 'visible';
      video.style.opacity = 1;
      canvas.style.visibility = 'visible';
      canvas.style.opacity = 1;
      requestAnimationFrame(predict);
    };
  } catch (error) {
    console.error('[getUserMedia]', error?.name, error?.message);
    alert('Camera access denied or unavailable.');
  }
}

export { video };
