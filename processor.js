const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');
const YAML = require('yaml');
const AdmZip = require('adm-zip');

// YOLO Model Presets
const MODEL_PRESETS = {
  yolov5s: { size: 640, name: 'YOLOv5' },
  yolov5m: { size: 640, name: 'YOLOv5' },
  yolov5_416: { size: 416, name: 'YOLOv5 (416)' },
  yolov8n: { size: 640, name: 'YOLOv8' },
  yolov8s: { size: 640, name: 'YOLOv8' },
  yolov8m: { size: 640, name: 'YOLOv8' },
  yolov8_1280: { size: 1280, name: 'YOLOv8 (1280)' },
  yolov11n: { size: 640, name: 'YOLOv11' },
  yolov11s: { size: 640, name: 'YOLOv11' }
};

/**
 * Calculate letterbox parameters
 */
function getLetterboxParams(origWidth, origHeight, targetSize) {
  const scale = Math.min(targetSize / origWidth, targetSize / origHeight);
  const newWidth = Math.round(origWidth * scale);
  const newHeight = Math.round(origHeight * scale);
  const offsetX = Math.round((targetSize - newWidth) / 2);
  const offsetY = Math.round((targetSize - newHeight) / 2);
  
  return { scale, newWidth, newHeight, offsetX, offsetY };
}

/**
 * Convert bbox to YOLO format with letterbox correction
 */
function bboxToYolo(bbox, origSize, targetSize, classId) {
  const { scale, offsetX, offsetY } = getLetterboxParams(
    origSize.width, origSize.height, targetSize
  );
  
  // Original bbox center and dimensions
  const origCenterX = bbox.x + bbox.width / 2;
  const origCenterY = bbox.y + bbox.height / 2;
  
  // Apply scale and offset, then normalize
  const xNorm = ((origCenterX * scale) + offsetX) / targetSize;
  const yNorm = ((origCenterY * scale) + offsetY) / targetSize;
  const wNorm = (bbox.width * scale) / targetSize;
  const hNorm = (bbox.height * scale) / targetSize;
  
  // Clamp values to 0-1 range
  const clamp = v => Math.max(0, Math.min(1, v));
  
  return `${classId} ${clamp(xNorm).toFixed(6)} ${clamp(yNorm).toFixed(6)} ${clamp(wNorm).toFixed(6)} ${clamp(hNorm).toFixed(6)}`;
}

/**
 * Process single image with filters and letterboxing
 */
async function processImage(inputPath, outputPath, filters, targetSize) {
  // Ensure output directory exists
  await fs.ensureDir(path.dirname(outputPath));
  
  let pipeline = sharp(inputPath);
  
  // Apply filters
  if (filters.brightness !== 1 || filters.saturation !== 1) {
    pipeline = pipeline.modulate({
      brightness: filters.brightness || 1,
      saturation: filters.saturation || 1
    });
  }
  
  if (filters.exposure && filters.exposure !== 1) {
    pipeline = pipeline.linear(filters.exposure, 0);
  }
  
  if (filters.grayscale) {
    pipeline = pipeline.grayscale();
  }
  
  if (filters.blur && filters.blur > 0) {
    pipeline = pipeline.blur(filters.blur);
  }
  
  // Letterbox resize
  pipeline = pipeline.resize({
    width: targetSize,
    height: targetSize,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0 }
  });
  
  await pipeline.toFile(outputPath);
}

/**
 * Create class mapping from annotations
 */
function createClassMap(annotations, classList) {
  const classMap = new Map();
  classList.forEach((label, index) => {
    classMap.set(label, index);
  });
  return classMap;
}

/**
 * Split images into train/val sets
 */
function splitDataset(imageNames, trainRatio) {
  const shuffled = [...imageNames].sort(() => Math.random() - 0.5);
  const splitIndex = Math.floor(shuffled.length * trainRatio);
  
  return {
    train: shuffled.slice(0, splitIndex),
    val: shuffled.slice(splitIndex)
  };
}

/**
 * Get safe filename (flatten subdirectory paths)
 */
function getSafeFilename(relativePath) {
  // Replace path separators with underscores
  return relativePath.replace(/[\/\\]/g, '_');
}

/**
 * Main batch export function
 */
async function batchExport(sourceFolder, annotations, config, outputDir) {
  const { 
    targetSize = 640, 
    filters = {}, 
    classList = [],
    trainRatio = 0.8 
  } = config;
  
  // Clean output directory
  await fs.emptyDir(outputDir);
  
  // Create class mapping
  const classMap = createClassMap(annotations, classList);
  
  // Prepare directories
  const dirs = [
    'images/train', 'images/val',
    'labels/train', 'labels/val'
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(outputDir, dir));
  }
  
  // Get annotated images
  const annotatedImages = Object.keys(annotations).filter(
    img => annotations[img]?.boxes?.length > 0
  );
  
  if (annotatedImages.length === 0) {
    throw new Error('No annotated images to export');
  }
  
  // Split dataset
  const split = splitDataset(annotatedImages, trainRatio);
  
  // Process each split
  for (const [splitName, images] of Object.entries(split)) {
    for (const imgName of images) {
      // Handle subdirectory paths
      const inputPath = path.join(sourceFolder, imgName);
      
      if (!await fs.pathExists(inputPath)) {
        console.warn(`Image not found: ${inputPath}`);
        continue;
      }
      
      // Flatten filename for output (replace slashes with underscores)
      const safeFilename = getSafeFilename(imgName);
      const baseName = path.basename(safeFilename, path.extname(safeFilename));
      const ext = path.extname(safeFilename);
      
      const imgDir = path.join(outputDir, 'images', splitName);
      const lblDir = path.join(outputDir, 'labels', splitName);
      
      // Output paths
      const outImgPath = path.join(imgDir, `${baseName}${ext}`);
      const outLblPath = path.join(lblDir, `${baseName}.txt`);
      
      // Process image
      await processImage(inputPath, outImgPath, filters, targetSize);
      
      // Generate labels
      const imgData = annotations[imgName];
      const lines = imgData.boxes.map(box => {
        const classId = classMap.get(box.label) ?? 0;
        return bboxToYolo(box, imgData.originalSize, targetSize, classId);
      });
      
      await fs.writeFile(outLblPath, lines.join('\n'));
    }
  }
  
  // Generate data.yaml
  const yamlData = {
    path: '.',
    train: 'images/train',
    val: 'images/val',
    nc: classList.length,
    names: classList
  };
  
  await fs.writeFile(
    path.join(outputDir, 'data.yaml'),
    YAML.stringify(yamlData)
  );
  
  // Create ZIP
  const zip = new AdmZip();
  zip.addLocalFolder(outputDir);
  
  return zip.toBuffer();
}

/**
 * Generate validation preview with bboxes drawn on letterboxed image
 */
async function generateValidationPreview(inputPath, annotations, config) {
  const { targetSize = 640, filters = {} } = config;
  
  // Get original image dimensions
  const metadata = await sharp(inputPath).metadata();
  const origSize = { width: metadata.width, height: metadata.height };
  
  // Process image
  let pipeline = sharp(inputPath);
  
  if (filters.brightness !== 1 || filters.saturation !== 1) {
    pipeline = pipeline.modulate({
      brightness: filters.brightness || 1,
      saturation: filters.saturation || 1
    });
  }
  
  if (filters.grayscale) {
    pipeline = pipeline.grayscale();
  }
  
  // Letterbox
  pipeline = pipeline.resize({
    width: targetSize,
    height: targetSize,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0 }
  });
  
  // Get processed image buffer
  const imageBuffer = await pipeline.png().toBuffer();
  
  // Calculate letterbox params for drawing boxes
  const { scale, offsetX, offsetY } = getLetterboxParams(
    origSize.width, origSize.height, targetSize
  );
  
  // Create SVG overlay with bboxes
  const boxes = annotations.boxes || [];
  const svgRects = boxes.map(box => {
    // Convert original coords to letterboxed space
    const x = Math.round(box.x * scale + offsetX);
    const y = Math.round(box.y * scale + offsetY);
    const w = Math.round(box.width * scale);
    const h = Math.round(box.height * scale);
    
    // Escape label for XML
    const label = (box.label || '').replace(/[<>&'"]/g, '');
    
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" 
            fill="none" stroke="#00ff00" stroke-width="2"/>
            <text x="${x}" y="${y - 5}" fill="#00ff00" font-size="14" font-family="Arial">${label}</text>`;
  }).join('');
  
  const svgOverlay = Buffer.from(`
    <svg width="${targetSize}" height="${targetSize}">
      ${svgRects}
    </svg>
  `);
  
  // Composite overlay onto image
  const result = await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
  
  return result;
}

module.exports = {
  batchExport,
  generateValidationPreview,
  MODEL_PRESETS,
  getLetterboxParams,
  bboxToYolo
};
