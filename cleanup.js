const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * Utility script para mantenimiento de la aplicación
 * Uso: node utils/cleanup.js
 */

const uploadsDir = path.join(__dirname, '../uploads');
const chunksDir = path.join(__dirname, '../chunks');

async function cleanupOldFiles(directory, ageInHours = 24) {
  try {
    const now = Date.now();
    const ageInMs = ageInHours * 60 * 60 * 1000;

    const files = await fs.readdir(directory, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(directory, file.name);
      const stats = await fs.stat(filePath);

      if (now - stats.mtimeMs > ageInMs) {
        if (file.isDirectory()) {
          console.log(`Eliminando directorio: ${file.name}`);
          await fs.rm(filePath, { recursive: true, force: true });
        } else {
          console.log(`Eliminando archivo: ${file.name}`);
          await fs.unlink(filePath);
        }
      }
    }

    console.log(`✓ Limpieza completada en ${directory}`);
  } catch (error) {
    console.error(`Error limpiando ${directory}:`, error.message);
  }
}

async function getStorageUsage(directory) {
  try {
    const result = execSync(`du -sh "${directory}"`, { encoding: 'utf8' });
    return result.trim().split('\t')[0];
  } catch {
    return 'N/A';
  }
}

async function main() {
  console.log('🧹 Audio Splitter - Cleanup Utility\n');

  // Crear directorios si no existen
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(chunksDir, { recursive: true });

  console.log('📊 Estado actual del almacenamiento:');
  console.log(`  Uploads: ${await getStorageUsage(uploadsDir)}`);
  console.log(`  Chunks: ${await getStorageUsage(chunksDir)}\n`);

  console.log('🧹 Limpiando archivos antiguos (>24 horas)...\n');

  await cleanupOldFiles(uploadsDir, 24);
  await cleanupOldFiles(chunksDir, 24);

  console.log('\n✅ Limpieza completada');
  console.log('📊 Almacenamiento después:');
  console.log(`  Uploads: ${await getStorageUsage(uploadsDir)}`);
  console.log(`  Chunks: ${await getStorageUsage(chunksDir)}`);
}

main().catch(console.error);
