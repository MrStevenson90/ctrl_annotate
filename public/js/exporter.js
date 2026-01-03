// ============ EXPORT HANDLER ============

async function exportDataset() {
  const annotatedImages = Object.keys(State.annotations).filter(
    img => State.annotations[img]?.boxes?.length > 0
  );
  
  if (annotatedImages.length === 0) {
    alert('No annotated images to export!');
    return;
  }
  
  if (State.classList.length === 0) {
    alert('No classes defined!');
    return;
  }
  
  const trainRatio = State.exportConfig.trainRatio;
  const trainCount = Math.floor(annotatedImages.length * trainRatio);
  const valCount = annotatedImages.length - trainCount;
  
  const confirmExport = window.confirm(
    `Export ${annotatedImages.length} annotated images?\n\n` +
    `Train: ${trainCount} images\n` +
    `Val: ${valCount} images\n` +
    `Target size: ${getTargetSize()}px\n` +
    `Classes: ${State.classList.join(', ')}`
  );
  
  if (!confirmExport) return;
  
  const btn = document.getElementById('btn-export');
  const originalText = btn.textContent;
  btn.textContent = '⏳ Exporting...';
  btn.disabled = true;
  
  try {
    const result = await window.electronAPI.exportDataset({
      annotations: State.annotations,
      config: {
        targetSize: getTargetSize(),
        filters: State.filters,
        classList: State.classList,
        trainRatio: State.exportConfig.trainRatio
      }
    });
    
    if (!result.success) {
      if (result.error !== 'Export canceled') {
        throw new Error(result.error);
      }
    } else {
      alert(`Export complete!\n\nSaved to: ${result.path}`);
    }
    
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function initExporter() {
  document.getElementById('btn-export').addEventListener('click', exportDataset);
}
