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
  initGroupModeControls();
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
        
        // Trigger SAM auto-embedding if available and enabled
        if (typeof autoEmbedIfNeeded === 'function') {
          autoEmbedIfNeeded(dataUrl);
        }
        
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
  // Prevent shortcuts when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    return;
  }
  
  if (e.code === 'Space' && !State.isPanning) {
    State.isPanning = true;
    canvasContainer.classList.add('panning');
    canvasContainer.classList.remove('magic-mode');
    fabricCanvas.defaultCursor = 'grab';
    fabricCanvas.hoverCursor = 'grab';
    
    fabricCanvas.on('mouse:down', startPan);
    fabricCanvas.on('mouse:move', doPan);
    fabricCanvas.on('mouse:up', endPan);
  }
  
  if (e.key === 'b' || e.key === 'B') {
    setTool('bbox');
  }
  
  if (e.key === 'm' || e.key === 'M') {
    setTool('magic');
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
    updateCursorForTool();
    
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
  // Check if SAM is ready for magic tool
  if (tool === 'magic' && typeof SAM !== 'undefined' && !SAM.isReady) {
    console.warn('SAM 2 is not ready yet');
    return;
  }
  
  State.currentTool = tool;
  
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const toolBtn = document.getElementById(`tool-${tool}`);
  if (toolBtn) {
    toolBtn.classList.add('active');
  }
  
  updateCursorForTool();
  
  // Update format badge when switching tools
  updateFormatBadge();
}

function updateCursorForTool() {
  canvasContainer.classList.remove('magic-mode');
  
  if (State.currentTool === 'magic') {
    canvasContainer.classList.add('magic-mode');
    fabricCanvas.defaultCursor = 'crosshair';
    fabricCanvas.hoverCursor = 'crosshair';
  } else if (State.currentTool === 'pan') {
    fabricCanvas.defaultCursor = 'grab';
    fabricCanvas.hoverCursor = 'grab';
  } else {
    fabricCanvas.defaultCursor = 'crosshair';
    fabricCanvas.hoverCursor = 'move';
  }
}

// ============ FORMAT BADGE ============

function updateFormatBadge() {
  const badge = document.getElementById('export-format-badge');
  if (!badge) return;
  
  const format = getExportFormat();
  
  if (format === 'sam2') {
    badge.textContent = 'SAM2';
    badge.classList.add('sam2');
    // Show group mode control for SAM2
    const groupControl = document.getElementById('group-mode-control');
    if (groupControl) groupControl.style.display = 'block';
  } else {
    badge.textContent = 'YOLO';
    badge.classList.remove('sam2');
    // Hide group mode control for YOLO
    const groupControl = document.getElementById('group-mode-control');
    if (groupControl) groupControl.style.display = 'none';
  }
}

// ============ GROUP MODE CONTROLS ============

function initGroupModeControls() {
  const individualBtn = document.getElementById('mode-individual');
  const groupBtn = document.getElementById('mode-group');
  const hint = document.getElementById('group-mode-hint');
  
  if (!individualBtn || !groupBtn) return;
  
  individualBtn.addEventListener('click', () => {
    setGroupMode(false);
    individualBtn.classList.add('active');
    groupBtn.classList.remove('active');
    if (hint) {
      hint.textContent = '';
      hint.classList.remove('active');
    }
    // Clear any pending group
    if (typeof cancelGroup === 'function') {
      cancelGroup();
    }
  });
  
  groupBtn.addEventListener('click', () => {
    setGroupMode(true);
    groupBtn.classList.add('active');
    individualBtn.classList.remove('active');
    if (hint) {
      hint.textContent = 'Shift+Click to add points, Enter to confirm';
      hint.classList.add('active');
    }
  });
}

function updateGroupModeHint(pointCount) {
  const hint = document.getElementById('group-mode-hint');
  if (!hint || !State.groupMode) return;
  
  if (pointCount > 0) {
    hint.textContent = `${pointCount} point(s) selected. Enter to confirm, Esc to cancel`;
    hint.classList.add('active');
  } else {
    hint.textContent = 'Shift+Click to add points, Enter to confirm';
  }
}