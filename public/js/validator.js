// ============ VALIDATION PREVIEW ============

async function showValidation() {
  const img = getCurrentImage();
  const ann = getCurrentAnnotations();
  
  if (!img) {
    alert('No image loaded!');
    return;
  }
  
  if (!ann || !ann.boxes || ann.boxes.length === 0) {
    alert('No annotations on this image to validate!');
    return;
  }
  
  const modal = document.getElementById('validation-modal');
  const validationImg = document.getElementById('validation-img');
  validationImg.src = '';
  modal.classList.remove('hidden');
  
  try {
    const result = await window.electronAPI.validateImage({
      imageName: img,
      annotations: ann,
      config: {
        targetSize: getTargetSize(),
        filters: State.filters
      }
    });
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    validationImg.src = result.data;
    
  } catch (err) {
    alert('Failed to generate validation preview: ' + err.message);
    modal.classList.add('hidden');
  }
}

function closeValidationModal() {
  document.getElementById('validation-modal').classList.add('hidden');
}

function initValidator() {
  document.getElementById('btn-validate').addEventListener('click', showValidation);
  document.getElementById('btn-close-modal').addEventListener('click', closeValidationModal);
  
  document.getElementById('validation-modal').addEventListener('click', (e) => {
    if (e.target.id === 'validation-modal') {
      closeValidationModal();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeValidationModal();
    }
  });
}
