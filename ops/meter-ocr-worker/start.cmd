@echo off
cd /d C:\meter-ocr
set OLLAMA_MODELS=C:\meter-ocr\models
set OLLAMA_HOST=127.0.0.1:11434
set OLLAMA_KEEP_ALIVE=30m
rem GTX 750 Ti: CUDA-сборка его не поддерживает, на Vulkan падает CLIP — считаем на CPU
set CUDA_VISIBLE_DEVICES=-1
set GGML_VK_VISIBLE_DEVICES=-1
set OLLAMA_VULKAN=0
start "" /b cmd /c "C:\meter-ocr\ollama\ollama.exe serve >> C:\meter-ocr\logs\ollama.log 2>&1"
C:\meter-ocr\node\node.exe C:\meter-ocr\worker.mjs >> C:\meter-ocr\logs\worker.log 2>&1
