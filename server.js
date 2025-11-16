require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const FormData = require('form-data');
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');

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
    // Formato: YYYYMMDD_nombrearchivo.ext
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    // Obtener nombre sin extensión y extensión
    const ext = path.extname(file.originalname);
    const nameWithoutExt = path.basename(file.originalname, ext);

    const newFilename = `${datePrefix}_${nameWithoutExt}${ext}`;
    cb(null, newFilename);
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
  const dirs = ['uploads', 'chunks', 'transcripciones'];
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

// Función para generar PDF de transcripción
async function generateTranscriptionPDF(transcription, originalFilename) {
  return new Promise((resolve, reject) => {
    try {
      // Obtener nombre base sin extensión
      const baseName = path.basename(originalFilename, path.extname(originalFilename));
      const pdfFilename = `${baseName}.pdf`;
      const pdfPath = path.join(__dirname, 'transcripciones', pdfFilename);

      // Crear documento PDF
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      });

      // Stream para guardar el archivo
      const stream = require('fs').createWriteStream(pdfPath);

      doc.pipe(stream);

      // Título
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text('Transcripción de Audio', { align: 'center' });

      doc.moveDown(0.5);

      // Información del archivo
      doc.fontSize(12)
         .font('Helvetica')
         .text(`Archivo: ${originalFilename}`, { align: 'center' });

      doc.fontSize(10)
         .fillColor('#666666')
         .text(`Fecha: ${new Date().toLocaleString('es-ES')}`, { align: 'center' });

      doc.moveDown(1.5);

      // Línea separadora
      doc.strokeColor('#cccccc')
         .lineWidth(1)
         .moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke();

      doc.moveDown(1);

      // Contenido de la transcripción
      doc.fontSize(11)
         .fillColor('#000000')
         .font('Helvetica')
         .text(transcription, {
           align: 'justify',
           lineGap: 5
         });

      // Pie de página
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(9)
           .fillColor('#999999')
           .text(
             `Página ${i + 1} de ${pageCount}`,
             50,
             doc.page.height - 50,
             { align: 'center' }
           );
      }

      // Finalizar documento
      doc.end();

      stream.on('finish', () => {
        console.log(`PDF generado: ${pdfFilename}`);
        resolve(pdfFilename);
      });

      stream.on('error', reject);

    } catch (error) {
      reject(error);
    }
  });
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
  // Usar el nombre del archivo (sin extensión) para la carpeta de chunks
  // El archivo ya tiene formato YYYYMMDD_nombrearchivo.ext
  const fileBaseName = path.basename(req.file.filename, path.extname(req.file.filename));
  const chunksDir = path.join(__dirname, 'chunks', fileBaseName);

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

    // Generar PDF de la transcripción
    let pdfFilename = null;
    try {
      // Usar req.file.filename que ya tiene formato YYYYMMDD_nombrearchivo.ext
      pdfFilename = await generateTranscriptionPDF(fullTranscription, req.file.filename);
    } catch (pdfError) {
      console.error('Error generando PDF:', pdfError);
    }

    res.write(JSON.stringify({
      status: 'complete',
      transcription: fullTranscription,
      chunkCount: chunks.length,
      duration: 0, // Aquí podrías calcular la duración real
      pdfFilename: pdfFilename,
      message: 'Transcripción completada'
    }) + '\n');

    res.end();

    // Los chunks se mantienen para gestión manual
    // Pueden eliminarse desde la interfaz de gestión en /manage.html
    console.log(`Carpeta de chunks creada: ${chunksDir}`);

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

// ========== ENDPOINTS DE GESTIÓN DE CHUNKS ==========

// Listar carpetas de chunks
app.get('/api/chunks', async (req, res) => {
  try {
    const chunksDir = path.join(__dirname, 'chunks');

    // Asegurar que el directorio existe
    await fs.mkdir(chunksDir, { recursive: true });

    const folders = await fs.readdir(chunksDir);
    const folderDetails = await Promise.all(
      folders.map(async (foldername) => {
        const folderPath = path.join(chunksDir, foldername);
        const stats = await fs.stat(folderPath);

        // Solo incluir directorios
        if (!stats.isDirectory()) {
          return null;
        }

        // Contar archivos en la carpeta
        const files = await fs.readdir(folderPath);
        const chunkFiles = files.filter(f => f.startsWith('chunk_'));

        // Calcular tamaño total de la carpeta
        let totalSize = 0;
        for (const file of files) {
          const filePath = path.join(folderPath, file);
          const fileStats = await fs.stat(filePath);
          totalSize += fileStats.size;
        }

        return {
          name: foldername,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          chunkCount: chunkFiles.length,
          totalSize: totalSize,
          totalSizeFormatted: formatBytes(totalSize),
          path: folderPath
        };
      })
    );

    // Filtrar nulls y ordenar por fecha de modificación
    const validFolders = folderDetails.filter(f => f !== null);
    validFolders.sort((a, b) => b.modifiedAt - a.modifiedAt);

    res.json({
      success: true,
      count: validFolders.length,
      folders: validFolders
    });
  } catch (error) {
    console.error('Error listando carpetas de chunks:', error);
    res.status(500).json({
      success: false,
      error: 'Error listando carpetas de chunks: ' + error.message
    });
  }
});

// Listar archivos dentro de una carpeta de chunks
app.get('/api/chunks/:foldername', async (req, res) => {
  try {
    const foldername = req.params.foldername;

    // Validar que el foldername no contenga caracteres peligrosos
    if (foldername.includes('..') || foldername.includes('/') || foldername.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de carpeta inválido'
      });
    }

    const folderPath = path.join(__dirname, 'chunks', foldername);

    // Verificar que la carpeta existe
    try {
      const stats = await fs.stat(folderPath);
      if (!stats.isDirectory()) {
        return res.status(404).json({
          success: false,
          error: 'No es una carpeta válida'
        });
      }
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Carpeta no encontrada'
      });
    }

    const files = await fs.readdir(folderPath);
    const fileDetails = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(folderPath, filename);
        const stats = await fs.stat(filePath);

        return {
          name: filename,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
    );

    res.json({
      success: true,
      folder: foldername,
      count: fileDetails.length,
      files: fileDetails
    });
  } catch (error) {
    console.error('Error listando archivos de chunks:', error);
    res.status(500).json({
      success: false,
      error: 'Error listando archivos: ' + error.message
    });
  }
});

// Descargar un chunk específico
app.get('/api/chunks/:foldername/:filename', async (req, res) => {
  try {
    const { foldername, filename } = req.params;

    // Validar que no contengan caracteres peligrosos
    if (foldername.includes('..') || foldername.includes('/') || foldername.includes('\\') ||
        filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Nombre inválido'
      });
    }

    const filePath = path.join(__dirname, 'chunks', foldername, filename);

    // Verificar que el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Archivo no encontrado'
      });
    }

    // Enviar el archivo para descarga
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error descargando archivo:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Error descargando archivo'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error en descarga:', error);
    res.status(500).json({
      success: false,
      error: 'Error descargando archivo: ' + error.message
    });
  }
});

// Eliminar una carpeta de chunks completa
app.delete('/api/chunks/:foldername', async (req, res) => {
  try {
    const foldername = req.params.foldername;

    // Validar que el foldername no contenga caracteres peligrosos
    if (foldername.includes('..') || foldername.includes('/') || foldername.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de carpeta inválido'
      });
    }

    const folderPath = path.join(__dirname, 'chunks', foldername);

    // Verificar que la carpeta existe
    try {
      await fs.access(folderPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Carpeta no encontrada'
      });
    }

    // Eliminar la carpeta y todo su contenido
    await fs.rm(folderPath, { recursive: true, force: true });

    console.log(`Carpeta de chunks eliminada: ${foldername}`);

    res.json({
      success: true,
      message: `Carpeta ${foldername} eliminada correctamente`
    });
  } catch (error) {
    console.error('Error eliminando carpeta de chunks:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando carpeta: ' + error.message
    });
  }
});

// Eliminar todas las carpetas de chunks
app.delete('/api/chunks', async (req, res) => {
  try {
    const chunksDir = path.join(__dirname, 'chunks');
    const folders = await fs.readdir(chunksDir);

    let deletedCount = 0;
    for (const folder of folders) {
      const folderPath = path.join(chunksDir, folder);
      const stats = await fs.stat(folderPath);

      if (stats.isDirectory()) {
        await fs.rm(folderPath, { recursive: true, force: true });
        deletedCount++;
      }
    }

    console.log(`${deletedCount} carpetas de chunks eliminadas`);

    res.json({
      success: true,
      message: `${deletedCount} carpetas eliminadas correctamente`,
      count: deletedCount
    });
  } catch (error) {
    console.error('Error eliminando carpetas de chunks:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando carpetas: ' + error.message
    });
  }
});

// ========== ENDPOINTS DE GESTIÓN DE TRANSCRIPCIONES ==========

// Listar transcripciones PDF
app.get('/api/transcripciones', async (req, res) => {
  try {
    const transcripcionesDir = path.join(__dirname, 'transcripciones');

    // Asegurar que el directorio existe
    await fs.mkdir(transcripcionesDir, { recursive: true });

    const files = await fs.readdir(transcripcionesDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    const fileDetails = await Promise.all(
      pdfFiles.map(async (filename) => {
        const filePath = path.join(transcripcionesDir, filename);
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
    console.error('Error listando transcripciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error listando transcripciones: ' + error.message
    });
  }
});

// Descargar transcripción PDF
app.get('/api/transcripciones/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;

    // Validar que el filename no contenga caracteres peligrosos y sea PDF
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || !filename.endsWith('.pdf')) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de archivo inválido'
      });
    }

    const filePath = path.join(__dirname, 'transcripciones', filename);

    // Verificar que el archivo existe
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Archivo no encontrado'
      });
    }

    // Enviar el archivo para descarga
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error descargando transcripción:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Error descargando archivo'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error en descarga de transcripción:', error);
    res.status(500).json({
      success: false,
      error: 'Error descargando archivo: ' + error.message
    });
  }
});

// Eliminar transcripción PDF
app.delete('/api/transcripciones/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;

    // Validar que el filename no contenga caracteres peligrosos y sea PDF
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || !filename.endsWith('.pdf')) {
      return res.status(400).json({
        success: false,
        error: 'Nombre de archivo inválido'
      });
    }

    const filePath = path.join(__dirname, 'transcripciones', filename);

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

    console.log(`Transcripción eliminada: ${filename}`);

    res.json({
      success: true,
      message: `Transcripción ${filename} eliminada correctamente`
    });
  } catch (error) {
    console.error('Error eliminando transcripción:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando archivo: ' + error.message
    });
  }
});

// Eliminar todas las transcripciones
app.delete('/api/transcripciones', async (req, res) => {
  try {
    const transcripcionesDir = path.join(__dirname, 'transcripciones');
    const files = await fs.readdir(transcripcionesDir);
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));

    let deletedCount = 0;
    for (const file of pdfFiles) {
      const filePath = path.join(transcripcionesDir, file);
      await fs.unlink(filePath);
      deletedCount++;
    }

    console.log(`${deletedCount} transcripciones eliminadas`);

    res.json({
      success: true,
      message: `${deletedCount} transcripciones eliminadas correctamente`,
      count: deletedCount
    });
  } catch (error) {
    console.error('Error eliminando transcripciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error eliminando transcripciones: ' + error.message
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
