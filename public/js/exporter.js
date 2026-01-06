// ============ EXPORTER ============

async function exportDataset() {
  const annotatedCount = Object.values(State.annotations).filter(
    ann => ann.boxes?.length > 0 || ann.polygons?.length > 0
  ).length;
  
  if (annotatedCount === 0) {
    alert('No annotations to export! Please annotate at least one image.');
    return;
  }
  
  if (State.classList.length === 0) {
    alert('No classes defined! Please add at least one class.');
    return;
  }
  
  // Determine export format from model preset
  const exportFormat = getExportFormat();
  const targetSize = getTargetSize();
  const modelPreset = MODEL_PRESETS[State.exportConfig.modelPreset];
  
  // Build confirmation message
  let formatInfo = '';
  if (exportFormat === 'sam2') {
    formatInfo = `Format: SAM2 Training (JSON + polygons)
Images will be exported at original resolution.`;
  } else {
    formatInfo = `Format: YOLO (${modelPreset.name})
Target size: ${targetSize}x${targetSize}px`;
  }
  
  const confirmMsg = `Export Dataset?

${formatInfo}

Images: ${annotatedCount} annotated
Classes: ${State.classList.join(', ')}

Split:
  Train: ${Math.round(State.exportConfig.ratios.train * 100)}%
  Val: ${Math.round(State.exportConfig.ratios.val * 100)}%
  Test: ${Math.round(State.exportConfig.ratios.test * 100)}%

Continue?`;
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  const exportBtn = document.getElementById('btn-export');
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exporting...';
  
  try {
    const config = {
      modelPreset: State.exportConfig.modelPreset,
      targetSize: targetSize,
      exportFormat: exportFormat,
      filters: State.filters,
      classList: State.classList,
      ratios: State.exportConfig.ratios
    };
    
    const result = await window.electronAPI.exportDataset({
      annotations: State.annotations,
      config
    });
    
    if (result.success) {
      const formatLabel = exportFormat === 'sam2' ? 'SAM2' : 'YOLO';
      alert(`✓ ${formatLabel} dataset exported successfully!\n\nSaved to: ${result.path}`);
    } else {
      alert(`Export failed: ${result.error}`);
    }
  } catch (err) {
    console.error('Export error:', err);
    alert(`Export error: ${err.message}`);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export ZIP';
  }
}

function initExporter() {
  document.getElementById('btn-export').addEventListener('click', exportDataset);
  
  // Model preset change handler
  const modelSelect = document.getElementById('model-preset');
  const formatBadge = document.getElementById('export-format-badge');
  
  modelSelect.addEventListener('change', (e) => {
    const preset = e.target.value;
    State.exportConfig.modelPreset = preset;
    
    // Update target size
    const modelInfo = MODEL_PRESETS[preset];
    if (modelInfo) {
      State.exportConfig.targetSize = modelInfo.size || 640;
      State.exportConfig.exportFormat = modelInfo.format;
      
      // Update format badge
      if (modelInfo.format === 'sam2') {
        formatBadge.textContent = 'SAM2';
        formatBadge.classList.add('sam2');
      } else {
        formatBadge.textContent = 'YOLO';
        formatBadge.classList.remove('sam2');
      }
    }
    
    console.log('Model preset changed:', preset, modelInfo);
  });
  
  // Initialize badge state
  updateFormatBadge();
  
  // Split sliders
  initSplitSliders();
}

function updateFormatBadge() {
  const formatBadge = document.getElementById('export-format-badge');
  const format = getExportFormat();
  
  if (format === 'sam2') {
    formatBadge.textContent = 'SAM2';
    formatBadge.classList.add('sam2');
  } else {
    formatBadge.textContent = 'YOLO';
    formatBadge.classList.remove('sam2');
  }
}

function initSplitSliders() {
  const trainSlider = document.getElementById('split-train');
  const valSlider = document.getElementById('split-val');
  const trainDisplay = document.getElementById('v-train');
  const valDisplay = document.getElementById('v-val');
  const testDisplay = document.getElementById('v-test');
  
  function updateSplitDisplay() {
    const train = parseInt(trainSlider.value);
    const val = parseInt(valSlider.value);
    const test = Math.max(0, 100 - train - val);
    
    trainDisplay.textContent = train;
    valDisplay.textContent = val;
    testDisplay.textContent = test;
    
    State.exportConfig.ratios = {
      train: train / 100,
      val: val / 100,
      test: test / 100
    };
  }
  
  trainSlider.addEventListener('input', () => {
    // Ensure train + val <= 95 (leave at least 5% for test or allow 0)
    const maxVal = 95 - parseInt(trainSlider.value);
    valSlider.max = Math.max(5, maxVal);
    if (parseInt(valSlider.value) > maxVal) {
      valSlider.value = maxVal;
    }
    updateSplitDisplay();
  });
  
  valSlider.addEventListener('input', updateSplitDisplay);
  
  // Initialize
  updateSplitDisplay();
}

// Export stats helper
function getExportStats() {
  let totalBoxes = 0;
  let totalPolygons = 0;
  let imagesWithPolygons = 0;
  
  Object.values(State.annotations).forEach(ann => {
    totalBoxes += (ann.boxes || []).length;
    totalPolygons += (ann.polygons || []).length;
    if ((ann.polygons || []).length > 0) {
      imagesWithPolygons++;
    }
  });
  
  return {
    totalImages: Object.keys(State.annotations).length,
    totalBoxes,
    totalPolygons,
    imagesWithPolygons
  };
}