// ============ MAIN APPLICATION ============

document.addEventListener('DOMContentLoaded', async () => {
  console.log('CTRL Annotate v1.2 - Initializing...');
  
  // Initialize canvas first
  initCanvas();
  
  // Initialize components
  initClassManager();
  initFilters();
  initNavigation();
  initExporter();
  initValidator();
  initGallery();
  initSAMControls();
  initToolbar();
  initModelSelector();
  
  // Load saved annotations
  await loadAnnotations();
  
  // Folder browse button
  document.getElementById('btn-browse').addEventListener('click', openFolderDialog);
  
  // Repeat annotation button
  document.getElementById('btn-repeat').addEventListener('click', repeatLastAnnotation);
  
  // Undo/Redo buttons
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  
  console.log('Application initialized');
});

// ============ FOLDER DIALOG ============

async function openFolderDialog() {
  try {
    const result = await window.electronAPI.openFolderDialog();
    
    if (result.success) {
      State.folderPath = result.path;
      State.images = result.images;
      State.currentIndex = 0;
      
      document.getElementById('folder-display').textContent = result.path;
      
      updateImageCounter();
      
      if (State.images.length > 0) {
        await loadImage(State.images[0]);
      }
    }
  } catch (err) {
    console.error('Failed to open folder:', err);
  }
}

// ============ NAVIGATION ============

function initNavigation() {
  document.getElementById('btn-prev').addEventListener('click', () => navigateImage(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigateImage(1));
}

async function navigateImage(delta) {
  if (State.images.length === 0) return;
  
  const newIndex = State.currentIndex + delta;
  
  if (newIndex < 0 || newIndex >= State.images.length) return;
  
  State.currentIndex = newIndex;
  updateImageCounter();
  
  await loadImage(State.images[newIndex]);
}

function updateImageCounter() {
  const counter = document.getElementById('img-counter');
  counter.textContent = `${State.currentIndex + 1} / ${State.images.length}`;
}

// ============ TOOLBAR ============

function initToolbar() {
  document.getElementById('tool-bbox').addEventListener('click', () => setTool('bbox'));
  document.getElementById('tool-magic').addEventListener('click', () => setTool('magic'));
  document.getElementById('tool-pan').addEventListener('click', () => setTool('pan'));
}

// ============ MODEL SELECTOR ============

function initModelSelector() {
  const modelSelect = document.getElementById('model-preset');
  
  // Set initial value from state
  modelSelect.value = State.exportConfig.modelPreset;
  
  // Update format badge on init
  updateFormatBadge();
}

// ============ FILTERS ============

function initFilters() {
  const filterIds = ['brightness', 'saturation', 'exposure', 'blur'];
  
  filterIds.forEach(name => {
    const slider = document.getElementById(`filter-${name}`);
    const display = document.getElementById(`v-${name}`);
    
    if (slider && display) {
      slider.addEventListener('input', () => {
        const value = parseFloat(slider.value);
        display.textContent = value.toFixed(1);
        State.filters[name] = value;
        applyFilters();
      });
    }
  });
  
  const grayscale = document.getElementById('filter-grayscale');
  if (grayscale) {
    grayscale.addEventListener('change', () => {
      State.filters.grayscale = grayscale.checked;
      applyFilters();
    });
  }
}

function applyFilters() {
  if (!backgroundImage) return;
  
  const { brightness, saturation, exposure, blur, grayscale } = State.filters;
  
  // Build filter string
  let filterStr = '';
  
  if (brightness !== 1) {
    filterStr += `brightness(${brightness}) `;
  }
  
  if (saturation !== 1) {
    filterStr += `saturate(${saturation}) `;
  }
  
  if (exposure !== 1) {
    // Approximate exposure with brightness
    filterStr += `brightness(${exposure}) `;
  }
  
  if (blur > 0) {
    filterStr += `blur(${blur}px) `;
  }
  
  if (grayscale) {
    filterStr += 'grayscale(1) ';
  }
  
  // Apply to background image
  backgroundImage.filters = [];
  
  if (brightness !== 1) {
    backgroundImage.filters.push(new fabric.Image.filters.Brightness({ brightness: brightness - 1 }));
  }
  
  if (saturation !== 1) {
    backgroundImage.filters.push(new fabric.Image.filters.Saturation({ saturation: saturation - 1 }));
  }
  
  if (grayscale) {
    backgroundImage.filters.push(new fabric.Image.filters.Grayscale());
  }
  
  if (blur > 0) {
    backgroundImage.filters.push(new fabric.Image.filters.Blur({ blur: blur / 10 }));
  }
  
  backgroundImage.applyFilters();
  fabricCanvas.renderAll();
}

// ============ KEYBOARD SHORTCUTS INFO ============

function showShortcuts() {
  const shortcuts = `
Keyboard Shortcuts:

B - Bounding Box tool
M - Magic Select (SAM)
Space (hold) - Pan mode
Scroll - Zoom in/out
← / → - Previous/Next image
Delete - Remove selected box
Ctrl+Z - Undo
Ctrl+Y / Ctrl+Shift+Z - Redo
Escape - Close modal
  `;
  
  alert(shortcuts);
}

// ============ ESCAPE KEY HANDLER ============

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close any open modals
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.add('hidden');
    });
  }
});