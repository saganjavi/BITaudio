// Variables
let selectedFile = null;

// Elementos del DOM
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileStatus = document.getElementById('fileStatus');
const submitBtn = document.getElementById('submitBtn');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');
const uploadSection = document.querySelector('.upload-section');

// Event listeners para carga de archivo
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', handleDragOver);
dropZone.addEventListener('dragleave', handleDragLeave);
dropZone.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
submitBtn.addEventListener('click', handleSubmit);
document.getElementById('copyBtn')?.addEventListener('click', copyTranscription);
document.getElementById('downloadBtn')?.addEventListener('click', downloadTranscription);
document.getElementById('resetBtn')?.addEventListener('click', resetForm);
document.getElementById('errorResetBtn')?.addEventListener('click', resetForm);

// Funciones de drag and drop
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    selectedFile = files[0];
    displayFileInfo();
  }
}

function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    selectedFile = e.target.files[0];
    displayFileInfo();
  }
}

function displayFileInfo() {
  if (!selectedFile) return;

  const fileSizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
  
  fileName.textContent = selectedFile.name;
  fileSize.textContent = `${fileSizeMB} MB`;
  fileStatus.textContent = 'Listo para procesar';
  fileInfo.style.display = 'block';
  submitBtn.disabled = false;
}

async function handleSubmit() {
  if (!selectedFile) {
    alert('Por favor selecciona un archivo');
    return;
  }

  submitBtn.disabled = true;
  uploadSection.style.display = 'none';
  progressSection.style.display = 'block';
  resultsSection.style.display = 'none';
  errorSection.style.display = 'none';

  const formData = new FormData();
  formData.append('audio', selectedFile);

  try {
    console.log('Iniciando upload del archivo:', selectedFile.name);
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    console.log('Upload iniciado, esperando stream...');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lineCount = 0;

    while (true) {
      try {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream completado. Total de updates:', lineCount);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Mantener la última línea incompleta en el buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              lineCount++;
              console.log(`[${lineCount}] Update recibido:`, data.status, data.message);
              handleProgressUpdate(data);
            } catch (e) {
              console.error('Error parsing JSON:', line, e);
            }
          }
        }
      } catch (readError) {
        console.error('Error reading stream:', readError);
        throw readError;
      }
    }
  } catch (error) {
    console.error('Error completo:', error);
    showError('Error procesando el archivo: ' + error.message);
  } finally {
    submitBtn.disabled = false;
  }
}

function handleProgressUpdate(data) {
  console.log('Procesando actualización:', data.status);
  
  switch (data.status) {
    case 'splitting':
      updateSplittingProgress(data);
      break;
    case 'split_complete':
      updateSplitComplete(data);
      break;
    case 'transcribing':
      updateTranscribingProgress(data);
      break;
    case 'complete':
      showResults(data);
      break;
    case 'error':
      showError(data.message);
      break;
    default:
      console.log('Status desconocido:', data.status);
  }
}

function updateSplittingProgress(data) {
  console.log('Actualizando split progress:', data.message);
  document.getElementById('splitMessage').textContent = data.message;
  document.getElementById('splitProgress').style.width = '50%';
}

function updateSplitComplete(data) {
  console.log('Split completado:', data.chunkCount, 'chunks');
  document.getElementById('splitMessage').textContent = 
    `✓ Audio dividido en ${data.chunkCount} partes`;
  document.getElementById('splitProgress').style.width = '100%';
  document.getElementById('chunksInfo').textContent = 
    `${data.chunkCount} chunks listos para transcribir`;
}

function updateTranscribingProgress(data) {
  const progress = data.progress || 0;
  console.log('Progreso transcripción:', progress + '%');
  document.getElementById('transcribeMessage').textContent = data.message;
  document.getElementById('transcribeProgress').style.width = progress + '%';
  document.getElementById('chunksInfo').textContent = 
    `Progreso: ${progress}%`;
}

function showResults(data) {
  console.log('Mostrando resultados finales');
  progressSection.style.display = 'none';
  resultsSection.style.display = 'block';
  
  document.getElementById('resultChunks').textContent = data.chunkCount;
  const minutes = Math.floor(data.duration / 60);
  const seconds = data.duration % 60;
  document.getElementById('resultDuration').textContent = 
    `${minutes}m ${seconds}s`;
  document.getElementById('transcriptionText').textContent = data.transcription;

  // Guardar transcripción para copiar/descargar
  window.currentTranscription = data.transcription;
  
  console.log('Transcripción guardada:', data.transcription.substring(0, 100) + '...');
}

function showError(message) {
  console.error('Mostrando error:', message);
  progressSection.style.display = 'none';
  errorSection.style.display = 'block';
  document.getElementById('errorMessage').textContent = message;
}

function copyTranscription() {
  if (window.currentTranscription) {
    navigator.clipboard.writeText(window.currentTranscription).then(() => {
      const btn = document.getElementById('copyBtn');
      const originalText = btn.textContent;
      btn.textContent = '✓ Copiado al portapapeles';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  }
}

function downloadTranscription() {
  if (window.currentTranscription) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + 
      encodeURIComponent(window.currentTranscription));
    element.setAttribute('download', 'transcripcion.txt');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
}

function resetForm() {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.style.display = 'none';
  submitBtn.disabled = true;
  progressSection.style.display = 'none';
  resultsSection.style.display = 'none';
  errorSection.style.display = 'none';
  uploadSection.style.display = 'block';
  window.currentTranscription = null;
  
  // Limpiar barras de progreso
  document.getElementById('splitProgress').style.width = '0%';
  document.getElementById('transcribeProgress').style.width = '0%';
}
