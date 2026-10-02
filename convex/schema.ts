/* ================================================================
   ESQUEMA DE LA BASE DE DATOS EN CONVEX
   ----------------------------------------------------------------
   Una tabla por cada colección de la aplicación. Todas guardan:
     id      -> identificador propio de la app (lo genera el navegador
                y lo usan las relaciones: sedeId, equipoId, etc.)
     creado  -> fecha ISO de creación (opcional)
     ...     -> los campos de texto definidos en modelo.ts
   Además existen dos tablas internas para el control de acceso.
   ================================================================ */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { CAMPOS } from "./modelo";

/** Construye una tabla con "id" obligatorio y el resto de campos de texto opcionales. */
function tablaDe(campos: readonly string[]) {
  const forma: Record<string, any> = {
    id: v.string(),
    creado: v.optional(v.string()),
  };
  for (const c of campos) forma[c] = v.optional(v.string());
  return defineTable(v.object(forma)).index("por_id", ["id"]);
}

export default defineSchema({
  usuarios:       tablaDe(CAMPOS.usuarios),
  proveedores:    tablaDe(CAMPOS.proveedores),
  sedes:          tablaDe(CAMPOS.sedes),
  areas:          tablaDe(CAMPOS.areas),
  tiposEquipo:    tablaDe(CAMPOS.tiposEquipo),
  marcas:         tablaDe(CAMPOS.marcas),
  contratistas:   tablaDe(CAMPOS.contratistas),
  equipos:        tablaDe(CAMPOS.equipos),
  mantenimientos: tablaDe(CAMPOS.mantenimientos).index("por_equipo", ["equipoId"]),

  /* --- Control de acceso --- */
  // Sesiones abiertas: el navegador guarda el token y lo envía en cada consulta.
  sesiones: defineTable({
    token: v.string(),
    expira: v.number(),          // milisegundos desde 1970 (Date.now())
  }).index("por_token", ["token"]),

  // Intentos fallidos de inicio de sesión (para frenar ataques de fuerza bruta).
  intentosFallidos: defineTable({
    fecha: v.number(),
  }).index("por_fecha", ["fecha"]),
});
