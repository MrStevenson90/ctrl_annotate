// ============ BOUNDING BOX TOOL ============

let isDrawing = false;
let startPoint = null;
let activeRect = null;

function initBboxTool() {
  fabricCanvas.on('mouse:down', handleMouseDown);
  fabricCanvas.on('mouse:move', handleBboxMouseMove);
  fabricCanvas.on('mouse:up', handleBboxMouseUp);
  
  fabricCanvas.on('selection:created', handleSelection);
  fabricCanvas.on('selection:updated', handleSelection);
  fabricCanvas.on('object:modified', handleBoxModified);
}

// ============ UNIFIED MOUSE DOWN HANDLER ============

function handleMouseDown(opt) {
  if (State.isPanning) return;
  
  if (State.currentTool === 'magic') {
    handleMagicMouseDown(opt);
  } else if (State.currentTool === 'bbox') {
    handleBboxMouseDown(opt);
  }
}

// ============ BBOX TOOL ============

function handleBboxMouseDown(opt) {
  if (State.currentTool !== 'bbox') return;
  
  if (!State.activeClass) {
    alert('Please select or create a class first!');
    return;
  }
  
  if (opt.target && opt.target.boxIndex !== undefined) return;
  
  isDrawing = true;
  const pointer = fabricCanvas.getPointer(opt.e);
  startPoint = pointer;
  
  saveStateForUndo();
  
  const classIndex = State.classList.indexOf(State.activeClass);
  const color = getClassColor(classIndex);
  
  activeRect = new fabric.Rect({
    left: pointer.x,
    top: pointer.y,
    width: 0,
    height: 0,
    fill: 'transparent',
    stroke: color,
    strokeWidth: 2,
    selectable: true,
    hasControls: true,
    cornerColor: color,
    cornerSize: 8,
    transparentCorners: false
  });
  
  fabricCanvas.add(activeRect);
}

function handleBboxMouseMove(opt) {
  if (!isDrawing || !activeRect) return;
  
  const pointer = fabricCanvas.getPointer(opt.e);
  
  const left = Math.min(startPoint.x, pointer.x);
  const top = Math.min(startPoint.y, pointer.y);
  const width = Math.abs(pointer.x - startPoint.x);
  const height = Math.abs(pointer.y - startPoint.y);
  
  activeRect.set({
    left: left,
    top: top,
    width: width,
    height: height
  });
  
  fabricCanvas.renderAll();
}

function handleBboxMouseUp(opt) {
  if (!isDrawing || !activeRect) return;
  
  isDrawing = false;
  
  if (activeRect.width < 5 || activeRect.height < 5) {
    fabricCanvas.remove(activeRect);
    activeRect = null;
    return;
  }
  
  const imgCoords = screenToImageCoords(activeRect.left, activeRect.top);
  const scale = backgroundImage.scaleX;
  
  if (!imgCoords) {
    fabricCanvas.remove(activeRect);
    activeRect = null;
    return;
  }
  
  const box = {
    x: imgCoords.x,
    y: imgCoords.y,
    width: activeRect.width / scale,
    height: activeRect.height / scale,
    label: State.activeClass
  };
  
  const ann = getCurrentAnnotations();
  const boxIndex = ann.boxes.length;
  addBox(box);
  
  activeRect.boxIndex = boxIndex;
  activeRect.set({ name: State.activeClass });
  
  addLabelToRect(activeRect, State.activeClass, getClassColor(State.classList.indexOf(State.activeClass)));
  
  fabricCanvas.setActiveObject(activeRect);
  fabricCanvas.renderAll();
  
  activeRect = null;
}

// ============ MAGIC TOOL (SAM 2) ============

async function handleMagicMouseDown(opt) {
  if (State.currentTool !== 'magic') return;
  
  // Check SAM availability
  if (typeof SAM === 'undefined' || !SAM.isReady) {
    alert('SAM 2 is not ready. Please wait for models to load.');
    return;
  }
  
  if (!SAM.currentEmbedding) {
    alert('No image embedding found. Click "Re-embed Image" or enable auto-embed.');
    return;
  }
  
  if (SAM.isProcessing) {
    console.log('SAM is already processing...');
    return;
  }
  
  if (!State.activeClass) {
    alert('Please select or create a class first!');
    return;
  }
  
  // Get click coordinates in image space
  const pointer = fabricCanvas.getPointer(opt.e);
  const imgCoords = screenToImageCoords(pointer.x, pointer.y);
  
  if (!imgCoords) {
    console.log('Click outside image bounds');
    return;
  }
  
  // Check if click is on existing object
  if (opt.target && (opt.target.boxIndex !== undefined || opt.target.segmentIndex !== undefined)) {
    return;
  }
  
  // Check for Shift key (group mode) - only in SAM2 format
  const isShiftPressed = opt.e.shiftKey;
  const exportFormat = getExportFormat();
  const isGroupClick = isShiftPressed && exportFormat === 'sam2' && State.groupMode;
  
  // Visual feedback - show click point
  const clickIndicator = new fabric.Circle({
    left: pointer.x - 5,
    top: pointer.y - 5,
    radius: 5,
    fill: isGroupClick ? '#22c55e' : '#a855f7', // Green for group, purple for single
    selectable: false,
    evented: false,
    opacity: 0.8,
    isClickIndicator: true
  });
  fabricCanvas.add(clickIndicator);
  fabricCanvas.renderAll();
  
  // Change cursor to indicate processing
  const container = document.getElementById('canvas-container');
  container.style.cursor = 'wait';
  
  try {
    // In group mode with Shift: accumulate points
    if (isGroupClick) {
      addPendingPoint(imgCoords.x, imgCoords.y);
      console.log('Added point to group:', imgCoords, 'Total points:', State.pendingPoints.length);
      
      // Update hint
      if (typeof updateGroupModeHint === 'function') {
        updateGroupModeHint(State.pendingPoints.length);
      }
      
      // Run prediction with all accumulated points to show preview
      const result = await predictMaskFull(State.pendingPoints);
      
      if (result) {
        // Store current mask for preview
        State.pendingMask = result;
        
        // Render preview polygon
        renderGroupPreview(result);
      }
      
      // Keep click indicator visible for group points
      return;
    }
    
    // Non-group click: finalize any pending group first
    if (hasPendingPoints()) {
      await finalizeGroupSegment();
      clearGroupPreview();
    }
    
    console.log('Predicting mask at:', imgCoords);
    
    // Run SAM prediction - get full result with mask and polygon
    const result = await predictMaskFull(imgCoords.x, imgCoords.y);
    
    // Remove click indicator
    fabricCanvas.remove(clickIndicator);
    
    if (!result || !result.bbox || result.bbox.width < 5 || result.bbox.height < 5) {
      console.log('No valid mask found at click point');
      fabricCanvas.renderAll();
      return;
    }
    
    // Save state for undo
    saveStateForUndo();
    
    if (exportFormat === 'sam2') {
      // SAM2 mode: Store polygon only
      const polygon = maskToPolygon(
        result.mask.data,
        result.mask.width,
        result.mask.height,
        result.transform
      );
      
      if (polygon.length >= 3) {
        const segment = {
          id: `seg_${Date.now()}`,
          label: State.activeClass,
          polygon: polygon,
          clickPoint: { x: imgCoords.x, y: imgCoords.y },
          score: result.score,
          bounds: result.bbox,
          timestamp: Date.now()
        };
        
        addSegment(segment);
        console.log('Added SAM2 segment:', segment);
      }
    } else {
      // YOLO mode: Store bounding box
      const box = {
        x: result.bbox.x,
        y: result.bbox.y,
        width: result.bbox.width,
        height: result.bbox.height,
        label: State.activeClass
      };
      
      addBox(box);
      console.log('Added YOLO box:', box);
    }
    
    // Re-render all annotations
    renderBoxes();
    
  } catch (err) {
    console.error('Magic tool error:', err);
    fabricCanvas.remove(clickIndicator);
  } finally {
    // Restore cursor
    container.style.cursor = '';
    updateCursorForTool();
  }
}

// ============ GROUP MODE FUNCTIONS ============

/**
 * Finalize pending group points into a single segment
 */
async function finalizeGroupSegment() {
  if (!hasPendingPoints()) {
    console.log('No pending points to finalize');
    return;
  }
  
  console.log('Finalizing group with', State.pendingPoints.length, 'points');
  
  // Use the stored mask or re-predict
  let result = State.pendingMask;
  if (!result) {
    result = await predictMaskFull(State.pendingPoints);
  }
  
  if (!result || !result.bbox || result.bbox.width < 5 || result.bbox.height < 5) {
    console.log('No valid mask for group');
    clearPendingPoints();
    return;
  }
  
  saveStateForUndo();
  
  const polygon = maskToPolygon(
    result.mask.data,
    result.mask.width,
    result.mask.height,
    result.transform
  );
  
  if (polygon.length >= 3) {
    const segment = {
      id: `seg_${Date.now()}`,
      label: State.activeClass,
      polygon: polygon,
      clickPoints: [...State.pendingPoints], // Store all click points
      score: result.score,
      bounds: result.bbox,
      timestamp: Date.now()
    };
    
    addSegment(segment);
    console.log('Added grouped segment with', State.pendingPoints.length, 'points:', segment);
  }
  
  clearPendingPoints();
  renderBoxes();
  
  // Reset hint
  if (typeof updateGroupModeHint === 'function') {
    updateGroupModeHint(0);
  }
}

/**
 * Render preview of grouped mask
 */
function renderGroupPreview(result) {
  // Remove existing preview
  clearGroupPreview();
  
  if (!result || !result.mask) return;
  
  const polygon = maskToPolygon(
    result.mask.data,
    result.mask.width,
    result.mask.height,
    result.transform
  );
  
  if (polygon.length < 3) return;
  
  const classIndex = State.classList.indexOf(State.activeClass);
  const color = getClassColor(classIndex >= 0 ? classIndex : 0);
  
  // Convert polygon points to screen coordinates
  const points = polygon.map(p => {
    const screen = imageToScreenCoords(p.x, p.y);
    return screen || { x: 0, y: 0 };
  });
  
  // Create preview polygon with dashed stroke
  const previewPoly = new fabric.Polygon(points, {
    fill: hexToRgba(color, 0.2),
    stroke: color,
    strokeWidth: 2,
    strokeDashArray: [5, 5],
    selectable: false,
    evented: false,
    isGroupPreview: true
  });
  
  fabricCanvas.add(previewPoly);
  fabricCanvas.renderAll();
}

/**
 * Clear group preview polygon and click indicators
 */
function clearGroupPreview() {
  const objects = fabricCanvas.getObjects().filter(
    obj => obj.isGroupPreview || obj.isClickIndicator
  );
  objects.forEach(obj => fabricCanvas.remove(obj));
  fabricCanvas.renderAll();
}

/**
 * Cancel current group and clear pending points
 */
function cancelGroup() {
  if (hasPendingPoints()) {
    console.log('Canceling group with', State.pendingPoints.length, 'points');
    clearPendingPoints();
    clearGroupPreview();
    
    // Reset hint
    if (typeof updateGroupModeHint === 'function') {
      updateGroupModeHint(0);
    }
  }
}

/**
 * Handle Enter key to finalize group
 */
function handleGroupFinalize(e) {
  if (e.key === 'Enter' && State.currentTool === 'magic' && hasPendingPoints()) {
    e.preventDefault();
    finalizeGroupSegment();
    clearGroupPreview();
  }
  
  if (e.key === 'Escape' && State.currentTool === 'magic' && hasPendingPoints()) {
    e.preventDefault();
    cancelGroup();
  }
}

// Add keyboard listener for Enter/Escape in group mode
document.addEventListener('keydown', handleGroupFinalize);

// ============ RENDER BOXES & POLYGONS ============

function renderBoxes() {
  // Remove all objects except background image
  const objects = fabricCanvas.getObjects().filter(obj => obj !== backgroundImage);
  objects.forEach(obj => fabricCanvas.remove(obj));
  
  const ann = getCurrentAnnotations();
  if (!ann) return;
  
  const exportFormat = getExportFormat();
  
  // Render boxes (YOLO mode or always show boxes)
  if (ann.boxes && ann.boxes.length > 0) {
    ann.boxes.forEach((box, index) => {
      const classIndex = State.classList.indexOf(box.label);
      const color = getClassColor(classIndex >= 0 ? classIndex : 0);
      
      const screenCoords = imageToScreenCoords(box.x, box.y);
      if (!screenCoords) return;
      
      const scale = backgroundImage.scaleX;
      
      const rect = new fabric.Rect({
        left: screenCoords.x,
        top: screenCoords.y,
        width: box.width * scale,
        height: box.height * scale,
        fill: 'transparent',
        stroke: color,
        strokeWidth: 2,
        selectable: true,
        hasControls: true,
        cornerColor: color,
        cornerSize: 8,
        transparentCorners: false,
        boxIndex: index,
        name: box.label
      });
      
      fabricCanvas.add(rect);
      addLabelToRect(rect, box.label, color);
    });
  }
  
  // Render polygons (SAM2 mode)
  if (ann.polygons && ann.polygons.length > 0) {
    ann.polygons.forEach((segment, index) => {
      renderPolygon(segment, index);
    });
  }
  
  fabricCanvas.renderAll();
}

function renderPolygon(segment, index) {
  if (!segment.polygon || segment.polygon.length < 3) return;
  
  const classIndex = State.classList.indexOf(segment.label);
  const color = getClassColor(classIndex >= 0 ? classIndex : 0);
  const scale = backgroundImage.scaleX;
  
  // Convert polygon points to screen coordinates
  const points = segment.polygon.map(p => {
    const screen = imageToScreenCoords(p.x, p.y);
    return screen || { x: 0, y: 0 };
  });
  
  // Create filled polygon
  const poly = new fabric.Polygon(points, {
    fill: hexToRgba(color, 0.3),
    stroke: color,
    strokeWidth: 2,
    selectable: true,
    hasControls: false,
    hasBorders: true,
    segmentIndex: index,
    name: segment.label
  });
  
  fabricCanvas.add(poly);
  
  // Add label at first point
  if (points.length > 0) {
    const labelText = new fabric.Text(segment.label, {
      left: points[0].x,
      top: points[0].y - 18,
      fontSize: 12,
      fill: color,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: 2,
      selectable: false,
      evented: false
    });
    poly.labelText = labelText;
    fabricCanvas.add(labelText);
  }
}

function hexToRgba(hex, alpha) {
  // Handle rgb() format
  if (hex.startsWith('rgb')) {
    return hex.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
  }
  
  // Handle hex format
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function addLabelToRect(rect, label, color) {
  const text = new fabric.Text(label, {
    left: rect.left,
    top: rect.top - 18,
    fontSize: 12,
    fill: color,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 2,
    selectable: false,
    evented: false
  });
  
  rect.labelText = text;
  fabricCanvas.add(text);
}

// ============ SELECTION & MODIFICATION ============

function handleSelection(opt) {
  const obj = opt.selected?.[0];
  if (obj && (obj.boxIndex !== undefined || obj.segmentIndex !== undefined)) {
    // Could show inspector panel here
  }
}

function handleBoxModified(opt) {
  const obj = opt.target;
  
  // Handle box modification
  if (obj.boxIndex !== undefined) {
    saveStateForUndo();
    
    const imgCoords = screenToImageCoords(obj.left, obj.top);
    const scale = backgroundImage.scaleX;
    
    if (imgCoords) {
      updateBox(obj.boxIndex, {
        x: imgCoords.x,
        y: imgCoords.y,
        width: (obj.width * obj.scaleX) / scale,
        height: (obj.height * obj.scaleY) / scale
      });
      
      obj.set({
        width: obj.width * obj.scaleX,
        height: obj.height * obj.scaleY,
        scaleX: 1,
        scaleY: 1
      });
      
      if (obj.labelText) {
        obj.labelText.set({
          left: obj.left,
          top: obj.top - 18
        });
      }
    }
  }
  
  // Handle polygon modification (move only, no resize)
  if (obj.segmentIndex !== undefined) {
    // Polygon modification would require recalculating all points
    // For now, just update label position
    if (obj.labelText && obj.points && obj.points.length > 0) {
      const firstPoint = obj.points[0];
      obj.labelText.set({
        left: obj.left + firstPoint.x,
        top: obj.top + firstPoint.y - 18
      });
    }
  }
}

// ============ DELETE ============

function deleteSelected() {
  const activeObj = fabricCanvas.getActiveObject();
  if (!activeObj) return;
  
  saveStateForUndo();
  
  // Delete box
  if (activeObj.boxIndex !== undefined) {
    const index = activeObj.boxIndex;
    
    if (activeObj.labelText) {
      fabricCanvas.remove(activeObj.labelText);
    }
    fabricCanvas.remove(activeObj);
    
    removeBox(index);
  }
  
  // Delete segment
  if (activeObj.segmentIndex !== undefined) {
    const index = activeObj.segmentIndex;
    
    if (activeObj.labelText) {
      fabricCanvas.remove(activeObj.labelText);
    }
    fabricCanvas.remove(activeObj);
    
    removeSegment(index);
  }
  
  renderBoxes();
}

// ============ REPEAT ANNOTATION ============

function repeatLastAnnotation() {
  const exportFormat = getExportFormat();
  
  if (exportFormat === 'sam2') {
    if (!State.lastSegment) {
      alert('No previous segment to repeat!');
      return;
    }
    
    if (!State.activeClass) {
      alert('Please select a class first!');
      return;
    }
    
    saveStateForUndo();
    
    const segment = {
      ...State.lastSegment,
      id: `seg_${Date.now()}`,
      label: State.activeClass,
      timestamp: Date.now()
    };
    
    addSegment(segment);
    renderBoxes();
  } else {
    if (!State.lastBox) {
      alert('No previous annotation to repeat!');
      return;
    }
    
    if (!State.activeClass) {
      alert('Please select a class first!');
      return;
    }
    
    saveStateForUndo();
    
    const box = {
      ...State.lastBox,
      label: State.activeClass
    };
    
    addBox(box);
    renderBoxes();
  }
}