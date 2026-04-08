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

### Generación Automática con IA

#### POST /api/generate-flashcard

Sube un archivo PDF o TXT y genera una flashcard basada en su contenido.

**Request:**

- `file` (multipart/form-data): Archivo PDF o TXT
- `text` (opcional): Texto adicional

**Response:**

```json
{
  "question": "¿Cuál es la capital de Francia?",
  "answer": "París",
  "options": ["Londres", "París", "Madrid"]
}
```

#### POST /api/generate-flashcards

Genera múltiples flashcards de un documento.

**Request:**

- `file` (multipart/form-data): Archivo PDF o TXT
- `text` (opcional): Texto adicional
- `quantity`: Número de flashcards (1-20)

**Response:**

```json
[
  {
    "question": "¿Cuál es la capital de Francia?",
    "answer": "París",
    "options": ["Londres", "París", "Madrid"]
  },
  {
    "question": "¿Cuál es el río más largo del mundo?",
    "answer": "Amazonas",
    "options": ["Nilo", "Amazonas", "Yangtsé"]
  }
]
```

### Creación Manual

#### POST /api/create-flashcard

Crea una flashcard manualmente proporcionada por el usuario.

**Request:**

```json
{
  "question": "¿Cuál es la capital de España?",
  "answer": "Madrid",
  "options": ["Barcelona", "Madrid", "Valencia"]
}
```

**Response:**

```json
{
  "question": "¿Cuál es la capital de España?",
  "answer": "Madrid",
  "options": ["Barcelona", "Madrid", "Valencia"]
}
```

#### POST /api/create-flashcards

Crea múltiples flashcards manualmente.

**Request:**

```json
{
  "flashcards": [
    {
      "question": "¿Cuál es la capital de España?",
      "answer": "Madrid",
      "options": ["Barcelona", "Madrid", "Valencia"]
    },
    {
      "question": "¿Cuál es el océano más grande?",
      "answer": "Pacífico",
      "options": ["Atlántico", "Pacífico", "Índico"]
    }
  ]
}
```

**Response:**

```json
{
  "message": "2 flashcards creadas exitosamente",
  "flashcards": [
    {
      "question": "¿Cuál es la capital de España?",
      "answer": "Madrid",
      "options": ["Barcelona", "Madrid", "Valencia"]
    },
    {
      "question": "¿Cuál es el océano más grande?",
      "answer": "Pacífico",
      "options": ["Atlántico", "Pacífico", "Índico"]
    }
  ]
}
```

### Consulta de Flashcards

#### GET /api/flashcards

Obtiene todas las flashcards con filtros opcionales y paginación.

**Query Parameters:**

- `source`: Filtrar por origen ('ai' o 'manual')
- `limit`: Número de resultados por página (máx. 100, default: 10)
- `offset`: Desplazamiento para paginación (default: 0)

**Response:**

```json
{
  "flashcards": [
    {
      "id": "uuid",
      "question": "¿Cuál es la capital de España?",
      "answer": "Madrid",
      "options": ["Barcelona", "Madrid", "Valencia"],
      "source": "manual",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 10,
    "offset": 0,
    "hasMore": true
  }
}
```

#### GET /api/flashcards/:id

Obtiene una flashcard específica por su ID.

**Response:**

```json
{
  "id": "uuid",
  "question": "¿Cuál es la capital de España?",
  "answer": "Madrid",
  "options": ["Barcelona", "Madrid", "Valencia"],
  "source": "manual",
  "created_at": "2024-01-01T00:00:00Z"
}
```

## Validaciones

### Flashcards Automáticas

- Archivos: Solo PDF y TXT (máx. 5MB)
- Cantidad: 1-20 flashcards
- Contenido: Máx. 2500 caracteres por documento procesado

### Flashcards Manuales

- Pregunta: Texto requerido, no vacío
- Respuesta: Texto requerido, debe estar incluida en las opciones
- Opciones: Array con al menos 2 opciones, todas deben ser texto válido
- Límite: Máx. 20 flashcards por petición

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

## Base de Datos

El proyecto utiliza **Supabase** como base de datos. La tabla `flashcards` incluye:

- `id`: UUID (clave primaria)
- `question`: Texto de la pregunta
- `answer`: Respuesta correcta
- `options`: Array JSON con las opciones
- `source`: Origen ('ai' o 'manual')
- `created_at`: Timestamp de creación
- `updated_at`: Timestamp de actualización

Para inicializar la base de datos, ejecuta el script `supabase-schema.sql` en tu proyecto de Supabase.

### Persistencia Automática

- **Flashcards generadas por IA**: Se guardan automáticamente con `source: 'ai'`
- **Flashcards creadas manualmente**: Se guardan automáticamente con `source: 'manual'`

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
