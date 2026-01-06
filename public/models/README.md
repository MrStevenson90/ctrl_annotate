# SAM 2 ONNX Models

This directory should contain the SAM 2 ONNX model files:

- `sam2_encoder.onnx` - Image encoder model
- `sam2_decoder.onnx` - Mask decoder model

## How to Get the Models

1. Visit Hugging Face and search for "SAM 2 ONNX"
2. Download the `tiny` or `small` variant for best performance
3. Place both files in this directory

## Recommended Models

- **sam2_hiera_tiny** - Smallest, fastest (~40MB each)
- **sam2_hiera_small** - Balance of speed and accuracy (~90MB each)
- **sam2_hiera_base** - Higher accuracy (~200MB each)

## File Naming

The app expects exactly these filenames:
```
sam2_encoder.onnx
sam2_decoder.onnx
```

If your downloaded files have different names, rename them accordingly.

## Troubleshooting

If SAM shows "Models not found":
1. Verify both files exist in this directory
2. Check file sizes (should be >10MB each)
3. Ensure filenames are exact (case-sensitive)
4. Restart the application after adding files
