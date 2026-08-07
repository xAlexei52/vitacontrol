# VitaControl

App personal para llevar el control de tu dieta, tu peso y tus días de gimnasio.
Basada en el plan de alimentación por equivalentes del Instituto Jalisciense de Cancerología.

## Qué hace

- **Hoy**: palomea tus 5 comidas del día, tus 2 tomas de Omega 3, registra tu peso y marca tu sesión de gym. Puedes navegar a días anteriores si se te olvidó registrar algo.
- **Dieta**: tu menú completo con alternativas equivalentes por comida, tu suplemento y las recomendaciones de tu instituto.
- **Gym**: rutina de 5 días (pecho/tríceps, espalda/bíceps, pierna, hombro/abs, full body + cardio) con video de técnica por ejercicio.
- **Progreso**: gráfica de peso, calendario del mes con tus días de gym y dieta, adherencia semanal y recordatorio de laboratorios semestrales.

Es una PWA: desde el navegador del celular usa "Agregar a pantalla de inicio" y queda como app.

## Correr en local

```bash
cp .env.example .env   # edita JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD
npm install
npm start              # abre http://localhost:3000
```

El usuario se crea automáticamente la primera vez que arranca el servidor (con los datos del `.env`).

## Editar la dieta o las rutinas

Todo el contenido vive en `data/`:

- `data/dieta.json` — menú, alternativas, raciones y recomendaciones. Si tu nutriólogo cambia algo, edita aquí.
- `data/rutinas.json` — los 5 días de rutina. Cada ejercicio tiene `videoId` (video de YouTube) y `videoQuery` (búsqueda de respaldo si el video deja de existir).

No hace falta tocar código ni reiniciar con cuidado: los JSON se leen en cada petición.

## Desplegar en tu VPS

```bash
# En el VPS (con Node 18+ instalado)
git clone <tu-repo> vitacontrol
cd vitacontrol
npm install --production
cp .env.example .env
nano .env              # pon un JWT_SECRET largo y aleatorio y TU contraseña real

# Correrlo con pm2 para que sobreviva reinicios
npm install -g pm2
pm2 start index.js --name vitacontrol
pm2 save
pm2 startup            # sigue la instrucción que imprime
```

### Nginx + HTTPS (recomendado)

La app va a tener datos de salud: ponla detrás de HTTPS.

```nginx
server {
    server_name vitacontrol.tudominio.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo certbot --nginx -d vitacontrol.tudominio.com
```

### Respaldo de la base de datos

Toda tu información está en un solo archivo: `vitacontrol.db`. Respáldalo con cron:

```bash
crontab -e
# Respaldo diario a las 3 am (conserva 30 días)
0 3 * * * mkdir -p ~/vitacontrol/backups && sqlite3 ~/vitacontrol/vitacontrol.db ".backup '~/vitacontrol/backups/vitacontrol-$(date +\%F).db'" && find ~/vitacontrol/backups -name '*.db' -mtime +30 -delete
```

(Si no tienes `sqlite3` instalado: `sudo apt install sqlite3`, o simplemente copia el archivo con `cp` cuando la app no esté escribiendo.)

## Nota de salud

La app sigue tal cual el plan de tu nutriólogo; no inventa recomendaciones médicas.
Consulta a tu nutriólogo antes de cambiar la dieta.
