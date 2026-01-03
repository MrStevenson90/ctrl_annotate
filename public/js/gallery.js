// ============ GALLERY VIEW ============

// Cache for loaded image thumbnails
const imageCache = new Map();

function showGallery() {
  document.getElementById('editor-view').style.display = 'none';
  document.getElementById('gallery-view').classList.remove('hidden');
  
  renderGallery();
}

function showEditor() {
  document.getElementById('gallery-view').classList.add('hidden');
  document.getElementById('editor-view').style.display = 'flex';
}

async function renderGallery() {
  const container = document.getElementById('gallery-container');
  container.innerHTML = '<div class="loading">Loading thumbnails...</div>';
  
  let annotatedCount = 0;
  let pendingCount = 0;
  
  const cards = [];
  
  for (let index = 0; index < State.images.length; index++) {
    const imgName = State.images[index];
    const ann = State.annotations[imgName];
    const hasAnnotations = ann && ann.boxes && ann.boxes.length > 0;
    
    if (hasAnnotations) {
      annotatedCount++;
    } else {
      pendingCount++;
    }
    
    // Get image from cache or load it
    let imgSrc = imageCache.get(imgName);
    if (!imgSrc) {
      try {
        const result = await window.electronAPI.getImage(imgName);
        if (result.success) {
          imgSrc = result.data;
          imageCache.set(imgName, imgSrc);
        }
      } catch (err) {
        console.error('Failed to load thumbnail:', imgName);
      }
    }
    
    const card = document.createElement('div');
    card.className = `gallery-card ${hasAnnotations ? 'annotated' : 'pending'}`;
    
    // Display filename (last part of path)
    const displayName = imgName.split(/[\/\\]/).pop();
    
    card.innerHTML = `
      <img src="${imgSrc || ''}" alt="${displayName}" loading="lazy">
      <div class="gallery-card-info">
        <span class="gallery-card-name" title="${imgName}">${displayName}</span>
        <span class="gallery-card-badge">
          ${hasAnnotations ? `${ann.boxes.length} box${ann.boxes.length > 1 ? 'es' : ''}` : 'Pending'}
        </span>
      </div>
    `;
    
    card.addEventListener('click', () => {
      State.currentIndex = index;
      loadCurrentImage();
      showEditor();
    });
    
    cards.push(card);
  }
  
  // Clear and add all cards
  container.innerHTML = '';
  cards.forEach(card => container.appendChild(card));
  
  // Update stats
  document.getElementById('stat-total').textContent = `${State.images.length} images`;
  document.getElementById('stat-annotated').textContent = `${annotatedCount} annotated`;
  document.getElementById('stat-pending').textContent = `${pendingCount} pending`;
}

function initGallery() {
  document.getElementById('btn-gallery').addEventListener('click', showGallery);
  document.getElementById('btn-back-editor').addEventListener('click', showEditor);
}
