# Plataforma de Monitoreo de Evaluaciones Pendientes

Sitio estático (GitHub Pages) + base de datos en **Google Sheets** mediante **Google Apps Script**.

```
index.html          Página (sin servidor propio)
css/ js/            Diseño y lógica
apps-script/Code.gs Backend: pegar en Apps Script
herramientas/       migrar.html (solo para usar una vez en su computador; NO se sube a GitHub)
```

## 1. Crear el backend (Apps Script + Google Sheets)

1. Cree una hoja de cálculo nueva en Google Drive (nómbrela "Evaluaciones Pendientes - Datos").
2. Menú **Extensiones → Apps Script**. Borre el contenido y pegue todo `apps-script/Code.gs`.
3. Ejecute una vez la función **`inicializar`** (botón ▶) y acepte los permisos. Crea las hojas y el usuario inicial **ADMINISTRADOR / Marina2025\***.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Copie la **URL de la aplicación web** (termina en `/exec`).

> Cada vez que cambie `Code.gs` debe hacer *Implementar → Administrar implementaciones → editar → Nueva versión*.

> **Correos:** al ingresar una evaluación se avisa al estudiante (y apoderado, si tiene correo) usando `MailApp`. Tras pegar el nuevo `Code.gs`, ejecute `inicializar` otra vez para aceptar el permiso de enviar correos y publique una **nueva versión** de la implementación. Cuota: ~100 correos/día en cuentas Gmail, ~1.500 en Google Workspace. Los correos se registran en Estudiantes → Editar.

## 2. Traspasar los datos actuales (Firebase → Apps Script)

**Recomendado:** dentro de la plataforma, Administración → Datos y respaldo → *Traspasar desde Firebase*. Busca en todas las ubicaciones de Firebase, reemplaza lo que haya en el sistema y carga todo. También permite descargar el archivo de Firebase y subirlo después. (La herramienta de abajo es la alternativa antigua.)


1. Abra con doble clic `herramientas/migrar.html` en su computador.
2. Pegue la URL de Apps Script → **Conectar**.
3. Elija **ADMINISTRADOR**, contraseña `Marina2025*` → **Leer Firebase y migrar**.
4. Se copian usuarios (las contraseñas pasan a guardarse cifradas), estudiantes, evaluaciones, salas, horarios, coordinadores, días bloqueados, asignaturas, regla de anticipación y las imágenes.
5. Entre a la plataforma con su usuario de siempre y elimine el usuario `ADMINISTRADOR` inicial (Administración → Usuarios).

Firebase no se modifica: queda como respaldo hasta que usted decida cerrarlo.

## 3. Conectar la página y publicarla en GitHub

1. Edite `js/config.js` y pegue la URL: `API_URL: 'https://script.google.com/macros/s/XXXX/exec'`
2. En github.com → **New repository** (por ejemplo `evaluaciones-pendientes`).
3. **Add file → Upload files**: arrastre `index.html`, `.gitignore`, `README.md` y las carpetas `css`, `js` y `apps-script`. **No suba `herramientas`.**
4. **Settings → Pages → Branch: main / (root) → Save**.
5. La página queda en `https://SU-USUARIO.github.io/evaluaciones-pendientes/`.

> Los datos **no** están en GitHub, solo el código. Los estudiantes y evaluaciones viven en su hoja de Google. Si el repositorio es público, cualquiera ve el código pero necesita usuario y contraseña para acceder a los datos.

## Modo demo

Con `API_URL` vacío la plataforma funciona con datos de ejemplo guardados solo en el navegador (ADMINISTRADOR / `admin`, docente ANA PEREZ / `1234`, RUT de prueba `24111222-3`).

## Qué cambió respecto a la versión anterior

- **Una sola tabla de Pendientes** con pestañas (Esta semana · Próximas · Sin fecha · En UTP · Todas) en lugar de 4 tablas. **Fecha y hora se editan en la misma fila** (se guardan solas, con validación de feriados, reposos, suspensiones y máximo diario), botón "próximo día oficial" y cambio masivo de fecha/hora para varias filas.
- Menos pantallas: Estudiantes (reemplaza Gestionar, Lista Alumnos y Retirados), Historial (reemplaza Rendidas y Cerradas por salud), Mi panel (incluye Mi jefatura), Administración con pestañas (calendario, salas y coordinación juntos).
- Toda la impresión (firmas, cartas, listado) desde un único botón **Imprimir / PDF**.
- Un solo aviso de revisión antes de guardar, en lugar de varias ventanas emergentes.
- Seguridad: inicio de sesión validado en el servidor, contraseñas cifradas (ya no se muestran), sesión de 6 horas y consulta de familias que solo devuelve los datos mínimos.

## Reglas que se mantienen

2ª y 3ª citación al hogar → 4ª oportunidad en manos de UTP (sin fecha); reposo ≥ 15 días cierra por salud; reposo menor deja sin fecha para reagendar y exige 5 días hábiles de readaptación; suspensiones no consumen oportunidad; Plan de Evaluación (solo UTP agenda); retirados fuera de todas las listas; días bloqueados; plazo de anticipación; máximo de evaluaciones por día; distribución de salas por docente.

