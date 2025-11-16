// Variables globales
let files = [];
let chunkFolders = [];
let transcripciones = [];
let expandedFolders = new Set();

// Elementos del DOM
const filesContent = document.getElementById('filesContent');
const refreshBtn = document.getElementById('refreshBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const totalFilesEl = document.getElementById('totalFiles');
const totalSizeEl = document.getElementById('totalSize');

// Elementos de chunks
const chunksContent = document.getElementById('chunksContent');
const refreshChunksBtn = document.getElementById('refreshChunksBtn');
const deleteAllChunksBtn = document.getElementById('deleteAllChunksBtn');
const totalChunkFoldersEl = document.getElementById('totalChunkFolders');
const totalChunksSizeEl = document.getElementById('totalChunksSize');

// Elementos de transcripciones
const transcripcionesContent = document.getElementById('transcripcionesContent');
const refreshTranscripcionesBtn = document.getElementById('refreshTranscripcionesBtn');
const deleteAllTranscripcionesBtn = document.getElementById('deleteAllTranscripcionesBtn');
const totalTranscripcionesEl = document.getElementById('totalTranscripciones');
const totalTranscripcionesSizeEl = document.getElementById('totalTranscripcionesSize');

// Event listeners
refreshBtn.addEventListener('click', loadFiles);
deleteAllBtn.addEventListener('click', confirmDeleteAll);
refreshChunksBtn.addEventListener('click', loadChunkFolders);
deleteAllChunksBtn.addEventListener('click', confirmDeleteAllChunks);
refreshTranscripcionesBtn.addEventListener('click', loadTranscripciones);
deleteAllTranscripcionesBtn.addEventListener('click', confirmDeleteAllTranscripciones);

// Cargar archivos al iniciar
loadFiles();
loadChunkFolders();
loadTranscripciones();

// Función para cargar archivos desde el servidor
async function loadFiles() {
  try {
    showLoading();

    const response = await fetch('/api/uploads');

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error desconocido');
    }

    files = data.files;
    updateStats();
    renderFiles();

  } catch (error) {
    console.error('Error cargando archivos:', error);
    showError('Error al cargar los archivos: ' + error.message);
  }
}

// Mostrar estado de carga
function showLoading() {
  filesContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Cargando archivos...</p>
    </div>
  `;
}

// Mostrar error
function showError(message) {
  filesContent.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3>Error</h3>
      <p>${message}</p>
      <button class="btn btn-primary" onclick="loadFiles()">Reintentar</button>
    </div>
  `;
}

// Actualizar estadísticas
function updateStats() {
  totalFilesEl.textContent = files.length;

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  totalSizeEl.textContent = formatBytes(totalBytes);
}

// Renderizar tabla de archivos
function renderFiles() {
  if (files.length === 0) {
    filesContent.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
        <h3>No hay archivos</h3>
        <p>No se encontraron archivos en el directorio de uploads.</p>
        <a href="/" class="btn btn-primary">Subir un archivo</a>
      </div>
    `;
    return;
  }

  filesContent.innerHTML = `
    <table class="files-table">
      <thead>
        <tr>
          <th>Nombre del archivo</th>
          <th>Tamaño</th>
          <th>Fecha de subida</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${files.map(file => `
          <tr data-filename="${escapeHtml(file.name)}">
            <td class="file-name">${escapeHtml(file.name)}</td>
            <td class="file-size">${file.sizeFormatted}</td>
            <td class="file-date">${formatDate(file.createdAt)}</td>
            <td>
              <button class="btn-delete" onclick="confirmDelete('${escapeHtml(file.name)}')">
                🗑️ Eliminar
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Confirmar eliminación de un archivo
async function confirmDelete(filename) {
  if (!confirm(`¿Estás seguro de que quieres eliminar el archivo "${filename}"?`)) {
    return;
  }

  await deleteFile(filename);
}

// Eliminar un archivo específico
async function deleteFile(filename) {
  try {
    // Deshabilitar botón de eliminación
    const row = document.querySelector(`tr[data-filename="${filename}"]`);
    if (row) {
      const btn = row.querySelector('.btn-delete');
      btn.disabled = true;
      btn.textContent = '⏳ Eliminando...';
    }

    const response = await fetch(`/api/uploads/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando archivo');
    }

    console.log('Archivo eliminado:', filename);

    // Recargar lista de archivos
    await loadFiles();

    showNotification(`Archivo "${filename}" eliminado correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando archivo:', error);
    showNotification('Error al eliminar el archivo: ' + error.message, 'error');

    // Rehabilitar botón si falla
    const row = document.querySelector(`tr[data-filename="${filename}"]`);
    if (row) {
      const btn = row.querySelector('.btn-delete');
      btn.disabled = false;
      btn.textContent = '🗑️ Eliminar';
    }
  }
}

// Confirmar eliminación de todos los archivos
async function confirmDeleteAll() {
  if (files.length === 0) {
    showNotification('No hay archivos para eliminar', 'info');
    return;
  }

  const confirmed = confirm(
    `¿Estás seguro de que quieres eliminar TODOS los archivos (${files.length} archivos)?\n\n` +
    'Esta acción no se puede deshacer.'
  );

  if (!confirmed) {
    return;
  }

  await deleteAllFiles();
}

// Eliminar todos los archivos
async function deleteAllFiles() {
  try {
    deleteAllBtn.disabled = true;
    deleteAllBtn.textContent = '⏳ Eliminando...';

    const response = await fetch('/api/uploads', {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando archivos');
    }

    console.log('Archivos eliminados:', data.count);

    // Recargar lista de archivos
    await loadFiles();

    showNotification(`${data.count} archivos eliminados correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando archivos:', error);
    showNotification('Error al eliminar los archivos: ' + error.message, 'error');
  } finally {
    deleteAllBtn.disabled = false;
    deleteAllBtn.textContent = '🗑️ Eliminar todos';
  }
}

// Formatear bytes a tamaño legible
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Formatear fecha
function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (days > 0) {
    return `Hace ${days} día${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
  } else {
    return 'Hace un momento';
  }
}

// Escapar HTML para prevenir XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Mostrar notificación
function showNotification(message, type = 'info') {
  // Crear elemento de notificación
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;

  document.body.appendChild(notification);

  // Eliminar después de 3 segundos
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// ========== FUNCIONES DE CHUNKS ==========

// Cargar carpetas de chunks
async function loadChunkFolders() {
  try {
    showChunksLoading();

    const response = await fetch('/api/chunks');

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error desconocido');
    }

    chunkFolders = data.folders;
    updateChunksStats();
    renderChunkFolders();

  } catch (error) {
    console.error('Error cargando carpetas de chunks:', error);
    showChunksError('Error al cargar las carpetas: ' + error.message);
  }
}

// Mostrar estado de carga de chunks
function showChunksLoading() {
  chunksContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Cargando carpetas de chunks...</p>
    </div>
  `;
}

// Mostrar error de chunks
function showChunksError(message) {
  chunksContent.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3>Error</h3>
      <p>${message}</p>
      <button class="btn btn-primary" onclick="loadChunkFolders()">Reintentar</button>
    </div>
  `;
}

// Actualizar estadísticas de chunks
function updateChunksStats() {
  totalChunkFoldersEl.textContent = chunkFolders.length;

  const totalBytes = chunkFolders.reduce((sum, folder) => sum + folder.totalSize, 0);
  totalChunksSizeEl.textContent = formatBytes(totalBytes);
}

// Renderizar tabla de carpetas de chunks
function renderChunkFolders() {
  if (chunkFolders.length === 0) {
    chunksContent.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"></path>
        </svg>
        <h3>No hay carpetas de chunks</h3>
        <p>No se encontraron carpetas de chunks en el servidor.</p>
      </div>
    `;
    return;
  }

  chunksContent.innerHTML = `
    <table class="files-table">
      <thead>
        <tr>
          <th>Carpeta</th>
          <th>Chunks</th>
          <th>Tamaño</th>
          <th>Fecha de creación</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${chunkFolders.map((folder, index) => `
          <tr class="folder-row" data-folder="${escapeHtml(folder.name)}" onclick="toggleFolder('${escapeHtml(folder.name)}')">
            <td class="file-name">
              <div class="folder-name">
                <span class="expand-icon ${expandedFolders.has(folder.name) ? 'expanded' : ''}" id="expand-${index}">▶</span>
                <span class="folder-icon">📁</span>
                <span>${escapeHtml(folder.name)}</span>
              </div>
            </td>
            <td class="file-size">${folder.chunkCount} archivos</td>
            <td class="file-size">${folder.totalSizeFormatted}</td>
            <td class="file-date">${formatDate(folder.createdAt)}</td>
            <td onclick="event.stopPropagation();">
              <button class="btn-delete" onclick="confirmDeleteChunkFolder('${escapeHtml(folder.name)}')">
                🗑️ Eliminar
              </button>
            </td>
          </tr>
          <tr class="chunk-files-row ${expandedFolders.has(folder.name) ? 'visible' : ''}" id="files-${escapeHtml(folder.name)}">
            <td colspan="5" class="chunk-files-cell">
              <div class="chunk-loading">⏳ Cargando archivos...</div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Cargar archivos de carpetas expandidas
  expandedFolders.forEach(folderName => {
    loadChunkFiles(folderName);
  });
}

// Alternar expansión de carpeta
async function toggleFolder(folderName) {
  if (expandedFolders.has(folderName)) {
    expandedFolders.delete(folderName);
  } else {
    expandedFolders.add(folderName);
    await loadChunkFiles(folderName);
  }
  renderChunkFolders();
}

// Cargar archivos de una carpeta de chunks
async function loadChunkFiles(folderName) {
  const filesRow = document.getElementById(`files-${folderName}`);
  if (!filesRow) return;

  const cell = filesRow.querySelector('.chunk-files-cell');
  cell.innerHTML = '<div class="chunk-loading">⏳ Cargando archivos...</div>';

  try {
    const response = await fetch(`/api/chunks/${encodeURIComponent(folderName)}`);

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error desconocido');
    }

    if (data.files.length === 0) {
      cell.innerHTML = '<div class="chunk-loading">Esta carpeta está vacía</div>';
      return;
    }

    // Renderizar lista de archivos
    cell.innerHTML = `
      <ul class="chunk-files-list">
        ${data.files.map(file => `
          <li class="chunk-file-item">
            <div class="chunk-file-info">
              <span class="chunk-file-name">🎵 ${escapeHtml(file.name)}</span>
              <span class="chunk-file-size">${file.sizeFormatted}</span>
            </div>
            <a href="/api/chunks/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}"
               class="btn-download"
               download="${escapeHtml(file.name)}">
              ⬇️ Descargar
            </a>
          </li>
        `).join('')}
      </ul>
    `;

  } catch (error) {
    console.error('Error cargando archivos de chunks:', error);
    cell.innerHTML = `<div class="chunk-loading" style="color: #ef4444;">Error: ${error.message}</div>`;
  }
}

// Confirmar eliminación de carpeta de chunks
async function confirmDeleteChunkFolder(folderName) {
  if (!confirm(`¿Estás seguro de que quieres eliminar la carpeta "${folderName}" y todos sus archivos?`)) {
    return;
  }

  await deleteChunkFolder(folderName);
}

// Eliminar carpeta de chunks
async function deleteChunkFolder(folderName) {
  try {
    const response = await fetch(`/api/chunks/${encodeURIComponent(folderName)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando carpeta');
    }

    console.log('Carpeta eliminada:', folderName);

    // Remover de expandidos si estaba
    expandedFolders.delete(folderName);

    // Recargar lista de carpetas
    await loadChunkFolders();

    showNotification(`Carpeta "${folderName}" eliminada correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando carpeta:', error);
    showNotification('Error al eliminar la carpeta: ' + error.message, 'error');
  }
}

// Confirmar eliminación de todas las carpetas de chunks
async function confirmDeleteAllChunks() {
  if (chunkFolders.length === 0) {
    showNotification('No hay carpetas para eliminar', 'info');
    return;
  }

  const confirmed = confirm(
    `¿Estás seguro de que quieres eliminar TODAS las carpetas de chunks (${chunkFolders.length} carpetas)?\n\n` +
    'Esta acción no se puede deshacer.'
  );

  if (!confirmed) {
    return;
  }

  await deleteAllChunkFolders();
}

// Eliminar todas las carpetas de chunks
async function deleteAllChunkFolders() {
  try {
    deleteAllChunksBtn.disabled = true;
    deleteAllChunksBtn.textContent = '⏳ Eliminando...';

    const response = await fetch('/api/chunks', {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando carpetas');
    }

    console.log('Carpetas eliminadas:', data.count);

    // Limpiar expandidos
    expandedFolders.clear();

    // Recargar lista de carpetas
    await loadChunkFolders();

    showNotification(`${data.count} carpetas eliminadas correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando carpetas:', error);
    showNotification('Error al eliminar las carpetas: ' + error.message, 'error');
  } finally {
    deleteAllChunksBtn.disabled = false;
    deleteAllChunksBtn.textContent = '🗑️ Eliminar todos';
  }
}

// ========== FUNCIONES DE TRANSCRIPCIONES ==========

// Cargar transcripciones PDF
async function loadTranscripciones() {
  try {
    showTranscripcionesLoading();

    const response = await fetch('/api/transcripciones');

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error desconocido');
    }

    transcripciones = data.files;
    updateTranscripcionesStats();
    renderTranscripciones();

  } catch (error) {
    console.error('Error cargando transcripciones:', error);
    showTranscripcionesError('Error al cargar las transcripciones: ' + error.message);
  }
}

// Mostrar estado de carga de transcripciones
function showTranscripcionesLoading() {
  transcripcionesContent.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Cargando transcripciones...</p>
    </div>
  `;
}

// Mostrar error de transcripciones
function showTranscripcionesError(message) {
  transcripcionesContent.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3>Error</h3>
      <p>${message}</p>
      <button class="btn btn-primary" onclick="loadTranscripciones()">Reintentar</button>
    </div>
  `;
}

// Actualizar estadísticas de transcripciones
function updateTranscripcionesStats() {
  totalTranscripcionesEl.textContent = transcripciones.length;

  const totalBytes = transcripciones.reduce((sum, file) => sum + file.size, 0);
  totalTranscripcionesSizeEl.textContent = formatBytes(totalBytes);
}

// Renderizar tabla de transcripciones
function renderTranscripciones() {
  if (transcripciones.length === 0) {
    transcripcionesContent.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
        <h3>No hay transcripciones</h3>
        <p>No se encontraron transcripciones PDF en el servidor.</p>
        <a href="/" class="btn btn-primary">Crear transcripción</a>
      </div>
    `;
    return;
  }

  transcripcionesContent.innerHTML = `
    <table class="files-table">
      <thead>
        <tr>
          <th>Nombre del archivo</th>
          <th>Tamaño</th>
          <th>Fecha de creación</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${transcripciones.map(file => `
          <tr data-filename="${escapeHtml(file.name)}">
            <td class="file-name">📄 ${escapeHtml(file.name)}</td>
            <td class="file-size">${file.sizeFormatted}</td>
            <td class="file-date">${formatDate(file.createdAt)}</td>
            <td>
              <a href="/api/transcripciones/${encodeURIComponent(file.name)}"
                 class="btn-download"
                 download="${escapeHtml(file.name)}"
                 style="margin-right: 0.5rem;">
                ⬇️ Descargar
              </a>
              <button class="btn-delete" onclick="confirmDeleteTranscripcion('${escapeHtml(file.name)}')">
                🗑️ Eliminar
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Confirmar eliminación de transcripción
async function confirmDeleteTranscripcion(filename) {
  if (!confirm(`¿Estás seguro de que quieres eliminar la transcripción "${filename}"?`)) {
    return;
  }

  await deleteTranscripcion(filename);
}

// Eliminar transcripción
async function deleteTranscripcion(filename) {
  try {
    const row = document.querySelector(`tr[data-filename="${filename}"]`);
    if (row) {
      const btn = row.querySelector('.btn-delete');
      btn.disabled = true;
      btn.textContent = '⏳ Eliminando...';
    }

    const response = await fetch(`/api/transcripciones/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando transcripción');
    }

    console.log('Transcripción eliminada:', filename);

    // Recargar lista
    await loadTranscripciones();

    showNotification(`Transcripción "${filename}" eliminada correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando transcripción:', error);
    showNotification('Error al eliminar la transcripción: ' + error.message, 'error');

    const row = document.querySelector(`tr[data-filename="${filename}"]`);
    if (row) {
      const btn = row.querySelector('.btn-delete');
      btn.disabled = false;
      btn.textContent = '🗑️ Eliminar';
    }
  }
}

// Confirmar eliminación de todas las transcripciones
async function confirmDeleteAllTranscripciones() {
  if (transcripciones.length === 0) {
    showNotification('No hay transcripciones para eliminar', 'info');
    return;
  }

  const confirmed = confirm(
    `¿Estás seguro de que quieres eliminar TODAS las transcripciones (${transcripciones.length} archivos)?\n\n` +
    'Esta acción no se puede deshacer.'
  );

  if (!confirmed) {
    return;
  }

  await deleteAllTranscripciones();
}

// Eliminar todas las transcripciones
async function deleteAllTranscripciones() {
  try {
    deleteAllTranscripcionesBtn.disabled = true;
    deleteAllTranscripcionesBtn.textContent = '⏳ Eliminando...';

    const response = await fetch('/api/transcripciones', {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando transcripciones');
    }

    console.log('Transcripciones eliminadas:', data.count);

    // Recargar lista
    await loadTranscripciones();

    showNotification(`${data.count} transcripciones eliminadas correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando transcripciones:', error);
    showNotification('Error al eliminar las transcripciones: ' + error.message, 'error');
  } finally {
    deleteAllTranscripcionesBtn.disabled = false;
    deleteAllTranscripcionesBtn.textContent = '🗑️ Eliminar todos';
  }
}

// Estilos para animaciones
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
