const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder operations
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  connectFolder: (folderPath) => ipcRenderer.invoke('connect-folder', folderPath),
  
  // Image operations
  getImage: (imageName) => ipcRenderer.invoke('get-image', imageName),
  
  // Annotations
  saveAnnotations: (annotations) => ipcRenderer.invoke('save-annotations', annotations),
  loadAnnotations: () => ipcRenderer.invoke('load-annotations'),
  
  // Export
  exportDataset: (data) => ipcRenderer.invoke('export-dataset', data),
  
  // Validation
  validateImage: (data) => ipcRenderer.invoke('validate-image', data)
});
