# Audio Splitter & Transcriber

Una webapp completa para dividir archivos de audio grandes (>25MB) y transcribirlos usando Whisper API de OpenAI.

## 🎯 Características

- **Drag & Drop**: Carga archivos fácilmente arrastrando o seleccionando
- **División inteligente de audios**: Divide automáticamente en chunks de 20MB
- **Transcripción con Whisper**: Transcribe cada chunk con la API de OpenAI
- **Interfaz moderna**: UI elegante y responsiva con progreso en tiempo real
- **Copiar y descargar**: Exporta la transcripción al portapapeles o como archivo TXT
- **Streaming de progreso**: Actualización en tiempo real del procesamiento

## 📋 Requisitos previos

- **Node.js** >= 16.0.0
- **ffmpeg** instalado en tu sistema
  - En Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - En macOS: `brew install ffmpeg`
  - En Windows: Descarga desde https://ffmpeg.org/download.html

- **API Key de OpenAI** con acceso a Whisper

## 🚀 Instalación

1. **Clona o descarga el proyecto**:
```bash
cd audio-splitter-transcriber
```

2. **Instala dependencias**:
```bash
npm install
```

3. **Configura variables de entorno**:
Crea un archivo `.env` en la raíz del proyecto:
```bash
OPENAI_API_KEY=tu_api_key_aqui
PORT=3000
```

4. **Verifica que ffmpeg está instalado**:
```bash
ffmpeg -version
ffprobe -version
```

5. **Inicia el servidor**:
```bash
npm start
```

O en desarrollo con nodemon:
```bash
npm run dev
```

6. **Abre en tu navegador**:
```
http://localhost:3000
```

## 📝 Uso

1. **Carga un archivo de audio**:
   - Arrastra un archivo a la zona de drop
   - O haz clic para seleccionar desde tu computadora

2. **Procesa**:
   - Haz clic en "Procesar Audio"
   - El sistema dividirá el archivo en chunks
   - Cada chunk será transcrito con Whisper

3. **Descarga o copia**:
   - Copia la transcripción al portapapeles
   - O descarga como archivo TXT

## 🔧 Configuración avanzada

### Ajustar tamaño de chunks

En `server.js`, línea 33:
```javascript
const CHUNK_SIZE_MB = 20; // Cambia este valor
```

### Cambiar idioma de transcripción

En `server.js`, línea 115:
```javascript
formData.append('language', 'es'); // 'en', 'fr', 'de', etc.
```

### Especificar ruta de ffmpeg

Si tienes problemas con ffmpeg, ajusta el PATH:
```bash
export PATH="/ruta/a/ffmpeg:$PATH"
```

## 📁 Estructura del proyecto

```
audio-splitter-transcriber/
├── server.js              # Backend Express
├── package.json           # Dependencias
├── .env                   # Variables de entorno
├── public/
│   ├── index.html         # Interfaz HTML
│   ├── styles.css         # Estilos
│   ├── app.js             # Lógica del cliente
├── uploads/               # Archivos subidos
├── chunks/                # Chunks de audio (temporal)
└── README.md
```

## 🐛 Troubleshooting

### Error: "ffmpeg not found"
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Verifica la instalación
which ffmpeg
```

### Error: "API key not valid"
- Verifica tu API key de OpenAI en https://platform.openai.com/api-keys
- Asegúrate de que esté configurada en el archivo `.env`

### El audio no se divide correctamente
- Verifica que ffmpeg esté funcionando: `ffmpeg -version`
- Comprueba el formato del audio (MP3, WAV, OGG, etc.)

### Timeout en archivos muy grandes
- Aumenta el timeout en Express:
```javascript
app.use(express.json({ limit: '50mb' }));
```

## 💡 Tips

1. **Optimizar calidad vs tiempo**:
   - Reduce `CHUNK_SIZE_MB` para chunks más pequeños
   - Aumenta para procesamiento más rápido

2. **Formato de audio recomendado**:
   - MP3 funciona mejor para mantener tamaño pequeño
   - WAV para máxima calidad

3. **Costo con API Whisper**:
   - Whisper cobra por minuto de audio
   - Un archivo de 100MB aproximadamente cuesta $0.50-$1.00

## 🔐 Seguridad

- Las claves de API nunca se exponen al cliente
- Los archivos se eliminan después de procesar
- Valida tipos de archivo en el cliente y servidor

## 📦 Dependencias

- **Express**: Framework web
- **Multer**: Manejo de uploads
- **Form-data**: Multipart form data para API
- **Node-fetch**: HTTP client (v2 para compatibilidad)

## 📄 Licencia

MIT

## 🤝 Soporte

Para problemas o sugerencias:
1. Verifica la consola del navegador (F12)
2. Revisa los logs del servidor
3. Verifica que ffmpeg esté instalado correctamente

## 🎨 Personalización de UI

La interfaz es totalmente personalizable en `styles.css`:
- Variables CSS definidas en `:root`
- Cambia colores, tamaños, sombras fácilmente
- Responsive en mobile

```css
:root {
  --primary-color: #6366f1;
  --secondary-color: #8b5cf6;
  /* ... */
}
```

## 🚀 Deploy

### Heroku
```bash
heroku create mi-app
git push heroku main
```

### Railway
Conecta tu repo de GitHub y deploy automático

### DigitalOcean / AWS
Usa PM2 para mantener el proceso activo:
```bash
npm install -g pm2
pm2 start server.js
```

---

¡Disfruta transcribiendo audios grandes sin límites! 🎵
