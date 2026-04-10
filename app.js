const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const selectBtn = document.getElementById("select-btn");
const resetBtn = document.getElementById("reset-btn");
const canvas = document.getElementById("main-canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const uploadHint = document.getElementById("upload-hint");
const canvasContainer = document.getElementById("canvas-container");
const stopCountInput = document.getElementById("stop-count");
const stopCountVal = document.getElementById("stop-count-val");
const gradientPreview = document.getElementById("gradient-preview");

const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomLevelVal = document.getElementById("zoom-level-val");

const svgOutput = document.getElementById("svg-output");
const cssOutput = document.getElementById("css-output");
const copySvgBtn = document.getElementById("copy-svg");
const copyCssBtn = document.getElementById("copy-css");
const toast = document.getElementById("toast");
const zoomControl = document.getElementById("zoom-control");

let img = new Image();
let startPoint = { x: 0, y: 0 };
let endPoint = { x: 0, y: 0 };
let isDragging = false;
let hasImage = false;
let zoomLevel = 1.0;
let panX = 0;
let panY = 0;
let initialPinchDistance = null;
let initialPinchZoom = null;
let lastTouchPos = { x: 0, y: 0 };
let touchWaitTimer = null;

// Image selection
selectBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

// Drag and drop
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag-over");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// Click to upload when no image
dropzone.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!hasImage && e.target !== fileInput) {
    fileInput.click();
  }
});

// Clipboard
window.addEventListener("paste", (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let item of items) {
    if (item.type.indexOf("image") !== -1) {
      e.preventDefault();
      const blob = item.getAsFile();
      handleFile(blob);
      break;
    }
  }
});

// Reset
resetBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (window.confirm("이미지를 정말로 초기화하시겠습니까?")) {
    resetApp();
  }
});

stopCountInput.addEventListener("input", (e) => {
  stopCountVal.value = e.target.value;
  updateGradient();
});

stopCountVal.addEventListener("input", (e) => {
  let val = parseInt(e.target.value);
  if (isNaN(val)) return;

  stopCountInput.value = Math.max(2, Math.min(20, val));
  updateGradient();
});

stopCountVal.addEventListener("blur", (e) => {
  let val = parseInt(e.target.value);
  if (isNaN(val) || val < 2) val = 2;
  if (val > 100) val = 100;
  stopCountVal.value = val;
  stopCountInput.value = Math.max(2, Math.min(20, val));
  updateGradient();
});

// Zoom logic
zoomInBtn.addEventListener("click", () => {
  const nextZoom = (Math.floor(zoomLevel * 20 + 0.1) + 1) / 20;
  adjustZoom(nextZoom - zoomLevel);
});

zoomOutBtn.addEventListener("click", () => {
  const nextZoom = (Math.ceil(zoomLevel * 20 - 0.1) - 1) / 20;
  adjustZoom(nextZoom - zoomLevel);
});

canvasContainer.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = -e.deltaY * 0.005;

      const rect = canvasContainer.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      adjustZoom(delta, mouseX, mouseY);
    } else {
      e.preventDefault();
      panX -= e.deltaX;
      panY -= e.deltaY;
      updateCanvasDisplay();
    }
  },
  { passive: false },
);

let isPinching = false;
let pinchData = {
  initialDistance: 0,
  initialScale: 1,
  initialMidpoint: { x: 0, y: 0 },
  initialPan: { x: 0, y: 0 }
};

function getMidpoint(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2
  };
}

function startPointDragging(e) {
  if (!hasImage || isPinching) return;
  isDragging = true;
  const pos = e.touches ? e.touches[0] : e;
  const coord = getCanvasCoordinates(pos);
  startPoint = coord;
  endPoint = { ...startPoint };
  updateGradient();
}

function movePointDragging(e) {
  if (!isDragging || isPinching) return;

  if (e.touches && e.touches.length > 1) {
    isDragging = false;
    return;
  }

  const pos = e.touches ? e.touches[0] : e;
  let coord = getCanvasCoordinates(pos);
  let targetX = coord.x;
  let targetY = coord.y;

  if (!e.touches && e.ctrlKey) {
    const dx = targetX - startPoint.x;
    const dy = targetY - startPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dy, dx);
    const snapDegrees = 15;
    const snappedDegrees = Math.round(angle * (180 / Math.PI) / snapDegrees) * snapDegrees;
    const snappedAngle = snappedDegrees * (Math.PI / 180);
    targetX = startPoint.x + Math.cos(snappedAngle) * dist;
    targetY = startPoint.y + Math.sin(snappedAngle) * dist;
  }

  endPoint = {
    x: Math.max(0, Math.min(canvas.width, targetX)),
    y: Math.max(0, Math.min(canvas.height, targetY)),
  };
  updateGradient();
  if (e.touches) e.preventDefault();
}

function stopPointDragging() {
  isDragging = false;
}

// Canvas Point Drag Events
canvas.addEventListener("mousedown", startPointDragging);
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    if (touchWaitTimer) clearTimeout(touchWaitTimer);
    touchWaitTimer = setTimeout(() => {
      if (!isPinching) startPointDragging(e);
      touchWaitTimer = null;
    }, 100);
    e.preventDefault();
  }
}, { passive: false });

window.addEventListener("mousemove", movePointDragging);
window.addEventListener("touchmove", (e) => {
  if (isDragging) movePointDragging(e);
}, { passive: false });

window.addEventListener("mouseup", stopPointDragging);
window.addEventListener("touchend", (e) => {
  stopPointDragging();
  if (e.touches.length === 0) {
    isPinching = false;
  }
});

// Canvas Container Viewport Events (Pan & Zoom)
canvasContainer.addEventListener(
  "touchstart",
  (e) => {
    if (!hasImage) return;

    if (e.touches.length >= 2) {
      if (touchWaitTimer) {
        clearTimeout(touchWaitTimer);
        touchWaitTimer = null;
      }
      isDragging = false;
      isPinching = true;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchData.initialDistance = getTouchDistance(e.touches);
      const mid = getMidpoint(t1, t2);
      const rect = canvasContainer.getBoundingClientRect();
      pinchData.initialMidpoint = {
        x: mid.x - rect.left - rect.width / 2,
        y: mid.y - rect.top - rect.height / 2
      };
      pinchData.initialScale = zoomLevel;
      pinchData.initialPan = { x: panX, y: panY };
    } else if (e.touches.length === 1) {
      lastTouchPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  },
  { passive: false },
);

canvasContainer.addEventListener(
  "touchmove",
  (e) => {
    if (!hasImage) return;

    if (e.touches.length >= 2) {
      isDragging = false;
      isPinching = true;
      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = getTouchDistance(e.touches);
      const currentMidRaw = getMidpoint(t1, t2);
      const rect = canvasContainer.getBoundingClientRect();
      const currentMid = {
        x: currentMidRaw.x - rect.left - rect.width / 2,
        y: currentMidRaw.y - rect.top - rect.height / 2
      };

      if (pinchData.initialDistance > 0) {
        const scaleRatio = currentDist / pinchData.initialDistance;
        zoomLevel = Math.max(0.05, Math.min(20, pinchData.initialScale * scaleRatio));

        const ratio = zoomLevel / pinchData.initialScale;
        panX = currentMid.x - (pinchData.initialMidpoint.x - pinchData.initialPan.x) * ratio;
        panY = currentMid.y - (pinchData.initialMidpoint.y - pinchData.initialPan.y) * ratio;

        zoomLevelVal.textContent = Math.round(zoomLevel * 100) + "%";
        updateCanvasDisplay();
        updateGradient();
      }
    }
  },
  { passive: false },
);

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function adjustZoom(delta, centerX = 0, centerY = 0) {
  const oldZoom = zoomLevel;
  const sensitivity = 0.8;
  zoomLevel = Math.max(0.05, Math.min(20, zoomLevel + delta * zoomLevel * sensitivity));

  if (oldZoom !== zoomLevel) {
    const ratio = zoomLevel / oldZoom;
    panX = centerX - (centerX - panX) * ratio;
    panY = centerY - (centerY - panY) * ratio;
    zoomLevelVal.textContent = Math.round(zoomLevel * 100) + "%";
    updateCanvasDisplay();
    updateGradient();
  }
}

function getCanvasCoordinates(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// Copy buttons
copySvgBtn.addEventListener("click", () =>
  copyToClipboard(svgOutput.innerText, "SVG 코드가 복사되었습니다!"),
);
copyCssBtn.addEventListener("click", () => {
  copyToClipboard(cssOutput.innerText, "CSS 코드가 복사되었습니다!");
});

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    img = new Image();
    img.onload = () => {
      hasImage = true;
      uploadHint.classList.add("hidden");
      canvasContainer.classList.remove("hidden");
      resetBtn.classList.remove("hidden");
      zoomControl.classList.remove("hidden");
      initCanvas();
      dropzone.classList.add("has-image");
      copyCssBtn.classList.remove("hidden");
      copySvgBtn.classList.remove("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function initCanvas() {
  const maxDim = 1200;
  let width = img.width;
  let height = img.height;

  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = (maxDim / width) * height;
      width = maxDim;
    } else {
      width = (maxDim / height) * width;
      height = maxDim;
    }
  }

  canvas.width = width;
  canvas.height = height;

  // Calc init scale
  const rect = canvasContainer.getBoundingClientRect();
  const padding = 40;
  const availableWidth = Math.max(100, rect.width - padding);
  const availableHeight = Math.max(100, rect.height - padding);

  const scaleX = availableWidth / width;
  const scaleY = availableHeight / height;

  if (scaleX < 1.0 || scaleY < 1.0) {
    zoomLevel = Math.min(scaleX, scaleY);
  } else {
    zoomLevel = 1.0;
  }

  zoomLevelVal.textContent = Math.round(zoomLevel * 100) + "%";

  // Reset panning
  panX = 0;
  panY = 0;

  startPoint = { x: width * 0.2, y: height * 0.5 };
  endPoint = { x: width * 0.8, y: height * 0.5 };

  updateCanvasDisplay(true); // Initial size setup
  updateGradient();
}

function updateCanvasDisplay(resetSize = false) {
  if (resetSize) {
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";
  }

  const rect = canvasContainer.getBoundingClientRect();
  const scaledW = canvas.width * zoomLevel;
  const scaledH = canvas.height * zoomLevel;

  const limitX = Math.max(0, (scaledW - rect.width) / 2);
  const limitY = Math.max(0, (scaledH - rect.height) / 2);

  panX = Math.max(-limitX, Math.min(limitX, panX));
  panY = Math.max(-limitY, Math.min(limitY, panY));

  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
}

function draw(onlyImage = false) {
  if (!hasImage) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (onlyImage) return;

  ctx.beginPath();
  ctx.moveTo(startPoint.x, startPoint.y);
  ctx.lineTo(endPoint.x, endPoint.y);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3 / zoomLevel;
  ctx.shadowBlur = 4;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.stroke();
  drawPoint(startPoint, "#6366f1");
  drawPoint(endPoint, "#a855f7");
}

function drawPoint(p, color) {
  ctx.beginPath();

  ctx.arc(p.x, p.y, 8 / Math.sqrt(zoomLevel), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2 / Math.sqrt(zoomLevel);
  ctx.stroke();
}

function updateGradient() {
  if (!hasImage) return;

  draw(true);

  const stops = parseInt(stopCountVal.value);
  const colors = [];

  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1);
    const x = startPoint.x + (endPoint.x - startPoint.x) * t;
    const y = startPoint.y + (endPoint.y - startPoint.y) * t;

    const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x)));
    const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y)));

    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
    const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
    colors.push({ hex, t: (t * 100).toFixed(1) });
  }

  draw();

  const cssStops = colors.map((c) => `${c.hex} ${c.t}%`).join(", ");
  const cssString = `linear-gradient(to right, ${cssStops})`;
  gradientPreview.style.background = cssString;
  cssOutput.innerText = `background: ${cssString};`;

  const svgStops = colors
    .map((c) => `  <stop offset="${c.t}%" stop-color="${c.hex}" />`)
    .join("\n");
  const svgTemplate = `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
${svgStops}
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#gradient)" />
</svg>`;

  svgOutput.innerText = svgTemplate;
}

function rgbToHex(r, g, b) {
  return (
    "#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()
  );
}

function resetApp() {
  hasImage = false;
  dropzone.classList.remove("has-image");
  fileInput.value = "";
  uploadHint.classList.remove("hidden");
  canvasContainer.classList.add("hidden");
  copyCssBtn.classList.add("hidden");
  copySvgBtn.classList.add("hidden");
  gradientPreview.style.background = "#1e293b";
  svgOutput.innerText = "이미지를 업로드하고 드래그하여 포인트를 지정하세요.";
  cssOutput.innerText = "이미지를 업로드하고 드래그하여 포인트를 지정하세요.";

  resetBtn.classList.add("hidden");
  zoomControl.classList.add("hidden");

  stopCountInput.value = 5;
  stopCountVal.value = 5;
}

function copyToClipboard(text, message) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(message);
  });
}

function showToast(message) {
  toast.innerText = message;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 2000);
}
