# YOLO Annotator (Electron Desktop App)

A desktop image annotation tool for YOLO object detection models.

## Features

- **Native Folder Selection** - Click to browse and select image folders
- **Subdirectory Support** - Scans subfolders for images automatically  
- **Bounding Box Tool** - Click and drag to create annotations
- **Class Management** - Add/remove classes with color coding
- **Zoom & Pan** - Navigate large images with ease
- **Undo/Redo** - Full history support (Ctrl+Z / Ctrl+Y)
- **Repeat Annotation** - Copy last box to current image
- **Auto-Save** - Never lose your work
- **Validation Preview** - See boxes on letterboxed export
- **Export Presets** - YOLOv5, v8, v11 with configurable sizes
- **Train/Val Split** - Adjustable ratio slider
- **Filter Pipeline** - Brightness, saturation, blur, grayscale
- **Native Save Dialog** - Choose where to save your ZIP

## Installation

```bash
cd yolo-annotator

# Install dependencies
npm install

# Start the app
npm start
```

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

1. **Click "Select Folder"** - Choose a folder containing images
2. **Add Classes** - Type class names and press Enter or click +
3. **Draw Boxes** - Click and drag on the image
4. **Navigate** - Use arrow keys or buttons to move between images
5. **Validate** - Click "Validate" to preview letterboxed export
6. **Export** - Click "Export ZIP" to save your dataset

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `B` | Bounding Box tool |
| `Space` (hold) | Pan mode |
| `Scroll` | Zoom in/out |
| `←` `→` | Previous/Next image |
| `Delete` | Remove selected box |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Escape` | Close modal |

## Export Format

```
dataset.zip/
├── data.yaml          # YOLO config
├── images/
│   ├── train/         # Training images (letterboxed)
│   └── val/           # Validation images
└── labels/
    ├── train/         # Training labels (.txt)
    └── val/           # Validation labels
```

### Label Format (YOLO)
```
class_id x_center y_center width height
```
All values normalized 0.0 - 1.0

## Project Structure

```
/yolo-annotator
├── main.js             # Electron main process
├── preload.js          # IPC bridge
├── processor.js        # Sharp image processing
├── package.json
└── /public
    ├── index.html
    ├── /css/styles.css
    ├── /js
    │   ├── app.js      # Main initialization
    │   ├── state.js    # Global state
    │   ├── canvas.js   # Fabric.js controller
    │   ├── bbox.js     # Bbox tool
    │   ├── classes.js  # Class manager
    │   ├── history.js  # Undo/redo
    │   ├── gallery.js  # Data page
    │   ├── validator.js
    │   └── exporter.js
    └── /icons
```

## Tech Stack

- **Desktop Framework:** Electron
- **Image Processing:** Sharp
- **Canvas:** Fabric.js
- **Build:** electron-builder

## Requirements

- Node.js 18+
- npm 9+

## License

MIT
