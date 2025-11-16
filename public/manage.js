// Variables globales
let files = [];

// Elementos del DOM
const filesContent = document.getElementById('filesContent');
const refreshBtn = document.getElementById('refreshBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const totalFilesEl = document.getElementById('totalFiles');
const totalSizeEl = document.getElementById('totalSize');

// Event listeners
refreshBtn.addEventListener('click', loadFiles);
deleteAllBtn.addEventListener('click', confirmDeleteAll);

// Cargar archivos al iniciar
loadFiles();

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
