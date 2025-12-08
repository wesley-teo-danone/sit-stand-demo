import {
    DrawingUtils
  } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
  
import { video } from './camera.js';
const canvas = document.getElementById('output_canvas');
const ctx = canvas.getContext('2d');
const drawingUtils = new DrawingUtils(ctx);


export function adjustCanvasSize() {
    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
  }


  export{drawingUtils,canvas,ctx};