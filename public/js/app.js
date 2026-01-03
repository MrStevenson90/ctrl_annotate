// ============ MAIN APP INITIALIZATION ============

document.addEventListener('DOMContentLoaded', async () => {
  initCanvas();
  initClassManager();
  initGallery();
  initValidator();
  initExporter();
  initControls();
  
  await loadAnnotations();
  
  renderClassList();
  
  console.log('YOLO Annotator initialized');
});

// ============ CONTROL BINDINGS ============

function initControls() {
  // Folder browse button (native dialog)
  document.getElementById('btn-browse').addEventListener('click', openFolderDialog);
  
  // Tool buttons
  document.getElementById('tool-bbox').addEventListener('click', () => setTool('bbox'));
  document.getElementById('tool-pan').addEventListener('click', () => setTool('pan'));
  
  // Action buttons
  document.getElementById('btn-repeat').addEventListener('click', repeatLastAnnotation);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  
  // Navigation
  document.getElementById('btn-prev').addEventListener('click', () => navigateImage(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigateImage(1));
  
  // Filter sliders
  initFilterControls();
  
  // Export settings
  document.getElementById('model-preset').addEventListener('change', (e) => {
    State.exportConfig.modelPreset = e.target.value;
    State.exportConfig.targetSize = getTargetSize();
  });
  
  document.getElementById('train-split').addEventListener('input', (e) => {
    State.exportConfig.trainRatio = parseInt(e.target.value) / 100;
    document.getElementById('v-split').textContent = e.target.value;
  });
}

// ============ NATIVE FOLDER DIALOG ============

async function openFolderDialog() {
  const status = document.getElementById('folder-status');
  const display = document.getElementById('folder-display');
  
  status.textContent = 'Opening...';
  status.style.color = '';
  
  try {
    const result = await window.electronAPI.openFolderDialog();
    
    if (!result.success) {
      if (result.error) {
        throw new Error(result.error);
      }
      // User canceled
      status.textContent = '';
      return;
    }
    
    State.folderPath = result.path;
    State.images = result.images;
    State.currentIndex = 0;
    
    // Display folder path
    display.textContent = result.path;
    status.textContent = `✓ ${result.images.length} images`;
    status.style.color = '#4caf50';
    
    // Load first image
    await loadCurrentImage();
    updateImageCounter();
    
  } catch (err) {
    status.textContent = `✗ ${err.message}`;
    status.style.color = '#f44336';
  }
}

// ============ IMAGE NAVIGATION ============

async function loadCurrentImage() {
  const img = getCurrentImage();
  if (img) {
    await loadImage(img);
    updateImageCounter();
  }
}

function navigateImage(direction) {
  const newIndex = State.currentIndex + direction;
  
  if (newIndex >= 0 && newIndex < State.images.length) {
    State.currentIndex = newIndex;
    loadCurrentImage();
  }
}

function updateImageCounter() {
  const current = State.currentIndex + 1;
  const total = State.images.length;
  document.getElementById('img-counter').textContent = `${current} / ${total}`;
}

// ============ FILTER CONTROLS ============

function initFilterControls() {
  const filters = ['brightness', 'saturation', 'exposure', 'blur'];
  
  filters.forEach(name => {
    const slider = document.getElementById(`filter-${name}`);
    const display = document.getElementById(`v-${name}`);
    
    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      State.filters[name] = value;
      display.textContent = value.toFixed(1);
      
      applyFilterPreview();
    });
  });
  
  document.getElementById('filter-grayscale').addEventListener('change', (e) => {
    State.filters.grayscale = e.target.checked;
    applyFilterPreview();
  });
}

function applyFilterPreview() {
  const { brightness, saturation, blur, grayscale } = State.filters;
  
  const filterString = [
    `brightness(${brightness})`,
    `saturate(${saturation})`,
    `blur(${blur}px)`,
    grayscale ? 'grayscale(100%)' : ''
  ].filter(Boolean).join(' ');
  
  if (backgroundImage) {
    const container = document.getElementById('canvas-container');
    container.style.filter = filterString;
  }
}

// ============ KEYBOARD SHORTCUTS INFO ============

console.log(`
╔════════════════════════════════════════╗
║         KEYBOARD SHORTCUTS             ║
╠════════════════════════════════════════╣
║  B          - Bounding Box tool        ║
║  Space      - Hold for Pan mode        ║
║  Scroll     - Zoom in/out              ║
║  ← →        - Previous/Next image      ║
║  Delete     - Remove selected box      ║
║  Ctrl+Z     - Undo                     ║
║  Ctrl+Y     - Redo                     ║
║  Escape     - Close modal              ║
╚════════════════════════════════════════╝
`);
