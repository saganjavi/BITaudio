require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const FormData = require('form-data');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadsDir = path.join(__dirname, 'uploads');
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
    } catch (err) {
      console.error('Error creating uploads directory:', err);
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Asegurar que los directorios existen
async function ensureDirectories() {
  const dirs = ['uploads', 'chunks'];
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`✓ Directorio ${dir}/ listo`);
    } catch (err) {
      console.error(`Error creando directorio ${dir}:`, err);
    }
  }
}

// Función para dividir audio con FFmpeg
async function splitAudio(inputPath, outputDir, res) {
  const chunkSize = 20 * 1024 * 1024; // 20MB
  const stats = await fs.stat(inputPath);
  const fileSize = stats.size;

  if (fileSize <= 25 * 1024 * 1024) {
    // No es necesario dividir
    res.write(JSON.stringify({
      status: 'split_complete',
      chunkCount: 1,
      message: 'Archivo pequeño, no requiere división'
    }) + '\n');
    return [inputPath];
  }

  res.write(JSON.stringify({
    status: 'splitting',
    message: 'Dividiendo archivo de audio...'
  }) + '\n');

  const chunks = [];
  const chunkPattern = path.join(outputDir, 'chunk_%03d.mp3');

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-f', 'segment',
      '-segment_time', '600', // 10 minutos por chunk
      '-c', 'copy',
      '-map', '0',
      chunkPattern
    ]);

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg: ${data}`);
    });

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg falló con código ${code}`));
        return;
      }

      try {
        const files = await fs.readdir(outputDir);
        const chunkFiles = files.filter(f => f.startsWith('chunk_'));

        for (const file of chunkFiles) {
          chunks.push(path.join(outputDir, file));
        }

        res.write(JSON.stringify({
          status: 'split_complete',
          chunkCount: chunks.length,
          message: `Audio dividido en ${chunks.length} partes`
        }) + '\n');

        resolve(chunks);
      } catch (err) {
        reject(err);
      }
    });

    ffmpeg.on('error', reject);
  });
}

// Función para transcribir con Whisper API
async function transcribeChunk(chunkPath) {
  const formData = new FormData();
  formData.append('file', await fs.readFile(chunkPath), {
    filename: path.basename(chunkPath),
    contentType: 'audio/mpeg'
  });
  formData.append('model', 'whisper-1');
  formData.append('language', 'es');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.text;
}

// Endpoint principal de transcripción
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ningún archivo' });
  }

  // Configurar respuesta streaming
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const inputPath = req.file.path;
  const chunksDir = path.join(__dirname, 'chunks', Date.now().toString());

  try {
    await fs.mkdir(chunksDir, { recursive: true });

    // Dividir audio si es necesario
    let chunks;
    try {
      chunks = await splitAudio(inputPath, chunksDir, res);
    } catch (err) {
      console.error('Error en split:', err);
      res.write(JSON.stringify({
        status: 'error',
        message: 'Error dividiendo el audio: ' + err.message
      }) + '\n');
      res.end();
      return;
    }

    // Transcribir cada chunk
    const transcriptions = [];
    for (let i = 0; i < chunks.length; i++) {
      const progress = Math.round(((i + 1) / chunks.length) * 100);

      res.write(JSON.stringify({
        status: 'transcribing',
        progress: progress,
        message: `Transcribiendo parte ${i + 1} de ${chunks.length}...`
      }) + '\n');

      try {
        const text = await transcribeChunk(chunks[i]);
        transcriptions.push(text);
      } catch (err) {
        console.error(`Error transcribiendo chunk ${i}:`, err);
        res.write(JSON.stringify({
          status: 'error',
          message: `Error transcribiendo parte ${i + 1}: ${err.message}`
        }) + '\n');
        res.end();
        return;
      }
    }

    // Resultado final
    const fullTranscription = transcriptions.join(' ');
    res.write(JSON.stringify({
      status: 'complete',
      transcription: fullTranscription,
      chunkCount: chunks.length,
      duration: 0, // Aquí podrías calcular la duración real
      message: 'Transcripción completada'
    }) + '\n');

    res.end();

    // Limpiar chunks temporales
    setTimeout(async () => {
      try {
        await fs.rm(chunksDir, { recursive: true, force: true });
        console.log(`Chunks temporales limpiados: ${chunksDir}`);
      } catch (err) {
        console.error('Error limpiando chunks:', err);
      }
    }, 5000);

  } catch (error) {
    console.error('Error general:', error);
    res.write(JSON.stringify({
      status: 'error',
      message: 'Error procesando el archivo: ' + error.message
    }) + '\n');
    res.end();
  }
});

// ========== ENDPOINTS DE GESTIÓN DE ARCHIVOS ==========

// Listar archivos en uploads/
app.get('/api/uploads', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');

    // Asegurar que el directorio existe
    await fs.mkdir(uploadsDir, { recursive: true });

    const files = await fs.readdir(uploadsDir);
    const fileDetails = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(uploadsDir, filename);
        const stats = await fs.stat(filePath);

        return {
          name: filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          path: filePath
        };
      })
    );

    // Ordenar por fecha de modificación (más recientes primero)
    fileDetails.sort((a, b) => b.modifiedAt - a.modifiedAt);

    res.json({
      success: true,
      count: fileDetails.length,
      files: fileDetails
    });
  } catch (error) {
    console.error('Error listando archivos:', error);
    res.status(500).json({
      success: false,
      error: 'Error listando archivos: ' + error.message
    });
  }
});

// Eliminar archivo específico
app.delete('/api/uploads/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;

    // Validar que el filename no contenga caracteres peligrosos
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de archivo inválido'
      });
    }

    const filePath = path.join(__dirname, 'uploads', filename);

    // Verificar que el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Archivo no encontrado'
      });
    }

    // Eliminar el archivo
    await fs.unlink(filePath);

    console.log(`Archivo eliminado: ${filename}`);

    res.json({
      success: true,
      message: `Archivo ${filename} eliminado correctamente`
    });
  } catch (error) {
    console.error('Error eliminando archivo:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando archivo: ' + error.message
    });
  }
});

// Eliminar todos los archivos
app.delete('/api/uploads', async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = await fs.readdir(uploadsDir);

    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      await fs.unlink(filePath);
      deletedCount++;
    }

    console.log(`${deletedCount} archivos eliminados del directorio uploads/`);

    res.json({
      success: true,
      message: `${deletedCount} archivos eliminados correctamente`,
      count: deletedCount
    });
  } catch (error) {
    console.error('Error eliminando archivos:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando archivos: ' + error.message
    });
  }
});

// Función auxiliar para formatear bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Iniciar servidor
async function startServer() {
  await ensureDirectories();

  app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  Audio Splitter & Transcriber Server      ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  🚀 Servidor corriendo en puerto ${PORT}     ║`);
    console.log(`║  🌐 http://localhost:${PORT}                ║`);
    console.log(`║  📁 Gestión: http://localhost:${PORT}/manage.html ║`);
    console.log('╚════════════════════════════════════════════╝');
  });
}

startServer();
