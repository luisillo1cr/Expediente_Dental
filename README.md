# Expediente Dental (Offline) — Electron + SQLite

Aplicación de escritorio para gestión de expedientes clínicos y operación diaria en consultorio, diseñada para funcionar **100% offline** (sin Firebase), usando **SQLite** para datos y almacenamiento local para archivos adjuntos.

> Este repositorio se mantiene **público únicamente como portafolio y respaldo**. Ver **Licencia / Uso** al final.

---

## Objetivo

Centralizar la operación clínica/administrativa en una app instalada (Windows/macOS/Linux según build), con datos locales y flujos rápidos: pacientes, historial de tratamientos, controles (citas/controles), agenda de controles y adjuntos.

---

## Funcionalidades principales

### Pacientes
- Crear, editar, listar y ocultar pacientes.
- Datos generales y clínicos, incluyendo **cuestionario médico** (validación obligatoria al crear/editar).
- Generación de expediente (consecutivo) y consulta por ID.

### Tratamientos (Historial)
- Registro de tratamientos por paciente.
- Campos típicos: fecha, pieza, tratamiento, monto, abono, método de pago, notas.
- Edición y eliminación lógica (hidden).

### Controles (Citas/Controles)
- Registro de controles por paciente (fecha, tipo, estado, notas).
- Edición y eliminación lógica.
- Base para cálculo de “próximo control”.

### Agenda de controles (por mes)
- Vista/consulta por mes (YYYY-MM).
- Cálculo de próximo control “efectivo” (por fecha explícita o por intervalo + último control).
- Marcado por mes: **Contactado / No contactado** (tabla `control_contact_log`).
- Generación de lista “Por contactar” (flag en `patients.control_contact_flag`).
- Exportación de agenda a PDF (Chromium `printToPDF` en ventana oculta).

### Archivos adjuntos
- Adjuntar archivos a pacientes (PDF / imágenes).
- Listar, abrir, revelar en carpeta, guardar como, leer para visor interno (con límites de tamaño).
- Previsualización de imágenes vía DataURL (con límite de tamaño para IPC).

### Proformas (Exportar PDF / Imagen)
- Exportación a **PDF** desde HTML (Chromium `printToPDF`).
- Exportación a **PNG** desde HTML (captura de ventana oculta) o desde bytes/base64/dataUrl.
- Flujo compatible con “saveDialog + saveFile” cuando el renderer decide escribir el archivo.

### Autenticación local (offline)
- Login con usuario/contraseña contra SQLite.
- Roles (p.ej. `dev`, `doctor`) y sesión persistida localmente.

### Migración / Importación
- Vista previa de archivo de migración (JSON) con conteos, warnings y muestras.
- Importación con:
  - Backup automático previo a tocar la DB.
  - Progreso por IPC hacia el renderer.
  - Mapeo de llaves antiguas a IDs nuevos.
  - Inserción de pacientes + tratamientos (historial).

---

## Tecnologías

- **Electron** (Main + Renderer)
- **React + Vite** (UI)
- **SQLite** (base local)
- IPC centralizado (`electron/ipc/handlers.js`)

---

## Requisitos

- **Node.js 18+** recomendado.
- npm (o pnpm/yarn si adaptás scripts).

---

## Instalación y ejecución

1) Instalar dependencias:
```bash
npm install
