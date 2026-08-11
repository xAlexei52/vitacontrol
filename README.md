# VitaControl

App personal para llevar el control de tu dieta, tu peso y tus días de gimnasio.
Basada en el plan de alimentación por equivalentes del Instituto Jalisciense de Cancerología.

## Qué hace

- **Entrada con PIN**: pad numérico grande (pensado para pantalla táctil / refrigerador). La sesión dura 1 año, así que en la práctica solo lo tecleas una vez por dispositivo.
- **Hoy**: palomea tus 5 comidas del día, tus 2 tomas de Omega 3, registra tu peso y marca tu sesión de gym. Puedes navegar a días anteriores si se te olvidó registrar algo.
- **Dieta**: tu menú completo con alternativas equivalentes por comida, tu suplemento y las recomendaciones de tu instituto.
- **Gym**: rutina de 5 días (pecho/tríceps, espalda/bíceps, pierna, hombro/abs, full body + cardio) con video de técnica por ejercicio.
- **Progreso**: gráfica de peso, calendario del mes con tus días de gym y dieta, adherencia semanal y recordatorio de laboratorios semestrales.

Es una PWA: desde el navegador del celular (o del refri) usa "Agregar a pantalla de inicio" y queda como app.

## Correr en local

```bash
cp .env.example .env   # pon tu PIN y un JWT_SECRET aleatorio
npm install
npm start              # abre http://localhost:3000
```

En local no necesitas base de datos: usa SQLite (archivo `vitacontrol.db` que se crea solo).

## Editar la dieta o las rutinas

Todo el contenido vive en `data/`:

- `data/dieta.json` — menú, alternativas, raciones y recomendaciones. Si tu nutriólogo cambia algo, edita aquí.
- `data/rutinas.json` — los 5 días de rutina. Cada ejercicio tiene `videoId` (video de YouTube) y `videoQuery` (búsqueda de respaldo si el video deja de existir).

Los JSON se leen en cada petición: guardas el archivo y ya.

## Desplegar en Hostinger

### 1. Crea la base de datos MySQL (en hPanel)

En **hPanel → Bases de datos → MySQL**:

- Nombre de la base de datos: `vitacontrol` (Hostinger le pone tu prefijo, queda algo como `u123456789_vitacontrol`)
- Crea también un usuario (ej. `vitacontrol`) con su contraseña y asígnalo a la BD con todos los permisos.

No hay que correr ningún script SQL: la app crea sus tablas sola la primera vez que arranca.
(Si algún día quieres crearlas a mano, el esquema está en `db.js`.)

### 2. Sube la app Node.js

En **hPanel → Sitios web → Node.js** (o vía Git):

- Sube el proyecto (sin `node_modules` ni `.env` ni `vitacontrol.db`).
- Archivo de arranque: `index.js`. Comando: `npm start`.
- Corre `npm install` desde el panel o SSH.

### 3. Variables de entorno

En el panel de Node.js de Hostinger agrega (o crea un `.env` por SSH):

```
JWT_SECRET=una-cadena-larga-y-aleatoria-distinta-a-la-local
PIN=tu-pin-de-4-a-8-digitos
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u123456789_vitacontrol
DB_USER=u123456789_vitacontrol
DB_PASSWORD=la-contrasena-que-pusiste-en-hpanel
```

(`DB_HOST` en Hostinger normalmente es `localhost`; el nombre exacto de host, BD y usuario los ves en hPanel → MySQL.)

- Con `DB_HOST` definido, la app usa MySQL automáticamente.
- No definas `PORT`: Hostinger lo inyecta solo.

### 4. Respaldo

Tus datos quedan en la BD MySQL; en hPanel → Bases de datos puedes descargar un respaldo cuando quieras (o programarlo). Ligero: son puros registros de texto.

## Seguridad

- El PIN se limita a 5 intentos fallidos por IP cada 15 minutos.
- Aún así, usa el dominio con HTTPS (en Hostinger es automático con su SSL gratis).
- El PIN vive solo en el servidor (`.env`), nunca en el código ni en el navegador.

## Nota de salud

La app sigue tal cual el plan de tu nutriólogo; no inventa recomendaciones médicas.
Consulta a tu nutriólogo antes de cambiar la dieta.
