/* ================================================================
   CONTROL DE ACCESO
   ----------------------------------------------------------------
   La contraseña ya NO está en el index.html. Vive en el servidor como
   variable de entorno de Convex:
       ADMIN_CLAVE    (obligatoria)  -> contraseña del administrador
       ADMIN_USUARIO  (opcional)     -> nombre de usuario; por defecto "Admin"
   Se configuran en el panel de Convex: Settings > Environment Variables,
   o con el comando:  npx convex env set ADMIN_CLAVE "su-clave"

   Al iniciar sesión se crea un token aleatorio que el navegador guarda
   y envía en cada consulta. Sin un token válido no se puede leer ni
   modificar ningún dato.
   ================================================================ */
import { mutation, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";

// Convex expone las variables de entorno en process.env (se declara para TypeScript).
declare const process: { env: Record<string, string | undefined> };

const HORA = 60 * 60 * 1000;
const DURACION_NORMAL   = 12 * HORA;        // sesión sin "mantener iniciada"
const DURACION_RECORDAR = 30 * 24 * HORA;   // sesión con "mantener iniciada"

// Freno a la fuerza bruta: máximo de intentos fallidos en la ventana de tiempo.
const MAX_INTENTOS = 10;
const VENTANA_INTENTOS = 15 * 60 * 1000;    // 15 minutos

/** Comprueba el token. Devuelve true si la sesión existe y no ha vencido. */
export async function sesionValida(ctx: QueryCtx, token: string): Promise<boolean> {
  if (!token) return false;
  const s = await ctx.db
    .query("sesiones")
    .withIndex("por_token", (q) => q.eq("token", token))
    .unique();
  return !!s && s.expira > Date.now();
}

/** Igual que sesionValida, pero detiene la operación con un mensaje claro. */
export async function exigirSesion(ctx: QueryCtx, token: string): Promise<void> {
  if (!(await sesionValida(ctx, token))) {
    throw new ConvexError("La sesión no es válida o ya venció. Inicie sesión nuevamente.");
  }
}

/** Genera un token difícil de adivinar (64 caracteres hexadecimales). */
function nuevoToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const iniciarSesion = mutation({
  args: { usuario: v.string(), clave: v.string(), recordar: v.boolean() },
  handler: async (ctx, { usuario, clave, recordar }) => {
    const claveServidor = process.env.ADMIN_CLAVE;
    const usuarioServidor = process.env.ADMIN_USUARIO || "Admin";
    if (!claveServidor) {
      return { ok: false as const,
               mensaje: "El servidor no tiene configurada la variable ADMIN_CLAVE. Revise la guía de instalación." };
    }

    const ahora = Date.now();

    // ¿Demasiados intentos fallidos recientes?
    const recientes = await ctx.db
      .query("intentosFallidos")
      .withIndex("por_fecha", (q) => q.gt("fecha", ahora - VENTANA_INTENTOS))
      .collect();
    if (recientes.length >= MAX_INTENTOS) {
      return { ok: false as const,
               mensaje: "Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo." };
    }

    const correcto =
      usuario.trim().toLowerCase() === usuarioServidor.toLowerCase() && clave === claveServidor;

    if (!correcto) {
      // Se registra el intento. Se usa "return" en lugar de "throw" porque un
      // error desharía también esta escritura.
      await ctx.db.insert("intentosFallidos", { fecha: ahora });
      return { ok: false as const,
               mensaje: "Usuario o contraseña incorrectos. Verifique e intente nuevamente." };
    }

    // Limpieza: sesiones vencidas e intentos antiguos.
    for (const s of await ctx.db.query("sesiones").collect()) {
      if (s.expira <= ahora) await ctx.db.delete(s._id);
    }
    for (const i of await ctx.db.query("intentosFallidos").collect()) {
      await ctx.db.delete(i._id);
    }

    const token = nuevoToken();
    await ctx.db.insert("sesiones", {
      token,
      expira: ahora + (recordar ? DURACION_RECORDAR : DURACION_NORMAL),
    });
    return { ok: true as const, token, usuario: usuarioServidor };
  },
});

export const cerrarSesion = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await ctx.db
      .query("sesiones")
      .withIndex("por_token", (q) => q.eq("token", token))
      .unique();
    if (s) await ctx.db.delete(s._id);
  },
});
