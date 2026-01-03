// ============ BOUNDING BOX TOOL ============

let isDrawing = false;
let startPoint = null;
let activeRect = null;

function initBboxTool() {
  fabricCanvas.on('mouse:down', handleBboxMouseDown);
  fabricCanvas.on('mouse:move', handleBboxMouseMove);
  fabricCanvas.on('mouse:up', handleBboxMouseUp);
  
  fabricCanvas.on('selection:created', handleSelection);
  fabricCanvas.on('selection:updated', handleSelection);
  fabricCanvas.on('object:modified', handleBoxModified);
}

function handleBboxMouseDown(opt) {
  if (State.isPanning || State.currentTool !== 'bbox') return;
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

// ============ RENDER BOXES ============

function renderBoxes() {
  const objects = fabricCanvas.getObjects().filter(obj => obj !== backgroundImage);
  objects.forEach(obj => fabricCanvas.remove(obj));
  
  const ann = getCurrentAnnotations();
  if (!ann || !ann.boxes) return;
  
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
  
  fabricCanvas.renderAll();
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
  if (obj && obj.boxIndex !== undefined) {
    // Could show inspector panel here
  }
}

function handleBoxModified(opt) {
  const obj = opt.target;
  if (obj.boxIndex === undefined) return;
  
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

// ============ DELETE ============

function deleteSelected() {
  const activeObj = fabricCanvas.getActiveObject();
  if (!activeObj || activeObj.boxIndex === undefined) return;
  
  saveStateForUndo();
  
  const index = activeObj.boxIndex;
  
  if (activeObj.labelText) {
    fabricCanvas.remove(activeObj.labelText);
  }
  fabricCanvas.remove(activeObj);
  
  removeBox(index);
  
  renderBoxes();
}

// ============ REPEAT ANNOTATION ============

function repeatLastAnnotation() {
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
