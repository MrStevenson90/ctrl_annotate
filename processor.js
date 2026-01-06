const sharp = require('sharp');
const path = require('path');
const fs = require('fs-extra');
const YAML = require('yaml');
const AdmZip = require('adm-zip');

// YOLO Model Presets
const MODEL_PRESETS = {
  yolov5s: { size: 640, name: 'YOLOv5', format: 'yolo' },
  yolov5m: { size: 640, name: 'YOLOv5', format: 'yolo' },
  yolov5_416: { size: 416, name: 'YOLOv5 (416)', format: 'yolo' },
  yolov8n: { size: 640, name: 'YOLOv8', format: 'yolo' },
  yolov8s: { size: 640, name: 'YOLOv8', format: 'yolo' },
  yolov8m: { size: 640, name: 'YOLOv8', format: 'yolo' },
  yolov8_1280: { size: 1280, name: 'YOLOv8 (1280)', format: 'yolo' },
  yolov11n: { size: 640, name: 'YOLOv11', format: 'yolo' },
  yolov11s: { size: 640, name: 'YOLOv11', format: 'yolo' },
  sam2: { size: null, name: 'SAM2 (Polygon)', format: 'sam2' }
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
 * Copy image without resizing (for SAM2 format)
 */
async function copyImage(inputPath, outputPath) {
  await fs.ensureDir(path.dirname(outputPath));
  await fs.copy(inputPath, outputPath);
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
 * Split images into train/val/test sets
 */
function splitDataset(imageNames, ratios) {
  const shuffled = [...imageNames].sort(() => Math.random() - 0.5);
  
  const trainCount = Math.floor(shuffled.length * ratios.train);
  const valCount = Math.floor(shuffled.length * ratios.val);
  
  return {
    train: shuffled.slice(0, trainCount),
    val: shuffled.slice(trainCount, trainCount + valCount),
    test: shuffled.slice(trainCount + valCount)
  };
}

/**
 * Get safe filename (flatten subdirectory paths)
 */
function getSafeFilename(relativePath) {
  return relativePath.replace(/[\/\\]/g, '_');
}

/**
 * Main batch export function - routes to YOLO or SAM2 export
 */
async function batchExport(sourceFolder, annotations, config, outputDir) {
  const exportFormat = config.exportFormat || 'yolo';
  
  if (exportFormat === 'sam2') {
    return batchExportSAM2(sourceFolder, annotations, config, outputDir);
  } else {
    return batchExportYOLO(sourceFolder, annotations, config, outputDir);
  }
}

/**
 * YOLO format export
 */
async function batchExportYOLO(sourceFolder, annotations, config, outputDir) {
  const { 
    targetSize = 640, 
    filters = {}, 
    classList = [],
    ratios = { train: 0.7, val: 0.2, test: 0.1 }
  } = config;
  
  // Clean output directory
  await fs.emptyDir(outputDir);
  
  // Create class mapping
  const classMap = createClassMap(annotations, classList);
  
  // Prepare directories
  const dirs = [
    'images/train', 'images/val', 'images/test',
    'labels/train', 'labels/val', 'labels/test'
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(outputDir, dir));
  }
  
  // Get annotated images (with boxes)
  const annotatedImages = Object.keys(annotations).filter(
    img => annotations[img]?.boxes?.length > 0
  );
  
  if (annotatedImages.length === 0) {
    throw new Error('No annotated images to export');
  }
  
  // Split dataset
  const split = splitDataset(annotatedImages, ratios);
  
  // Track counts
  const counts = { train: 0, val: 0, test: 0 };
  
  // Process each split
  for (const [splitName, images] of Object.entries(split)) {
    if (images.length === 0) continue;
    
    for (const imgName of images) {
      const inputPath = path.join(sourceFolder, imgName);
      
      if (!await fs.pathExists(inputPath)) {
        console.warn(`Image not found: ${inputPath}`);
        continue;
      }
      
      const safeFilename = getSafeFilename(imgName);
      const baseName = path.basename(safeFilename, path.extname(safeFilename));
      const ext = path.extname(safeFilename);
      
      const imgDir = path.join(outputDir, 'images', splitName);
      const lblDir = path.join(outputDir, 'labels', splitName);
      
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
      counts[splitName]++;
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
  
  if (counts.test > 0) {
    yamlData.test = 'images/test';
  }
  
  await fs.writeFile(
    path.join(outputDir, 'data.yaml'),
    YAML.stringify(yamlData)
  );
  
  console.log(`YOLO Export: Train=${counts.train}, Val=${counts.val}, Test=${counts.test}`);
  
  // Create ZIP
  const zip = new AdmZip();
  zip.addLocalFolder(outputDir);
  
  return zip.toBuffer();
}

/**
 * SAM2 format export - preserves original images and exports polygon annotations as JSON
 */
async function batchExportSAM2(sourceFolder, annotations, config, outputDir) {
  const { 
    classList = [],
    ratios = { train: 0.7, val: 0.2, test: 0.1 }
  } = config;
  
  // Clean output directory
  await fs.emptyDir(outputDir);
  
  // Create class mapping
  const classMap = createClassMap(annotations, classList);
  
  // Prepare directories
  const dirs = ['images/train', 'images/val', 'images/test'];
  for (const dir of dirs) {
    await fs.ensureDir(path.join(outputDir, dir));
  }
  
  // Get annotated images (with polygons)
  const annotatedImages = Object.keys(annotations).filter(
    img => annotations[img]?.polygons?.length > 0
  );
  
  if (annotatedImages.length === 0) {
    throw new Error('No annotated images with polygons to export');
  }
  
  // Split dataset
  const split = splitDataset(annotatedImages, ratios);
  
  // Track counts and build annotation JSONs
  const counts = { train: 0, val: 0, test: 0 };
  const splitAnnotations = { train: [], val: [], test: [] };
  
  let imageId = 0;
  let annotationId = 0;
  
  // Process each split
  for (const [splitName, images] of Object.entries(split)) {
    if (images.length === 0) continue;
    
    for (const imgName of images) {
      const inputPath = path.join(sourceFolder, imgName);
      
      if (!await fs.pathExists(inputPath)) {
        console.warn(`Image not found: ${inputPath}`);
        continue;
      }
      
      const safeFilename = getSafeFilename(imgName);
      const imgDir = path.join(outputDir, 'images', splitName);
      const outImgPath = path.join(imgDir, safeFilename);
      
      // Copy image without modification
      await copyImage(inputPath, outImgPath);
      
      // Build annotation entry
      const imgData = annotations[imgName];
      const imageEntry = {
        id: imageId,
        file_name: safeFilename,
        width: imgData.originalSize.width,
        height: imgData.originalSize.height,
        annotations: []
      };
      
      // Add polygon annotations
      for (const segment of imgData.polygons) {
        // Skip segments without valid polygon
        if (!segment.polygon || !Array.isArray(segment.polygon)) {
          console.warn('Skipping segment without polygon');
          continue;
        }
        
        const classId = classMap.get(segment.label) ?? 0;
        
        // Flatten polygon to [x1, y1, x2, y2, ...] format
        const flatPolygon = [];
        for (const point of segment.polygon) {
          flatPolygon.push(Math.round(point.x), Math.round(point.y));
        }
        
        // Calculate bounds from polygon
        const xs = segment.polygon.map(p => p.x);
        const ys = segment.polygon.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        
        const annotationEntry = {
          id: annotationId,
          image_id: imageId,
          category_id: classId,
          category_name: segment.label,
          segmentation: {
            polygon: flatPolygon
          },
          bbox: [minX, minY, maxX - minX, maxY - minY],
          area: segment.bounds ? 
            (segment.bounds.width * segment.bounds.height) : 
            ((maxX - minX) * (maxY - minY)),
          score: segment.score || 1.0,
          point_prompt: segment.clickPoint ? {
            x: segment.clickPoint.x,
            y: segment.clickPoint.y,
            label: 1
          } : null
        };
        
        imageEntry.annotations.push(annotationEntry);
        annotationId++;
      }
      
      splitAnnotations[splitName].push(imageEntry);
      imageId++;
      counts[splitName]++;
    }
  }
  
  // Write annotation JSON files for each split
  for (const [splitName, entries] of Object.entries(splitAnnotations)) {
    if (entries.length === 0) continue;
    
    const jsonPath = path.join(outputDir, `${splitName}_annotations.json`);
    await fs.writeJson(jsonPath, {
      images: entries,
      categories: classList.map((name, id) => ({ id, name }))
    }, { spaces: 2 });
  }
  
  // Write metadata
  const metadata = {
    version: '1.0',
    format: 'sam2',
    created_at: new Date().toISOString(),
    categories: classList.map((name, id) => ({ id, name })),
    splits: {
      train: counts.train,
      val: counts.val,
      test: counts.test
    },
    total_images: counts.train + counts.val + counts.test,
    total_annotations: annotationId
  };
  
  await fs.writeJson(
    path.join(outputDir, 'metadata.json'),
    metadata,
    { spaces: 2 }
  );
  
  console.log(`SAM2 Export: Train=${counts.train}, Val=${counts.val}, Test=${counts.test}`);
  
  // Create ZIP
  const zip = new AdmZip();
  zip.addLocalFolder(outputDir);
  
  return zip.toBuffer();
}

/**
 * Generate validation preview with bboxes/polygons drawn on image
 */
async function generateValidationPreview(inputPath, annotations, config) {
  const { targetSize = 640, filters = {}, exportFormat = 'yolo' } = config;
  
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
  
  // For SAM2, use original size; for YOLO, letterbox
  let previewSize = origSize;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  
  if (exportFormat !== 'sam2' && targetSize) {
    pipeline = pipeline.resize({
      width: targetSize,
      height: targetSize,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0 }
    });
    previewSize = { width: targetSize, height: targetSize };
    ({ scale, offsetX, offsetY } = getLetterboxParams(origSize.width, origSize.height, targetSize));
  }
  
  const imageBuffer = await pipeline.png().toBuffer();
  
  // Create SVG overlay
  let svgContent = '';
  
  // Draw boxes
  const boxes = annotations.boxes || [];
  svgContent += boxes.map(box => {
    const x = Math.round(box.x * scale + offsetX);
    const y = Math.round(box.y * scale + offsetY);
    const w = Math.round(box.width * scale);
    const h = Math.round(box.height * scale);
    const label = (box.label || '').replace(/[<>&'"]/g, '');
    
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" 
            fill="none" stroke="#00ff00" stroke-width="2"/>
            <text x="${x}" y="${y - 5}" fill="#00ff00" font-size="14" font-family="Arial">${label}</text>`;
  }).join('');
  
  // Draw polygons
  const polygons = annotations.polygons || [];
  svgContent += polygons.map(segment => {
    if (!segment.polygon || segment.polygon.length < 3) return '';
    
    const points = segment.polygon.map(p => {
      const x = Math.round(p.x * scale + offsetX);
      const y = Math.round(p.y * scale + offsetY);
      return `${x},${y}`;
    }).join(' ');
    
    const label = (segment.label || '').replace(/[<>&'"]/g, '');
    const firstPoint = segment.polygon[0];
    const labelX = Math.round(firstPoint.x * scale + offsetX);
    const labelY = Math.round(firstPoint.y * scale + offsetY);
    
    return `<polygon points="${points}" 
            fill="rgba(0,255,0,0.2)" stroke="#00ff00" stroke-width="2"/>
            <text x="${labelX}" y="${labelY - 5}" fill="#00ff00" font-size="14" font-family="Arial">${label}</text>`;
  }).join('');
  
  const svgOverlay = Buffer.from(`
    <svg width="${previewSize.width}" height="${previewSize.height}">
      ${svgContent}
    </svg>
  `);
  
  const result = await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
  
  return result;
}

module.exports = {
  batchExport,
  batchExportYOLO,
  batchExportSAM2,
  generateValidationPreview,
  MODEL_PRESETS,
  getLetterboxParams,
  bboxToYolo,
  splitDataset
};