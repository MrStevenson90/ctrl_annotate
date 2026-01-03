// ============ GLOBAL STATE ============

const State = {
  // Folder & Images
  folderPath: null,
  images: [],
  currentIndex: 0,
  
  // Annotations (keyed by image name)
  annotations: {},
  
  // Classes
  classList: [],
  activeClass: null,
  
  // Canvas
  canvas: null,
  currentTool: 'bbox',
  isPanning: false,
  
  // Auto-save
  saveTimeout: null,
  isSaved: true,
  
  // Last annotation (for repeat)
  lastBox: null,
  
  // Filters
  filters: {
    brightness: 1.0,
    saturation: 1.0,
    exposure: 1.0,
    blur: 0,
    grayscale: false
  },
  
  // Export settings
  exportConfig: {
    modelPreset: 'yolov8n',
    targetSize: 640,
    trainRatio: 0.8
  }
};

// ============ STATE HELPERS ============

function getCurrentImage() {
  return State.images[State.currentIndex] || null;
}

function getCurrentAnnotations() {
  const img = getCurrentImage();
  if (!img) return null;
  
  if (!State.annotations[img]) {
    State.annotations[img] = {
      originalSize: { width: 0, height: 0 },
      boxes: []
    };
  }
  
  return State.annotations[img];
}

function setOriginalSize(width, height) {
  const ann = getCurrentAnnotations();
  if (ann) {
    ann.originalSize = { width, height };
  }
}

function addBox(box) {
  const ann = getCurrentAnnotations();
  if (ann) {
    ann.boxes.push(box);
    State.lastBox = { ...box };
    markUnsaved();
  }
}

function removeBox(index) {
  const ann = getCurrentAnnotations();
  if (ann && ann.boxes[index]) {
    ann.boxes.splice(index, 1);
    markUnsaved();
  }
}

function updateBox(index, updates) {
  const ann = getCurrentAnnotations();
  if (ann && ann.boxes[index]) {
    Object.assign(ann.boxes[index], updates);
    markUnsaved();
  }
}

// ============ AUTO-SAVE (via Electron IPC) ============

function markUnsaved() {
  State.isSaved = false;
  document.getElementById('status-save').classList.add('unsaved');
  document.getElementById('status-save').textContent = '○';
  
  // Debounced auto-save
  clearTimeout(State.saveTimeout);
  State.saveTimeout = setTimeout(saveAnnotations, 1000);
}

function markSaved() {
  State.isSaved = true;
  document.getElementById('status-save').classList.remove('unsaved');
  document.getElementById('status-save').textContent = '●';
}

async function saveAnnotations() {
  try {
    const result = await window.electronAPI.saveAnnotations(State.annotations);
    
    if (result.success) {
      markSaved();
    } else {
      console.error('Save failed:', result.error);
    }
  } catch (err) {
    console.error('Save failed:', err);
  }
}

async function loadAnnotations() {
  try {
    const result = await window.electronAPI.loadAnnotations();
    
    if (result.success) {
      State.annotations = result.annotations || {};
      
      // Extract class list from existing annotations
      const classes = new Set();
      Object.values(State.annotations).forEach(img => {
        (img.boxes || []).forEach(box => {
          if (box.label) classes.add(box.label);
        });
      });
      
      classes.forEach(cls => {
        if (!State.classList.includes(cls)) {
          State.classList.push(cls);
        }
      });
    }
  } catch (err) {
    console.error('Load failed:', err);
  }
}

// ============ MODEL PRESETS ============

const MODEL_PRESETS = {
  yolov5s: { size: 640, name: 'YOLOv5 (640)' },
  yolov5_416: { size: 416, name: 'YOLOv5 (416)' },
  yolov8n: { size: 640, name: 'YOLOv8 (640)' },
  yolov8_1280: { size: 1280, name: 'YOLOv8 (1280)' },
  yolov11n: { size: 640, name: 'YOLOv11 (640)' }
};

function getTargetSize() {
  const preset = MODEL_PRESETS[State.exportConfig.modelPreset];
  return preset ? preset.size : 640;
}
