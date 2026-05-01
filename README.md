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

### Fallback automatico de modelos Groq

El backend implementa una cadena ordenada de modelos para evitar fallos por limites (rate limit / quota).
Si un modelo responde con error de limite, se reintenta y luego se avanza automaticamente al siguiente modelo.

Variables opcionales:

```env
# Cadena ordenada de modelos (coma-separado)
GROQ_MODEL_CHAIN=allam-2-7b,groq/compound,groq/compound-mini,llama-3.1-8b-instant,llama-3.3-70b-versatile,meta-llama/llama-4-scout-17b-16e-instruct,meta-llama/llama-prompt-guard-2-22m,meta-llama/llama-prompt-guard-2-86m,openai/gpt-oss-120b,openai/gpt-oss-20b,openai/gpt-oss-safeguard-20b,qwen/qwen3-32b

# Modelos preferidos por servicio (punto de inicio en la cadena)
GROQ_FAST_MODEL=llama-3.1-8b-instant
GROQ_QUALITY_MODEL=llama-3.3-70b-versatile

# Reintentos por modelo antes de pasar al siguiente en errores de limite
GROQ_RATE_LIMIT_RETRIES_PER_MODEL=2
```

Importante: el fallback en cadena solo se activa para errores de limite. Errores de validacion/payload siguen devolviendose de inmediato.

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
- Body: file (archivo PDF o TXT)

**Response:**

```json
{
  "question": "Pregunta generada",
  "answer": "Respuesta correcta",
  "options": ["Opción 1", "Opción 2", "Opción 3"]
}
```

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
