# CTRL Annotate (Desktop App) v1.2

A desktop image annotation tool for YOLO object detection and **SAM2 segmentation** models with **polygon export**, **group selection**, and **Train/Val/Test split** support.

DOWNLOAD: https://github.com/MrStevenson90/ctrl_annotate/releases
WEBSITE: https://ctrl-annotate.netlify.app/

## What's New in v1.2

### ✨ SAM2 Polygon Export
- **Dual export formats** - Choose between YOLO (bounding boxes) or SAM2 (polygons)
- **Automatic polygon extraction** - Click to generate precise segmentation masks
- **JSON export** - SAM2 format exports polygon coordinates with metadata

### 🎯 Group Selection Mode
- **Multi-point prompts** - Shift+Click to select multiple parts of the same object
- **Combine regions** - Click on head, torso, legs → merged into one polygon
- **Live preview** - See combined mask preview as you add points
- **Enter to confirm** - Finalize grouped selection, Esc to cancel

### 🚀 Improved SAM Performance
- **WebGPU acceleration** - Automatic GPU detection with fallback chain
- **fp16/fp32/WASM** - Tries fastest option, falls back gracefully
- **~2 second embedding** - Fast image processing with HuggingFace Transformers.js

## Features

### Core Annotation
- **Bounding Box Tool** - Click and drag to create annotations
- **Magic Select Tool** - SAM2 powered one-click segmentation
- **Group Selection** - Combine multiple clicks into one polygon (Shift+Click)
- **Class Management** - Add/remove classes with color coding
- **Zoom & Pan** - Navigate large images with ease
- **Undo/Redo** - Full history support (Ctrl+Z / Ctrl+Y)

### Export Options
- **YOLO Format** - Normalized bounding boxes for YOLOv5/v8/v11
- **SAM2 Format** - Polygon coordinates in JSON for segmentation training
- **Train/Val/Test Split** - Configurable three-way ratio
- **Validation Preview** - See annotations on letterboxed export

### File Management
- **Native Folder Selection** - Click to browse and select image folders
- **Subdirectory Support** - Scans subfolders for images automatically
- **Auto-Save** - Never lose your work
- **Native Save Dialog** - Choose where to save your ZIP

## Installation

```bash
cd ctrl-annotate

# Install dependencies
npm install

# Start the app
npm start
```

## SAM2 Setup

The Magic Select tool uses HuggingFace Transformers.js and downloads models automatically on first use.

**Supported backends:**
1. **WebGPU + fp16** - Fastest (requires compatible GPU)
2. **WebGPU + fp32** - Fast fallback
3. **WASM** - Universal compatibility

The app automatically detects and uses the best available option.

**Model used:** `Xenova/sam-vit-base` (~375MB, downloaded once and cached)

## Building Executables

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win     # Windows (.exe)
npm run build:mac     # macOS (.dmg)
npm run build:linux   # Linux (.AppImage)
```

Built files will be in the `dist/` folder.

## Usage

### Basic Workflow
1. **Click "Select Folder"** - Choose a folder containing images
2. **Select Export Format** - Choose YOLO or SAM2 from dropdown
3. **Add Classes** - Type class names and press Enter or click +
4. **Draw Annotations**:
   - **BBox mode**: Click and drag
   - **Magic mode**: Single click for auto-segmentation
5. **Navigate** - Use arrow keys or buttons to move between images
6. **Export** - Click "Export ZIP" to save your dataset

### Group Selection (SAM2 only)
1. Select **SAM2** format from the dropdown
2. Click **Group** button in SAM panel
3. **Shift+Click** on different parts of the same object
4. Green dots show your click points
5. Dashed preview shows combined mask
6. Press **Enter** to confirm the grouped polygon
7. Press **Esc** to cancel

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `B` | Bounding Box tool |
| `M` | Magic Select (SAM2) |
| `Space` (hold) | Pan mode |
| `Scroll` | Zoom in/out |
| `←` `→` | Previous/Next image |
| `Delete` | Remove selected annotation |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Shift+Click` | Add point to group (Group mode) |
| `Enter` | Finalize group selection |
| `Escape` | Cancel group / Close modal |

## Export Formats

### YOLO Format
```
dataset.zip/
├── data.yaml          # YOLO config
├── images/
│   ├── train/         # Training images (letterboxed)
│   ├── val/           # Validation images
│   └── test/          # Test images
└── labels/
    ├── train/         # Training labels (.txt)
    ├── val/           # Validation labels
    └── test/          # Test labels
```

**Label Format:**
```
class_id x_center y_center width height
```
All values normalized 0.0 - 1.0

### SAM2 Format
```
dataset.zip/
├── metadata.json           # Dataset info
├── train_annotations.json  # Training polygons
├── val_annotations.json    # Validation polygons
├── test_annotations.json   # Test polygons
└── images/
    ├── train/              # Original images (not resized)
    ├── val/
    └── test/
```

**Annotation JSON Structure:**
```json
{
  "images": [
    {
      "id": 0,
      "file_name": "image001.jpg",
      "width": 1024,
      "height": 768,
      "annotations": [
        {
          "id": 0,
          "category_id": 0,
          "category_name": "person",
          "segmentation": {
            "polygon": [x1, y1, x2, y2, ...]
          },
          "bbox": [x, y, width, height],
          "score": 0.95,
          "point_prompt": { "x": 512, "y": 384, "label": 1 }
        }
      ]
    }
  ],
  "categories": [
    { "id": 0, "name": "person" }
  ]
}
```

## Project Structure

```
/ctrl-annotate
├── main.js             # Electron main process
├── preload.js          # IPC bridge
├── processor.js        # Image processing + YOLO/SAM2 export
├── package.json
└── /public
    ├── index.html
    ├── /css/styles.css
    └── /js
        ├── app.js      # Main initialization
        ├── state.js    # Global state + group mode
        ├── canvas.js   # Fabric.js controller
        ├── sam.js      # SAM2 via Transformers.js
        ├── bbox.js     # BBox + Magic + Group tools
        ├── classes.js  # Class manager
        ├── history.js  # Undo/redo
        ├── gallery.js  # Gallery view
        ├── validator.js
        └── exporter.js
```

## Tech Stack

- **Desktop Framework:** Electron
- **Image Processing:** Sharp
- **Canvas:** Fabric.js
- **AI/ML:** HuggingFace Transformers.js (SAM2)
- **Inference:** WebGPU / WASM via ONNX Runtime
- **Build:** electron-builder

## Requirements

- Node.js 18+
- npm 9+
- Modern browser engine (Chromium 113+ for WebGPU)
- 4GB RAM minimum (8GB recommended for large images)

## Troubleshooting

### SAM2 Not Loading
- Check console for specific error messages
- Ensure internet connection for first model download
- Try refreshing - models are cached after first download

### WebGPU Not Available
- App automatically falls back to WASM
- Performance will be slower but functional
- Check `chrome://gpu` for GPU status

### Export Issues
- Verify at least one image has annotations
- For SAM2: Ensure polygons exist (not just boxes)
- Check disk space for ZIP creation

### Group Mode Not Working
- Ensure SAM2 format is selected (not YOLO)
- Click "Group" button to enable
- Hold Shift while clicking

## License

MIT

## Changelog

### v1.2.0
- Added SAM2 polygon export format
- Added Group selection mode (Shift+Click to combine)
- Multi-point SAM prompts for better segmentation
- Switched to HuggingFace Transformers.js 3.0
- WebGPU + fp16/fp32/WASM fallback chain
- Improved embedding speed (~2 seconds)
- Added Individual/Group toggle in UI

### v1.1.0
- Added SAM 2 Magic Select tool with ONNX Runtime Web
- Added Train/Val/Test three-way split configuration
- Updated export to support test set
- Improved UI with status indicators
- Added keyboard shortcut `M` for Magic tool

### v1.0.0
- Initial release
- YOLO annotation with bounding boxes
- Train/Val split export
- Filter pipeline
- Gallery view