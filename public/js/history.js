// ============ UNDO/REDO HISTORY ============

const History = {
  undoStack: [],
  redoStack: [],
  maxSize: 50
};

function pushHistory(action) {
  const snapshot = {
    type: action.type,
    imageName: getCurrentImage(),
    data: JSON.parse(JSON.stringify(action.data))
  };
  
  History.undoStack.push(snapshot);
  
  if (History.undoStack.length > History.maxSize) {
    History.undoStack.shift();
  }
  
  History.redoStack = [];
  updateHistoryButtons();
}

function undo() {
  if (History.undoStack.length === 0) return;
  
  const action = History.undoStack.pop();
  
  const ann = State.annotations[action.imageName];
  if (ann) {
    History.redoStack.push({
      type: action.type,
      imageName: action.imageName,
      data: JSON.parse(JSON.stringify(ann.boxes))
    });
  }
  
  if (action.type === 'boxes') {
    State.annotations[action.imageName].boxes = action.data;
  }
  
  if (action.imageName === getCurrentImage()) {
    renderBoxes();
  }
  
  markUnsaved();
  updateHistoryButtons();
}

function redo() {
  if (History.redoStack.length === 0) return;
  
  const action = History.redoStack.pop();
  
  const ann = State.annotations[action.imageName];
  if (ann) {
    History.undoStack.push({
      type: action.type,
      imageName: action.imageName,
      data: JSON.parse(JSON.stringify(ann.boxes))
    });
  }
  
  if (action.type === 'boxes') {
    State.annotations[action.imageName].boxes = action.data;
  }
  
  if (action.imageName === getCurrentImage()) {
    renderBoxes();
  }
  
  markUnsaved();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  document.getElementById('btn-undo').disabled = History.undoStack.length === 0;
  document.getElementById('btn-redo').disabled = History.redoStack.length === 0;
}

function saveStateForUndo() {
  const img = getCurrentImage();
  const ann = getCurrentAnnotations();
  
  if (img && ann) {
    pushHistory({
      type: 'boxes',
      data: JSON.parse(JSON.stringify(ann.boxes))
    });
  }
}

document.addEventListener('DOMContentLoaded', updateHistoryButtons);
