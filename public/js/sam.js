// ============ SAM INTEGRATION ============
// Using @huggingface/transformers@3.0.0 for fast browser inference
// Based on working reference implementation

const SAM = {
  model: null,
  processor: null,
  isReady: false,
  isProcessing: false,
  isLoading: false,
  currentImage: null,
  imageEmbeddings: null,
  embeddedImageName: null,
  modelLoaded: false
};

// Model configuration
const SAM_CONFIG = {
  modelId: 'Xenova/sam-vit-base'
};

// ============ MODEL LOADING ============

async function initSAM() {
  const statusEl = document.getElementById('sam-status');
  const samStatusBar = document.getElementById('status-sam');
  
  if (SAM.isLoading || SAM.isReady) return;
  
  SAM.isLoading = true;
  
  try {
    statusEl.textContent = 'Loading Transformers.js...';
    statusEl.style.color = '';
    samStatusBar.textContent = 'SAM: Loading...';
    
    // Import from official HuggingFace transformers 3.0
    const { SamModel, AutoProcessor, RawImage } = await import(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0'
    );
    
    // Store for later use
    window.TransformersJS = { SamModel, AutoProcessor, RawImage };
    
    statusEl.textContent = 'Loading SAM model...';
    
    // Check WebGPU support
    const hasWebGPU = 'gpu' in navigator;
    console.log('WebGPU available:', hasWebGPU);
    
    // Try loading with fallback chain
    let deviceUsed = 'wasm';
    let model = null;
    
    // Try 1: WebGPU + fp16 (fastest)
    if (hasWebGPU) {
      try {
        console.log('Trying WebGPU + fp16...');
        model = await SamModel.from_pretrained(SAM_CONFIG.modelId, {
          dtype: 'fp16',
          device: 'webgpu',
          progress_callback: (progress) => {
            if (progress.status === 'progress' && progress.progress) {
              const percent = Math.round(progress.progress);
              statusEl.textContent = `Loading model... ${percent}%`;
            }
          }
        });
        deviceUsed = 'WebGPU (fp16)';
        console.log('WebGPU + fp16 succeeded');
      } catch (e) {
        console.log('WebGPU + fp16 failed:', e.message);
        model = null;
      }
    }
    
    // Try 2: WebGPU + fp32 (fallback)
    if (!model && hasWebGPU) {
      try {
        console.log('Trying WebGPU + fp32...');
        model = await SamModel.from_pretrained(SAM_CONFIG.modelId, {
          dtype: 'fp32',
          device: 'webgpu',
          progress_callback: (progress) => {
            if (progress.status === 'progress' && progress.progress) {
              const percent = Math.round(progress.progress);
              statusEl.textContent = `Loading model... ${percent}%`;
            }
          }
        });
        deviceUsed = 'WebGPU (fp32)';
        console.log('WebGPU + fp32 succeeded');
      } catch (e) {
        console.log('WebGPU + fp32 failed:', e.message);
        model = null;
      }
    }
    
    // Try 3: WASM (final fallback)
    if (!model) {
      console.log('Trying WASM...');
      model = await SamModel.from_pretrained(SAM_CONFIG.modelId, {
        dtype: 'fp32',
        device: 'wasm',
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.progress) {
            const percent = Math.round(progress.progress);
            statusEl.textContent = `Loading model... ${percent}%`;
          }
        }
      });
      deviceUsed = 'WASM';
      console.log('WASM succeeded');
    }
    
    SAM.model = model;
    
    // Load processor
    SAM.processor = await AutoProcessor.from_pretrained(SAM_CONFIG.modelId);
    
    SAM.isReady = true;
    SAM.isLoading = false;
    SAM.modelLoaded = true;
    
    statusEl.textContent = `✓ Ready (${deviceUsed})`;
    statusEl.style.color = '#4caf50';
    samStatusBar.textContent = 'SAM: Ready';
    
    document.getElementById('sam-controls').classList.remove('hidden');
    document.getElementById('tool-magic').disabled = false;
    
    console.log(`SAM model loaded with ${deviceUsed}`);
    
  } catch (err) {
    SAM.isReady = false;
    SAM.isLoading = false;
    const errorMsg = err.message || String(err);
    statusEl.textContent = `✗ ${errorMsg}`;
    statusEl.style.color = '#f44336';
    samStatusBar.textContent = 'SAM: Error';
    console.error('Failed to load SAM:', err);
    document.getElementById('tool-magic').disabled = true;
  }
}

// ============ IMAGE EMBEDDING ============

async function generateEmbedding(imageDataUrl) {
  if (!SAM.isReady || SAM.isProcessing) {
    console.warn('SAM not ready or already processing');
    return null;
  }
  
  const statusEl = document.getElementById('sam-status');
  const samStatusBar = document.getElementById('status-sam');
  
  SAM.isProcessing = true;
  statusEl.textContent = '⏳ Embedding...';
  statusEl.classList.add('processing');
  samStatusBar.textContent = 'SAM: Embedding...';
  
  const startTime = performance.now();
  
  try {
    const { RawImage } = window.TransformersJS;
    
    // Load image using RawImage
    SAM.currentImage = await RawImage.fromURL(imageDataUrl);
    
    console.log(`Image loaded: ${SAM.currentImage.width}x${SAM.currentImage.height}`);
    
    // Pre-compute image embeddings
    const inputs = await SAM.processor(SAM.currentImage);
    SAM.imageEmbeddings = await SAM.model.get_image_embeddings(inputs);
    SAM.currentEmbedding = SAM.imageEmbeddings; // Backwards compatibility
    
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`Embedding generated in ${elapsed}s`);
    
    SAM.embeddedImageName = getCurrentImage();
    
    statusEl.textContent = `✓ Ready (${elapsed}s)`;
    statusEl.style.color = '#4caf50';
    statusEl.classList.remove('processing');
    samStatusBar.textContent = 'SAM: Ready';
    
    return SAM.imageEmbeddings;
    
  } catch (err) {
    console.error('Embedding failed:', err);
    statusEl.textContent = `✗ ${err.message || err}`;
    statusEl.style.color = '#f44336';
    statusEl.classList.remove('processing');
    samStatusBar.textContent = 'SAM: Error';
    return null;
  } finally {
    SAM.isProcessing = false;
  }
}

// ============ MASK PREDICTION ============

/**
 * Get full mask data at point(s) (for hover preview and click)
 * Supports single point or array of points for multi-point prompts
 * Returns mask data, bbox, polygon, and score
 * 
 * @param {number|Array} pointXOrPoints - Single X coordinate or array of {x, y} points
 * @param {number} [pointY] - Y coordinate (only used if first param is a number)
 */
async function predictMaskFull(pointXOrPoints, pointY) {
  if (!SAM.isReady || !SAM.currentImage || !SAM.imageEmbeddings) {
    return null;
  }
  
  if (SAM.isProcessing) {
    return null;
  }
  
  SAM.isProcessing = true;
  
  try {
    // Get original image dimensions
    const imageWidth = SAM.currentImage.width;
    const imageHeight = SAM.currentImage.height;
    
    // Get canvas dimensions for scaling
    const ann = getCurrentAnnotations();
    const canvasWidth = ann?.originalSize?.width || imageWidth;
    const canvasHeight = ann?.originalSize?.height || imageHeight;
    
    // Scale factors
    const scaleX = imageWidth / canvasWidth;
    const scaleY = imageHeight / canvasHeight;
    
    // Handle both single point and array of points
    let points = [];
    if (Array.isArray(pointXOrPoints)) {
      // Array of {x, y} points
      points = pointXOrPoints;
    } else {
      // Single point as two arguments
      points = [{ x: pointXOrPoints, y: pointY }];
    }
    
    // Scale all points to original image coordinates
    const scaledPoints = points.map(p => [p.x * scaleX, p.y * scaleY]);
    
    // Prepare point prompt - format: [[[x1, y1], [x2, y2], ...]]
    const input_points = [[...scaledPoints]];
    const input_labels = [[...scaledPoints.map(() => 1)]]; // All foreground points
    
    // Process through processor to get correctly shaped tensors
    const inputs = await SAM.processor(
      SAM.currentImage,
      { input_points, input_labels }
    );
    
    // Run model with pre-computed embeddings
    const outputs = await SAM.model({
      ...SAM.imageEmbeddings,
      input_points: inputs.input_points,
      input_labels: inputs.input_labels,
    });
    
    // Post-process masks to get properly scaled output
    const masks = await SAM.processor.post_process_masks(
      outputs.pred_masks,
      inputs.original_sizes,
      inputs.reshaped_input_sizes
    );
    
    // Get best mask by IOU score
    const scores = outputs.iou_scores.data;
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }
    
    // Extract mask data from post-processed output
    const maskTensor = masks[0][0][bestIdx];
    const maskData = maskTensor.data;
    const maskHeight = maskTensor.dims[0];
    const maskWidth = maskTensor.dims[1];
    
    // Find bounding box from mask
    let minX = maskWidth, minY = maskHeight, maxX = 0, maxY = 0;
    let hasPixels = false;
    
    for (let y = 0; y < maskHeight; y++) {
      for (let x = 0; x < maskWidth; x++) {
        if (maskData[y * maskWidth + x] > 0) {
          hasPixels = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    
    if (!hasPixels) {
      return null;
    }
    
    // Scale bbox back to canvas coordinates
    const invScaleX = canvasWidth / maskWidth;
    const invScaleY = canvasHeight / maskHeight;
    
    const bbox = {
      x: Math.max(0, minX * invScaleX),
      y: Math.max(0, minY * invScaleY),
      width: Math.min((maxX - minX) * invScaleX, canvasWidth),
      height: Math.min((maxY - minY) * invScaleY, canvasHeight)
    };
    
    return {
      mask: {
        data: maskData,
        width: maskWidth,
        height: maskHeight
      },
      bbox: bbox,
      score: scores[bestIdx],
      points: points, // Return all points used
      transform: {
        scaleX: invScaleX,
        scaleY: invScaleY,
        originalSize: { width: canvasWidth, height: canvasHeight },
        maskSize: { width: maskWidth, height: maskHeight }
      }
    };
    
  } catch (err) {
    console.error('Prediction failed:', err);
    return null;
  } finally {
    SAM.isProcessing = false;
  }
}

/**
 * Original predictMask for backwards compatibility
 * Returns just the bbox
 */
async function predictMask(pointX, pointY) {
  const result = await predictMaskFull(pointX, pointY);
  if (!result) return null;
  
  document.getElementById('status-sam').textContent = 'SAM: Ready';
  return result.bbox;
}

// ============ POLYGON EXTRACTION ============

/**
 * Convert binary mask to polygon points using contour tracing
 */
function maskToPolygon(maskData, maskWidth, maskHeight, transform, simplifyThreshold = 2) {
  const { scaleX, scaleY } = transform;
  
  // Create binary mask
  const binaryMask = new Uint8Array(maskWidth * maskHeight);
  for (let i = 0; i < maskData.length; i++) {
    binaryMask[i] = maskData[i] > 0 ? 1 : 0;
  }
  
  // Find contours
  const contours = findContours(binaryMask, maskWidth, maskHeight);
  
  if (contours.length === 0) return [];
  
  // Get largest contour
  let largestContour = contours[0];
  for (const contour of contours) {
    if (contour.length > largestContour.length) {
      largestContour = contour;
    }
  }
  
  // Simplify polygon
  const simplified = simplifyPolygon(largestContour, simplifyThreshold);
  
  // Convert to canvas coordinates
  const polygon = simplified.map(p => ({
    x: Math.round(p.x * scaleX),
    y: Math.round(p.y * scaleY)
  }));
  
  return polygon;
}

/**
 * Find contours in binary mask using edge following
 */
function findContours(mask, width, height) {
  const contours = [];
  const visited = new Set();
  
  // Find edge pixels
  const edgePixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 1) {
        const isEdge = 
          x === 0 || x === width - 1 || 
          y === 0 || y === height - 1 ||
          mask[idx - 1] === 0 || mask[idx + 1] === 0 ||
          mask[idx - width] === 0 || mask[idx + width] === 0;
        
        if (isEdge) {
          edgePixels.push({ x, y });
        }
      }
    }
  }
  
  // Trace contours
  while (edgePixels.length > 0) {
    const start = edgePixels.pop();
    const key = `${start.x},${start.y}`;
    
    if (visited.has(key)) continue;
    
    const contour = [start];
    visited.add(key);
    
    let current = start;
    let searching = true;
    
    while (searching) {
      searching = false;
      
      // 8-connected neighbors
      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x + 1, y: current.y + 1 },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
        { x: current.x - 1, y: current.y - 1 },
        { x: current.x, y: current.y - 1 },
        { x: current.x + 1, y: current.y - 1 },
      ];
      
      for (const neighbor of neighbors) {
        const nKey = `${neighbor.x},${neighbor.y}`;
        if (visited.has(nKey)) continue;
        
        const nIdx = neighbor.y * width + neighbor.x;
        if (neighbor.x >= 0 && neighbor.x < width && 
            neighbor.y >= 0 && neighbor.y < height &&
            mask[nIdx] === 1) {
          
          const isEdge = 
            neighbor.x === 0 || neighbor.x === width - 1 || 
            neighbor.y === 0 || neighbor.y === height - 1 ||
            mask[nIdx - 1] === 0 || mask[nIdx + 1] === 0 ||
            mask[nIdx - width] === 0 || mask[nIdx + width] === 0;
          
          if (isEdge) {
            contour.push(neighbor);
            visited.add(nKey);
            current = neighbor;
            searching = true;
            break;
          }
        }
      }
    }
    
    // Only keep contours with enough points
    if (contour.length > 10) {
      contours.push(contour);
    }
  }
  
  return contours;
}

/**
 * Simplify polygon using Douglas-Peucker algorithm
 */
function simplifyPolygon(points, tolerance) {
  if (points.length <= 2) return points;
  
  let maxDist = 0;
  let maxIndex = 0;
  
  const start = points[0];
  const end = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  
  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  
  return [start, end];
}

/**
 * Calculate perpendicular distance from point to line
 */
function perpendicularDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) return 0;
  
  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
  
  const closestX = lineStart.x + u * dx;
  const closestY = lineStart.y + u * dy;
  
  return Math.sqrt(Math.pow(point.x - closestX, 2) + Math.pow(point.y - closestY, 2));
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  
  let area = 0;
  const n = polygon.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  
  return Math.abs(area / 2);
}

/**
 * Calculate bounding box from polygon
 */
function calculatePolygonBounds(polygon) {
  if (!polygon || polygon.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

// ============ AUTO-EMBED ============

async function autoEmbedIfNeeded(dataUrl) {
  const autoEmbed = document.getElementById('sam-auto-embed')?.checked ?? true;
  const currentImg = getCurrentImage();
  
  if (autoEmbed && currentImg && SAM.isReady && SAM.embeddedImageName !== currentImg) {
    console.log('Auto-embedding:', currentImg);
    await generateEmbedding(dataUrl);
  }
}

// ============ MANUAL EMBED ============

async function manualEmbed() {
  if (!backgroundImage) {
    alert('No image loaded!');
    return;
  }
  await generateEmbedding(backgroundImage.toDataURL());
}

// ============ INIT ============

function initSAMControls() {
  document.getElementById('btn-embed')?.addEventListener('click', manualEmbed);
  
  // Threshold slider
  const thresholdSlider = document.getElementById('sam-threshold');
  const thresholdValue = document.getElementById('sam-threshold-value');
  
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', (e) => {
      const value = e.target.value / 100;
      thresholdValue.textContent = value.toFixed(2);
      setSamThreshold(value);
    });
  }
  
  // Hover preview toggle
  const hoverToggle = document.getElementById('sam-hover-preview');
  if (hoverToggle) {
    hoverToggle.addEventListener('change', (e) => {
      setSamHoverEnabled(e.target.checked);
    });
  }
  
  initSAM();
}

// Exports
if (typeof window !== 'undefined') {
  window.SAM = SAM;
  window.predictMask = predictMask;
  window.predictMaskFull = predictMaskFull;
  window.maskToPolygon = maskToPolygon;
  window.calculatePolygonArea = calculatePolygonArea;
  window.calculatePolygonBounds = calculatePolygonBounds;
  window.autoEmbedIfNeeded = autoEmbedIfNeeded;
}