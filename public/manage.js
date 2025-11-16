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

// ========== FUNCIONES DE ARCHIVOS SUBIDOS ==========

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

function showLoading() {
  filesContent.innerHTML = `
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      <p class="mt-2 text-gray-600">Cargando...</p>
    </div>
  `;
}

function showError(message) {
  filesContent.innerHTML = `
    <div class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3 class="text-lg font-medium text-gray-900 mb-2">Error</h3>
      <p class="text-gray-600 mb-4">${message}</p>
      <button onclick="loadFiles()" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">Reintentar</button>
    </div>
  `;
}

function updateStats() {
  totalFilesEl.textContent = files.length;

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  totalSizeEl.textContent = formatBytes(totalBytes);
}

function renderFiles() {
  if (files.length === 0) {
    filesContent.innerHTML = `
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No hay archivos</h3>
        <p class="text-gray-600 mb-4">No se encontraron archivos en el directorio de uploads.</p>
        <a href="/" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 inline-block">Subir un archivo</a>
      </div>
    `;
    return;
  }

  filesContent.innerHTML = `
    <div class="space-y-2">
      ${files.map(file => `
        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">${escapeHtml(file.name)}</p>
              <div class="flex items-center gap-4 mt-1 text-xs text-gray-500">
                <span>${file.sizeFormatted}</span>
                <span>•</span>
                <span>${formatDate(file.createdAt)}</span>
              </div>
            </div>
            <button onclick="confirmDelete('${escapeHtml(file.name).replace(/'/g, "\\'")}' )" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors whitespace-nowrap">
              🗑️ Eliminar
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function confirmDelete(filename) {
  if (!confirm(`¿Estás seguro de que quieres eliminar el archivo "${filename}"?`)) {
    return;
  }

  await deleteFile(filename);
}

async function deleteFile(filename) {
  try {
    const response = await fetch(`/api/uploads/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando archivo');
    }

    await loadFiles();
    showNotification(`Archivo "${filename}" eliminado correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando archivo:', error);
    showNotification('Error al eliminar el archivo: ' + error.message, 'error');
  }
}

async function confirmDeleteAll() {
  if (files.length === 0) {
    showNotification('No hay archivos para eliminar', 'info');
    return;
  }

  const confirmed = confirm(
    `¿Estás seguro de que quieres eliminar TODOS los archivos (${files.length} archivos)?\n\nEsta acción no se puede deshacer.`
  );

  if (!confirmed) return;

  await deleteAllFiles();
}

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

// ========== FUNCIONES DE CHUNKS ==========

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

function showChunksLoading() {
  chunksContent.innerHTML = `
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      <p class="mt-2 text-gray-600">Cargando...</p>
    </div>
  `;
}

function showChunksError(message) {
  chunksContent.innerHTML = `
    <div class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3 class="text-lg font-medium text-gray-900 mb-2">Error</h3>
      <p class="text-gray-600 mb-4">${message}</p>
      <button onclick="loadChunkFolders()" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">Reintentar</button>
    </div>
  `;
}

function updateChunksStats() {
  totalChunkFoldersEl.textContent = chunkFolders.length;

  const totalBytes = chunkFolders.reduce((sum, folder) => sum + folder.totalSize, 0);
  totalChunksSizeEl.textContent = formatBytes(totalBytes);
}

function renderChunkFolders() {
  if (chunkFolders.length === 0) {
    chunksContent.innerHTML = `
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No hay carpetas de chunks</h3>
        <p class="text-gray-600">No se encontraron carpetas de chunks en el servidor.</p>
      </div>
    `;
    return;
  }

  chunksContent.innerHTML = `
    <div class="space-y-2">
      ${chunkFolders.map((folder, index) => `
        <div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div class="p-4 cursor-pointer hover:bg-gray-50 transition-colors" onclick="toggleFolder('${escapeHtml(folder.name).replace(/'/g, "\\'")}')">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div class="flex-1 min-w-0 flex items-center gap-3">
                <span class="transform transition-transform ${expandedFolders.has(folder.name) ? 'rotate-90' : ''} text-gray-400">▶</span>
                <div class="flex-1">
                  <p class="text-sm font-medium text-gray-900">📁 ${escapeHtml(folder.name)}</p>
                  <div class="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>${folder.chunkCount} archivos</span>
                    <span>•</span>
                    <span>${folder.totalSizeFormatted}</span>
                    <span>•</span>
                    <span>${formatDate(folder.createdAt)}</span>
                  </div>
                </div>
              </div>
              <button onclick="event.stopPropagation(); confirmDeleteChunkFolder('${escapeHtml(folder.name).replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors whitespace-nowrap">
                🗑️ Eliminar
              </button>
            </div>
          </div>
          <div id="files-${folder.name}" class="border-t border-gray-200 bg-gray-50 p-4 ${expandedFolders.has(folder.name) ? '' : 'hidden'}">
            <div class="text-sm text-gray-500">⏳ Cargando archivos...</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Cargar archivos de carpetas expandidas
  expandedFolders.forEach(folderName => {
    loadChunkFiles(folderName);
  });
}

async function toggleFolder(folderName) {
  if (expandedFolders.has(folderName)) {
    expandedFolders.delete(folderName);
  } else {
    expandedFolders.add(folderName);
    await loadChunkFiles(folderName);
  }
  renderChunkFolders();
}

async function loadChunkFiles(folderName) {
  const filesDiv = document.getElementById(`files-${folderName}`);
  if (!filesDiv) return;

  filesDiv.innerHTML = '<div class="text-sm text-gray-500">⏳ Cargando archivos...</div>';

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
      filesDiv.innerHTML = '<div class="text-sm text-gray-500">Esta carpeta está vacía</div>';
      return;
    }

    filesDiv.innerHTML = `
      <div class="space-y-2">
        ${data.files.map(file => `
          <div class="flex items-center justify-between bg-white rounded-md p-3 border border-gray-200">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-mono text-gray-900 truncate">🎵 ${escapeHtml(file.name)}</p>
              <p class="text-xs text-gray-500">${file.sizeFormatted}</p>
            </div>
            <a href="/api/chunks/${encodeURIComponent(folderName)}/${encodeURIComponent(file.name)}"
               download="${escapeHtml(file.name)}"
               class="px-3 py-1.5 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 transition-colors whitespace-nowrap ml-3">
              ⬇️ Descargar
            </a>
          </div>
        `).join('')}
      </div>
    `;

  } catch (error) {
    console.error('Error cargando archivos de chunks:', error);
    filesDiv.innerHTML = `<div class="text-sm text-red-600">Error: ${error.message}</div>`;
  }
}

async function confirmDeleteChunkFolder(folderName) {
  if (!confirm(`¿Estás seguro de que quieres eliminar la carpeta "${folderName}" y todos sus archivos?`)) {
    return;
  }

  await deleteChunkFolder(folderName);
}

async function deleteChunkFolder(folderName) {
  try {
    const response = await fetch(`/api/chunks/${encodeURIComponent(folderName)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando carpeta');
    }

    expandedFolders.delete(folderName);
    await loadChunkFolders();
    showNotification(`Carpeta "${folderName}" eliminada correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando carpeta:', error);
    showNotification('Error al eliminar la carpeta: ' + error.message, 'error');
  }
}

async function confirmDeleteAllChunks() {
  if (chunkFolders.length === 0) {
    showNotification('No hay carpetas para eliminar', 'info');
    return;
  }

  const confirmed = confirm(
    `¿Estás seguro de que quieres eliminar TODAS las carpetas de chunks (${chunkFolders.length} carpetas)?\n\nEsta acción no se puede deshacer.`
  );

  if (!confirmed) return;

  await deleteAllChunkFolders();
}

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

    expandedFolders.clear();
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

function showTranscripcionesLoading() {
  transcripcionesContent.innerHTML = `
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      <p class="mt-2 text-gray-600">Cargando...</p>
    </div>
  `;
}

function showTranscripcionesError(message) {
  transcripcionesContent.innerHTML = `
    <div class="text-center py-12">
      <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <h3 class="text-lg font-medium text-gray-900 mb-2">Error</h3>
      <p class="text-gray-600 mb-4">${message}</p>
      <button onclick="loadTranscripciones()" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">Reintentar</button>
    </div>
  `;
}

function updateTranscripcionesStats() {
  totalTranscripcionesEl.textContent = transcripciones.length;

  const totalBytes = transcripciones.reduce((sum, file) => sum + file.size, 0);
  totalTranscripcionesSizeEl.textContent = formatBytes(totalBytes);
}

function renderTranscripciones() {
  if (transcripciones.length === 0) {
    transcripcionesContent.innerHTML = `
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No hay transcripciones</h3>
        <p class="text-gray-600 mb-4">No se encontraron transcripciones PDF en el servidor.</p>
        <a href="/" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 inline-block">Crear transcripción</a>
      </div>
    `;
    return;
  }

  transcripcionesContent.innerHTML = `
    <div class="space-y-2">
      ${transcripciones.map(file => `
        <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">📄 ${escapeHtml(file.name)}</p>
              <div class="flex items-center gap-4 mt-1 text-xs text-gray-500">
                <span>${file.sizeFormatted}</span>
                <span>•</span>
                <span>${formatDate(file.createdAt)}</span>
              </div>
            </div>
            <div class="flex gap-2">
              <a href="/api/transcripciones/${encodeURIComponent(file.name)}"
                 download="${escapeHtml(file.name)}"
                 class="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors whitespace-nowrap">
                ⬇️ Descargar
              </a>
              <button onclick="confirmDeleteTranscripcion('${escapeHtml(file.name).replace(/'/g, "\\'")}')" class="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors whitespace-nowrap">
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function confirmDeleteTranscripcion(filename) {
  if (!confirm(`¿Estás seguro de que quieres eliminar la transcripción "${filename}"?`)) {
    return;
  }

  await deleteTranscripcion(filename);
}

async function deleteTranscripcion(filename) {
  try {
    const response = await fetch(`/api/transcripciones/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Error eliminando transcripción');
    }

    await loadTranscripciones();
    showNotification(`Transcripción "${filename}" eliminada correctamente`, 'success');

  } catch (error) {
    console.error('Error eliminando transcripción:', error);
    showNotification('Error al eliminar la transcripción: ' + error.message, 'error');
  }
}

async function confirmDeleteAllTranscripciones() {
  if (transcripciones.length === 0) {
    showNotification('No hay transcripciones para eliminar', 'info');
    return;
  }

  const confirmed = confirm(
    `¿Estás seguro de que quieres eliminar TODAS las transcripciones (${transcripciones.length} archivos)?\n\nEsta acción no se puede deshacer.`
  );

  if (!confirmed) return;

  await deleteAllTranscripciones();
}

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

// ========== UTILIDADES ==========

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

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

function showNotification(message, type = 'info') {
  const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';

  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('animate-slide-out');
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// Estilos para animaciones
const style = document.createElement('style');
style.textContent = `
  @keyframes slide-in {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slide-out {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }

  .animate-slide-in {
    animation: slide-in 0.3s ease;
  }

  .animate-slide-out {
    animation: slide-out 0.3s ease;
  }
`;
document.head.appendChild(style);
