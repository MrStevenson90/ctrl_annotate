// ============ CANVAS CONTROLLER ============

let fabricCanvas = null;
let backgroundImage = null;
let canvasContainer = null;

function initCanvas() {
  canvasContainer = document.getElementById('canvas-container');
  
  fabricCanvas = new fabric.Canvas('canvas', {
    selection: false,
    preserveObjectStacking: true
  });
  
  State.canvas = fabricCanvas;
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  fabricCanvas.on('mouse:wheel', handleZoom);
  
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
  
  fabricCanvas.on('mouse:move', handleMouseMove);
  
  initBboxTool();
}

function resizeCanvas() {
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;
  
  fabricCanvas.setWidth(width);
  fabricCanvas.setHeight(height);
  fabricCanvas.renderAll();
}

// ============ IMAGE LOADING (via Electron IPC) ============

async function loadImage(imageName) {
  if (!imageName) return;
  
  try {
    // Get image as base64 from main process
    const result = await window.electronAPI.getImage(imageName);
    
    if (!result.success) {
      console.error('Failed to load image:', result.error);
      return;
    }
    
    const dataUrl = result.data;
    
    return new Promise((resolve) => {
      fabric.Image.fromURL(dataUrl, (img) => {
        setOriginalSize(img.width, img.height);
        
        fabricCanvas.clear();
        
        const containerW = canvasContainer.clientWidth;
        const containerH = canvasContainer.clientHeight;
        const scale = Math.min(
          (containerW * 0.9) / img.width,
          (containerH * 0.9) / img.height
        );
        
        img.set({
          left: (containerW - img.width * scale) / 2,
          top: (containerH - img.height * scale) / 2,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false
        });
        
        backgroundImage = img;
        fabricCanvas.add(img);
        fabricCanvas.sendToBack(img);
        
        fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        
        renderBoxes();
        
        document.getElementById('status-file').textContent = imageName;
        document.getElementById('status-zoom').textContent = 'Zoom: 100%';
        
        resolve();
      });
    });
  } catch (err) {
    console.error('Error loading image:', err);
  }
}

// ============ ZOOM ============

function handleZoom(opt) {
  const delta = opt.e.deltaY;
  let zoom = fabricCanvas.getZoom();
  
  zoom *= 0.999 ** delta;
  zoom = Math.max(0.1, Math.min(20, zoom));
  
  fabricCanvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  
  opt.e.preventDefault();
  opt.e.stopPropagation();
  
  document.getElementById('status-zoom').textContent = `Zoom: ${Math.round(zoom * 100)}%`;
}

// ============ PAN ============

let isPanning = false;
let lastPosX = 0;
let lastPosY = 0;

function handleKeyDown(e) {
  if (e.code === 'Space' && !State.isPanning) {
    State.isPanning = true;
    canvasContainer.classList.add('panning');
    fabricCanvas.defaultCursor = 'grab';
    fabricCanvas.hoverCursor = 'grab';
    
    fabricCanvas.on('mouse:down', startPan);
    fabricCanvas.on('mouse:move', doPan);
    fabricCanvas.on('mouse:up', endPan);
  }
  
  if (e.key === 'b' || e.key === 'B') {
    setTool('bbox');
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
  }
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    redo();
  }
  
  if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected();
  }
  
  if (e.key === 'ArrowRight') {
    navigateImage(1);
  }
  if (e.key === 'ArrowLeft') {
    navigateImage(-1);
  }
}

function handleKeyUp(e) {
  if (e.code === 'Space') {
    State.isPanning = false;
    canvasContainer.classList.remove('panning');
    fabricCanvas.defaultCursor = 'crosshair';
    fabricCanvas.hoverCursor = 'move';
    
    fabricCanvas.off('mouse:down', startPan);
    fabricCanvas.off('mouse:move', doPan);
    fabricCanvas.off('mouse:up', endPan);
  }
}

function startPan(opt) {
  isPanning = true;
  lastPosX = opt.e.clientX;
  lastPosY = opt.e.clientY;
  fabricCanvas.selection = false;
}

function doPan(opt) {
  if (!isPanning) return;
  
  const vpt = fabricCanvas.viewportTransform;
  vpt[4] += opt.e.clientX - lastPosX;
  vpt[5] += opt.e.clientY - lastPosY;
  
  lastPosX = opt.e.clientX;
  lastPosY = opt.e.clientY;
  
  fabricCanvas.requestRenderAll();
}

function endPan() {
  isPanning = false;
  fabricCanvas.selection = true;
}

// ============ MOUSE TRACKING ============

function handleMouseMove(opt) {
  const pointer = fabricCanvas.getPointer(opt.e);
  const imgCoords = screenToImageCoords(pointer.x, pointer.y);
  
  if (imgCoords) {
    document.getElementById('status-coords').textContent = 
      `X: ${Math.round(imgCoords.x)}, Y: ${Math.round(imgCoords.y)}`;
  }
}

// ============ COORDINATE CONVERSION ============

function screenToImageCoords(screenX, screenY) {
  if (!backgroundImage) return null;
  
  const img = backgroundImage;
  const imgLeft = img.left;
  const imgTop = img.top;
  const scale = img.scaleX;
  
  const x = (screenX - imgLeft) / scale;
  const y = (screenY - imgTop) / scale;
  
  return { x, y };
}

function imageToScreenCoords(imgX, imgY) {
  if (!backgroundImage) return null;
  
  const img = backgroundImage;
  
  const x = imgX * img.scaleX + img.left;
  const y = imgY * img.scaleY + img.top;
  
  return { x, y };
}

// ============ TOOL SELECTION ============

function setTool(tool) {
  State.currentTool = tool;
  
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  document.getElementById(`tool-${tool}`).classList.add('active');
}
