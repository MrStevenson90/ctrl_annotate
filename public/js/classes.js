// ============ CLASS MANAGEMENT ============

const CLASS_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1'
];

function getClassColor(index) {
  return CLASS_COLORS[index % CLASS_COLORS.length];
}

function renderClassList() {
  const container = document.getElementById('class-list');
  container.innerHTML = '';
  
  State.classList.forEach((cls, index) => {
    const item = document.createElement('div');
    item.className = 'class-item' + (State.activeClass === cls ? ' selected' : '');
    item.innerHTML = `
      <div class="class-color" style="background: ${getClassColor(index)}"></div>
      <span class="class-name">${cls}</span>
      <span class="class-delete" data-index="${index}">✕</span>
    `;
    
    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('class-delete')) {
        selectClass(cls);
      }
    });
    
    container.appendChild(item);
  });
  
  document.getElementById('active-class').textContent = State.activeClass || 'None';
}

function selectClass(className) {
  State.activeClass = className;
  renderClassList();
}

function addClass(className) {
  if (!className || className.trim() === '') return;
  
  const name = className.trim();
  
  if (!State.classList.includes(name)) {
    State.classList.push(name);
    renderClassList();
  }
  
  selectClass(name);
}

function removeClass(index) {
  const removed = State.classList.splice(index, 1)[0];
  
  if (State.activeClass === removed) {
    State.activeClass = State.classList[0] || null;
  }
  
  renderClassList();
}

function initClassManager() {
  const input = document.getElementById('new-class');
  const addBtn = document.getElementById('btn-add-class');
  
  addBtn.addEventListener('click', () => {
    addClass(input.value);
    input.value = '';
  });
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addClass(input.value);
      input.value = '';
    }
  });
  
  document.getElementById('class-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('class-delete')) {
      const index = parseInt(e.target.dataset.index);
      removeClass(index);
    }
  });
  
  if (State.classList.length === 0) {
    addClass('object');
  }
  
  renderClassList();
}
