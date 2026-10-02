# Base de datos en la nube con Convex

Guía para que el inventario guarde los datos en internet y se puedan consultar desde cualquier equipo.

## Qué cambió

| Antes (modo local) | Ahora (modo nube) |
|---|---|
| Los datos vivían solo en el navegador donde se registraron. | Los datos están en Convex y se ven igual en todos los equipos. |
| La contraseña estaba escrita en el `index.html`. | La contraseña vive en el servidor (variable `ADMIN_CLAVE`). |
| Para ver un cambio hecho en otro equipo no había forma. | Los cambios aparecen solos, en tiempo real, en todos los equipos abiertos. |
| El respaldo se podía descargar, pero no restaurar. | El botón **Importar** restaura respaldos JSON. |

Mientras `CONVEX_URL` esté vacía en el `index.html`, la aplicación sigue funcionando en modo local, igual que antes.

## Archivos del proyecto

```
cn-inventario/
├── index.html              ← la aplicación (aquí se pega la URL de Convex)
├── package.json            ← declara la dependencia "convex"
├── CONVEX-INSTALACION.md   ← esta guía
└── convex/                 ← el "backend": se ejecuta en los servidores de Convex
    ├── schema.ts           ← estructura de las tablas
    ├── modelo.ts           ← campos, campos únicos y dependencias de cada tabla
    ├── acceso.ts           ← inicio y cierre de sesión
    └── inventario.ts       ← listar, guardar, eliminar e importar
```

Al ejecutar Convex por primera vez se crean solos `convex/_generated/`, `convex/tsconfig.json` y `.env.local`. No los edite.

## Paso 1. Instalar Node.js (una sola vez)

1. Descargue la versión **LTS** desde https://nodejs.org e instálela con las opciones por defecto.
2. Abra una terminal nueva (**Símbolo del sistema** o **PowerShell**) y verifique:
   ```
   node -v
   npm -v
   ```
   Ambos comandos deben mostrar un número de versión.

> Si PowerShell muestra *"la ejecución de scripts está deshabilitada"*, use el **Símbolo del sistema (cmd)** o ejecute una vez en PowerShell:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Paso 2. Crear la cuenta en Convex

Entre a https://convex.dev y regístrese con GitHub o Google. El plan gratuito es suficiente para este inventario.

## Paso 3. Crear el proyecto y subir las funciones

En la terminal, ubíquese en la carpeta del proyecto e instale la dependencia:

```
cd C:\Users\USER\Downloads\Luis\cn-inventario
npm install
```

Luego ejecute:

```
npx convex dev
```

- La primera vez abre el navegador para iniciar sesión en Convex.
- Pregunta si desea crear un proyecto nuevo: responda que sí y llámelo `cn-inventario`.
- Cuando aparezca **"Convex functions ready!"**, las tablas y funciones ya están en la nube. Puede cerrar con `Ctrl + C`.

Este comando crea el entorno de **desarrollo**, que sirve para hacer pruebas.

## Paso 4. Publicar en producción

El entorno de **producción** es el que usará la institución:

```
npx convex deploy
```

Confirme con `y`. Luego defina la contraseña del administrador en producción:

```
npx convex env set ADMIN_CLAVE "Escriba-Aqui-Una-Clave-Segura" --prod
```

Opcionalmente puede cambiar el nombre de usuario (por defecto es `Admin`):

```
npx convex env set ADMIN_USUARIO "Admin" --prod
```

> **Importante:** no use `95131131`. Esa clave aparece en el código del `index.html` (modo local) y cualquiera puede verla.

Estas variables también se pueden configurar en el panel de Convex: **Settings › Environment Variables**, con el selector en *Production*.

## Paso 5. Conectar la aplicación

1. Copie la URL de producción. Aparece al final de `npx convex deploy` y también en el panel de Convex, en **Settings › URL & Deploy Key**. Tiene la forma `https://nombre-aleatorio-123.convex.cloud`.
2. Abra `index.html` con un editor (Bloc de notas o VS Code) y busque la línea:
   ```js
   const CONVEX_URL = '';
   ```
3. Pegue la URL entre las comillas y guarde:
   ```js
   const CONVEX_URL = 'https://nombre-aleatorio-123.convex.cloud';
   ```

En la barra superior de la aplicación aparecerá el indicador **En la nube**.

## Paso 6. Subir los datos que ya existían

Los datos registrados hasta ahora están en el navegador del equipo donde se usó la aplicación. **Este paso debe hacerse en ese mismo equipo y navegador:**

1. Abra el `index.html` ya conectado e inicie sesión con la nueva clave.
2. Pulse **Importar › Datos guardados en este navegador**.
3. Confirme. Los datos quedan en la nube y desde ese momento cualquier equipo los ve.

El mismo botón permite **restaurar un archivo de respaldo (.json)** o **cargar los datos de ejemplo**.

> La importación **reemplaza** todo lo que haya en la base. Descargue antes un **Respaldo** si hay datos que no quiere perder.

## Paso 7. Publicar la aplicación (recomendado)

Para no copiar el `index.html` en cada equipo, publíquelo con **GitHub Pages**:

1. Suba los cambios al repositorio `cn-inventario` (ya está conectado a GitHub).
2. En GitHub: **Settings › Pages › Branch: main › / (root) › Save**.
3. En un par de minutos la aplicación estará en `https://luisvergaratech-ctr.github.io/cn-inventario/`.

Publicar el `index.html` es seguro: la URL de Convex no es secreta, porque sin la clave del servidor no se puede leer ni modificar ningún dato.

## Cómo funciona la seguridad

1. El navegador envía usuario y clave a la función `acceso:iniciarSesion`.
2. El servidor los compara con `ADMIN_USUARIO` y `ADMIN_CLAVE`. Si son correctos, entrega un **token** aleatorio de 64 caracteres.
3. El navegador guarda el token y lo envía en cada consulta. Las funciones del inventario rechazan cualquier petición sin un token válido.
4. La sesión vence a las 12 horas, o a los 30 días si se marcó **Mantener la sesión iniciada**.
5. Después de 10 intentos fallidos, el ingreso se bloquea durante 15 minutos.

## Uso diario

- **Cambiar la clave:** `npx convex env set ADMIN_CLAVE "nueva-clave" --prod`. Las sesiones ya abiertas siguen activas hasta que venzan.
- **Ver los datos directamente:** en el panel de Convex, menú **Data**, aparece cada tabla (`equipos`, `mantenimientos`, `sedes`…).
- **Modificar las funciones:** después de editar un archivo de `convex/`, ejecute `npx convex deploy` de nuevo.
- **Agregar un campo nuevo al formulario:** agréguelo en `SCHEMA_EQUIPOS` (o en el esquema que corresponda) del `index.html` **y** en `convex/modelo.ts`. Luego vuelva a publicar.

## Solución de problemas

| Mensaje | Causa y solución |
|---|---|
| *El servidor no tiene configurada la variable ADMIN_CLAVE* | Falta el Paso 4. Verifique que usó `--prod` si la URL es de producción. |
| *No se pudo cargar la librería de Convex* | No hay internet o el navegador bloquea `unpkg.com`. |
| *La sesión venció* | Inicie sesión de nuevo. |
| El indicador dice **Solo este navegador** | `CONVEX_URL` está vacía o el archivo no se guardó. |
| La clave correcta no funciona | La clave se configuró en desarrollo y la URL es de producción, o al revés. Revise con `npx convex env list --prod`. |
