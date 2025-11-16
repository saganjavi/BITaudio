# Guía de Integración - Audio Splitter

Si ya tienes un proyecto de transcripción y quieres integrar el sistema de división de audios, esta guía te ayudará.

## 🔗 Integración modular

### Opción 1: Como un servicio separado

Ejecuta Audio Splitter en un puerto diferente de tu aplicación principal:

```javascript
// En tu aplicación principal
const axios = require('axios');

async function splitAndTranscribe(audioFile) {
  const formData = new FormData();
  formData.append('audio', audioFile);

  try {
    const response = await axios.post(
      'http://localhost:3000/api/transcribe',
      formData,
      { headers: formData.getHeaders() }
    );

    return response.data;
  } catch (error) {
    console.error('Error:', error);
  }
}
```

### Opción 2: Embeber el módulo de división

Extrae la función `splitAudio` en un archivo separado:

```javascript
// modules/audioSplitter.js
const { execAsync } = require('./utils');

async function splitAudioFile(inputPath, chunkSizeMB = 20) {
  // Lógica de división aquí
  return { chunksDir, chunkCount, duration };
}

module.exports = { splitAudioFile };
```

Luego úsalo en tu aplicación:

```javascript
const { splitAudioFile } = require('./modules/audioSplitter');

app.post('/transcribe-large', async (req, res) => {
  const { chunksDir, chunkCount } = await splitAudioFile(req.file.path);
  // Tu lógica de transcripción
});
```

## 🎯 Integración con tu sistema actual

### Paso 1: Detectar archivos grandes

```javascript
const MAX_WHISPER_SIZE = 25 * 1024 * 1024; // 25MB

app.post('/transcribe', async (req, res) => {
  const fileSize = req.file.size;

  if (fileSize > MAX_WHISPER_SIZE) {
    // Usar el splitter
    return await handleLargeAudio(req.file);
  } else {
    // Tu lógica actual
    return await transcribeDirectly(req.file);
  }
});
```

### Paso 2: Adaptador para tu flujo actual

```javascript
async function handleLargeAudio(file) {
  const { chunksDir, chunkCount } = await splitAudioFile(file.path);
  
  const transcriptions = [];
  
  for (let i = 0; i < chunkCount; i++) {
    const chunkPath = path.join(chunksDir, `chunk_${i}.mp3`);
    // Usa tu función de transcripción actual
    const text = await transcribeWithYourCurrentMethod(chunkPath);
    transcriptions.push(text);
  }

  return {
    success: true,
    transcription: transcriptions.join(' '),
    chunkCount,
    method: 'split_and_merge'
  };
}
```

## 💾 Usar con tu base de datos actual

Si guardas transcripciones en base de datos:

```javascript
async function saveTranscription(transcription, metadata) {
  const doc = {
    originalFileName: metadata.fileName,
    fileSize: metadata.fileSize,
    text: transcription.text,
    chunkCount: transcription.chunkCount,
    processingMethod: 'split_and_merge',
    duration: transcription.duration,
    createdAt: new Date(),
    userId: metadata.userId
  };

  // Guardar en tu DB
  await db.transcriptions.insertOne(doc);
  
  return doc._id;
}
```

## 🚀 Ejemplo de integración completa

```javascript
// routes/transcriptions.js
const express = require('express');
const router = express.Router();
const { splitAudioFile } = require('../modules/audioSplitter');
const { transcribeChunk } = require('../modules/whisper');

const MAX_FILE_SIZE = 25 * 1024 * 1024;

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;

    // Verificar tamaño
    const useLargeFileHandler = file.size > MAX_FILE_SIZE;

    if (useLargeFileHandler) {
      return await handleLargeFile(file, userId, res);
    } else {
      return await handleSmallFile(file, userId, res);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function handleLargeFile(file, userId, res) {
  // Stream progress updates
  res.setHeader('Content-Type', 'application/json');

  try {
    // Dividir
    res.write(JSON.stringify({
      status: 'splitting',
      message: 'Dividiendo audio...'
    }) + '\n');

    const { chunksDir, chunkCount, duration } = await splitAudioFile(file.path);

    res.write(JSON.stringify({
      status: 'split_complete',
      chunkCount
    }) + '\n');

    // Transcribir
    const transcriptions = [];

    for (let i = 0; i < chunkCount; i++) {
      res.write(JSON.stringify({
        status: 'transcribing',
        progress: Math.round(((i + 1) / chunkCount) * 100)
      }) + '\n');

      const chunkPath = path.join(chunksDir, `chunk_${i}.mp3`);
      const text = await transcribeChunk(chunkPath);
      transcriptions.push(text);
    }

    const fullText = transcriptions.join(' ');

    // Guardar en DB
    const transcription = await db.transcriptions.create({
      userId,
      fileName: file.originalname,
      fileSize: file.size,
      text: fullText,
      chunkCount,
      duration,
      method: 'split_and_merge',
      createdAt: new Date()
    });

    res.write(JSON.stringify({
      status: 'complete',
      transcriptionId: transcription._id,
      chunkCount,
      duration
    }) + '\n');

    res.end();
  } catch (error) {
    res.write(JSON.stringify({
      status: 'error',
      message: error.message
    }) + '\n');
    res.end();
  }
}

async function handleSmallFile(file, userId, res) {
  // Tu lógica actual
  const text = await transcribeChunk(file.path);

  const transcription = await db.transcriptions.create({
    userId,
    fileName: file.originalname,
    text,
    method: 'direct',
    createdAt: new Date()
  });

  res.json({
    success: true,
    transcriptionId: transcription._id,
    text
  });
}

module.exports = router;
```

## 📊 Monitoreo

Agrega logs para monitorear el desempeño:

```javascript
// middleware/logging.js
function logAudioProcessing(data) {
  console.log({
    timestamp: new Date(),
    fileName: data.fileName,
    fileSize: data.fileSize,
    method: data.method,
    chunkCount: data.chunkCount,
    duration: data.duration,
    totalTime: data.totalTime
  });

  // Guardar en log file o servicio de monitoring
}
```

## 🔄 Fallback y reintentos

```javascript
async function transcribeWithRetry(chunkPath, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await transcribeChunk(chunkPath);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      console.log(`Intento ${attempt} fallido, reintentando...`);
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}
```

## 💡 Tips para tu caso específico (Air Horizon)

Si usas esto para cálculos de costos de vuelos:

```javascript
// Integrar con proposal system
async function processProposalAudio(audioFile, proposalId) {
  const transcription = await handleAudioFile(audioFile);

  // Extraer información relevante
  const flightDetails = await extractFlightInfo(transcription.text);

  // Calcular costos
  const costs = await calculateFlightCosts(flightDetails);

  // Actualizar propuesta
  await updateProposal(proposalId, {
    audioTranscription: transcription.text,
    extractedDetails: flightDetails,
    costs: costs,
    processedAt: new Date()
  });

  return costs;
}
```

---

¿Necesitas ayuda con la integración específica? Déjame saber tu arquitectura actual.
