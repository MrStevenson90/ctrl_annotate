const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const processor = require('./processor');

// Keep a global reference of the window object
let mainWindow = null;

// Paths
const USER_DATA_PATH = app.getPath('userData');
const ANNOTATIONS_PATH = path.join(USER_DATA_PATH, 'annotations.json');
const OUTPUT_PATH = path.join(USER_DATA_PATH, 'output');

// SAM Models path (relative to app)
const MODELS_PATH = path.join(__dirname, 'public', 'models');

// Current state
let currentImageFolder = null;

// ============ CREATE WINDOW ============

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'public/icons/icon.png'),
    title: 'YOLO Annotator'
  });

  mainWindow.loadFile('public/index.html');

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============ APP LIFECYCLE ============

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ============ IPC HANDLERS ============

// Open folder dialog
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Image Folder'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false };
  }

  const folderPath = result.filePaths[0];
  return connectFolder(folderPath);
});

// Connect to folder by path
ipcMain.handle('connect-folder', async (event, folderPath) => {
  return connectFolder(folderPath);
});

// Get image data as base64
ipcMain.handle('get-image', async (event, imageName) => {
  if (!currentImageFolder) {
    return { success: false, error: 'No folder connected' };
  }

  try {
    const imagePath = path.join(currentImageFolder, imageName);
    const buffer = await fs.readFile(imagePath);
    const ext = path.extname(imageName).toLowerCase();
    
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    if (ext === '.webp') mimeType = 'image/webp';

    const base64 = buffer.toString('base64');
    return { 
      success: true, 
      data: `data:${mimeType};base64,${base64}` 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Save annotations
ipcMain.handle('save-annotations', async (event, annotations) => {
  try {
    await fs.writeJson(ANNOTATIONS_PATH, annotations, { spaces: 2 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Load annotations
ipcMain.handle('load-annotations', async () => {
  try {
    if (await fs.pathExists(ANNOTATIONS_PATH)) {
      const annotations = await fs.readJson(ANNOTATIONS_PATH);
      return { success: true, annotations };
    }
    return { success: true, annotations: {} };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Export dataset
ipcMain.handle('export-dataset', async (event, { annotations, config }) => {
  if (!currentImageFolder) {
    return { success: false, error: 'No folder connected' };
  }

  try {
    // Show save dialog for ZIP file
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Dataset',
      defaultPath: `yolo_dataset_${Date.now()}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    });

    if (result.canceled) {
      return { success: false, error: 'Export canceled' };
    }

    // Run export
    const zipBuffer = await processor.batchExport(
      currentImageFolder,
      annotations,
      config,
      OUTPUT_PATH
    );

    // Save ZIP file
    await fs.writeFile(result.filePath, zipBuffer);

    // Clean up temp output folder
    await fs.emptyDir(OUTPUT_PATH);

    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Generate validation preview
ipcMain.handle('validate-image', async (event, { imageName, annotations, config }) => {
  if (!currentImageFolder) {
    return { success: false, error: 'No folder connected' };
  }

  try {
    const inputPath = path.join(currentImageFolder, imageName);
    const buffer = await processor.generateValidationPreview(
      inputPath,
      annotations,
      config
    );

    const base64 = buffer.toString('base64');
    return { 
      success: true, 
      data: `data:image/png;base64,${base64}` 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============ SAM 2 MODEL HANDLERS ============

// Check if SAM models exist
ipcMain.handle('check-sam-models', async () => {
  const encoderPath = path.join(MODELS_PATH, 'sam_vit_b-encoder-int8.onnx');
  const decoderPath = path.join(MODELS_PATH, 'sam_vit_b_decoder.onnx');
  
  const encoderExists = await fs.pathExists(encoderPath);
  const decoderExists = await fs.pathExists(decoderPath);
  
  console.log('SAM Models Path:', MODELS_PATH);
  console.log('Encoder exists:', encoderExists, encoderPath);
  console.log('Decoder exists:', decoderExists, decoderPath);
  
  return {
    encoder: encoderExists,
    decoder: decoderExists
  };
});

// Load SAM model as Buffer (Electron serializes to Uint8Array in renderer)
ipcMain.handle('load-sam-model', async (event, modelName) => {
  try {
    const modelPath = path.join(MODELS_PATH, modelName);
    
    if (!await fs.pathExists(modelPath)) {
      console.error('Model not found:', modelPath);
      return null;
    }
    
    console.log('Loading SAM model:', modelPath);
    
    // Read file as buffer
    const buffer = await fs.readFile(modelPath);
    
    console.log('Model loaded, size:', buffer.length, 'bytes');
    
    // Return buffer directly - Electron serializes it as Uint8Array in renderer
    // ONNX Runtime accepts Uint8Array directly
    return buffer;
  } catch (err) {
    console.error('Failed to load SAM model:', err);
    return null;
  }
});

// ============ HELPER FUNCTIONS ============

async function connectFolder(folderPath) {
  try {
    if (!await fs.pathExists(folderPath)) {
      return { success: false, error: 'Folder does not exist' };
    }

    // Scan for images (including subdirectories)
    const images = await scanForImages(folderPath);

    if (images.length === 0) {
      return { success: false, error: 'No images found in folder' };
    }

    currentImageFolder = folderPath;

    return { 
      success: true, 
      path: folderPath,
      images: images.sort()
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function scanForImages(folderPath, basePath = null) {
  const images = [];
  const base = basePath || folderPath;

  const items = await fs.readdir(folderPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(folderPath, item.name);

    if (item.isDirectory()) {
      // Recursively scan subdirectories
      const subImages = await scanForImages(fullPath, base);
      images.push(...subImages);
    } else if (item.isFile()) {
      // Check if it's an image
      if (/\.(jpg|jpeg|png|webp)$/i.test(item.name)) {
        // Get relative path from base folder
        const relativePath = path.relative(base, fullPath);
        images.push(relativePath);
      }
    }
  }

  return images;
}