# Backend para FlashCard App

Este es el servidor backend para la aplicación de flashcards que integra Groq AI para generar preguntas basadas en documentos PDF o TXT.

## Arquitectura

El proyecto sigue los principios SOLID y clean code con la siguiente estructura:

```
src/
├── config/          # Configuración de la aplicación
├── controllers/     # Controladores HTTP
├── dtos/           # Data Transfer Objects
├── routes/         # Definición de rutas
├── services/       # Lógica de negocio
└── utils/          # Utilidades
```

## Instalación

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Configurar variables de entorno:
   - Editar `.env` y añadir tu clave API de Groq:
     ```
     GROQ_API_KEY=tu_clave_aqui
     ```

## Uso

### Desarrollo

```bash
npm run dev
```

### Producción

```bash
npm start
```

## Endpoints

### POST /api/generate-flashcard
Sube un archivo PDF o TXT y genera una flashcard basada en su contenido.

**Request:**
- Método: POST
- Content-Type: multipart/form-data
- Body: file (archivo PDF o TXT, máximo 5MB)
- Opcional: text (texto plano adicional)

**Límites:**
- Tamaño máximo de archivo: 5MB
- Longitud máxima de contenido: ~12,000 caracteres (~3,000 tokens)
- Si el contenido excede el límite, se trunca automáticamente

**Response:**
```json
{
  "question": "Pregunta generada",
  "answer": "Respuesta correcta",
  "options": ["Opción 1", "Opción 2", "Opción 3"]
}
```

**Errores comunes:**
- `413 Request Entity Too Large`: Archivo o contenido demasiado grande
- `Tipo de archivo no permitido`: Solo PDF y TXT
- `Archivo demasiado grande`: Excede 5MB

### GET /api/test
Endpoint de prueba para verificar que el servidor está funcionando.

## Principios Aplicados

- **SOLID**: Cada clase tiene una responsabilidad única
- **Clean Code**: Código legible, mantenible y bien estructurado
- **Separación de Concerns**: Lógica de negocio separada de controladores HTTP
- **Dependency Injection**: Servicios inyectados en controladores

## Dependencias

- express: Framework web
- pdf-parse: Para extraer texto de PDFs
- groq-sdk: Cliente para Groq AI
- multer: Para manejar uploads de archivos
- cors: Para manejar CORS
- dotenv: Para variables de entorno
