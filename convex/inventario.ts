/* ================================================================
   FUNCIONES DEL INVENTARIO (las llama el index.html)
   ----------------------------------------------------------------
     inventario:listar    (consulta)  -> todos los datos, en tiempo real
     inventario:guardar   (mutación)  -> crear o actualizar un registro
     inventario:eliminar  (mutación)  -> borrar un registro
     inventario:importar  (mutación)  -> reemplazar toda la base con un respaldo
     inventario:migrarResponsables (mutación) -> pasa a Responsables los
                          usuarios que estaban asignados a equipos
   Todas exigen un token de sesión válido (ver acceso.ts).
   ================================================================ */
import { query, mutation, MutationCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { CAMPOS, TABLAS, UNICOS, DEPENDENCIAS, NOMBRES, Tabla } from "./modelo";
import { sesionValida, exigirSesion } from "./acceso";

/* Validador de nombre de tabla: solo se aceptan las 9 tablas del inventario. */
const vTabla = v.union(
  v.literal("usuarios"), v.literal("responsables"), v.literal("proveedores"), v.literal("sedes"), v.literal("areas"),
  v.literal("tiposEquipo"), v.literal("marcas"), v.literal("contratistas"),
  v.literal("equipos"), v.literal("mantenimientos"),
);

/* Las tablas se eligen en tiempo de ejecución (según el formulario que se guarda),
   por eso aquí se trabaja con la base de datos sin tipos estrictos. */
type Registro = Record<string, any>;
const bd = (ctx: { db: unknown }) => ctx.db as any;

/** Normaliza texto para comparar: sin tildes, sin mayúsculas, sin espacios extremos. */
const norm = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Quita los campos internos de Convex (_id, _creationTime) antes de enviar al navegador. */
const publico = ({ _id, _creationTime, ...resto }: Registro) => resto;

/** Deja solo los campos permitidos de la tabla, todos como texto. */
function limpiar(tabla: Tabla, r: Registro): Registro {
  const limpio: Registro = {};
  for (const c of CAMPOS[tabla]) {
    if (r[c] !== undefined && r[c] !== null) limpio[c] = String(r[c]).trim();
  }
  if (r.creado) limpio.creado = String(r.creado);
  return limpio;
}

function nuevoId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Date.now().toString(36) + Array.from(b, (x) => x.toString(36)).join("").slice(0, 8);
}

async function todos(ctx: MutationCtx, tabla: Tabla): Promise<Registro[]> {
  return await bd(ctx).query(tabla).collect();
}

async function buscarPorId(ctx: MutationCtx, tabla: Tabla, id: string): Promise<Registro | null> {
  return await bd(ctx).query(tabla).withIndex("por_id", (q: any) => q.eq("id", id)).unique();
}

/** Copia al equipo la fecha de su mantenimiento más reciente (si tiene historial). */
async function sincronizarUltMant(ctx: MutationCtx, equipoId: string | undefined) {
  if (!equipoId) return;
  const eq = await buscarPorId(ctx, "equipos", equipoId);
  if (!eq) return;
  const hist: Registro[] = await bd(ctx)
    .query("mantenimientos")
    .withIndex("por_equipo", (q: any) => q.eq("equipoId", equipoId))
    .collect();
  if (!hist.length) return;   // sin historial se respeta la fecha escrita a mano
  const ultima = hist
    .map((m) => String(m.fecha || ""))
    .sort()
    .pop();
  if (ultima && ultima !== eq.fechaUltMant) {
    await bd(ctx).patch(eq._id, { fechaUltMant: ultima });
  }
}

/** Los equipos registrados antes de existir la tabla Responsables apuntaban a un
    USUARIO. Por cada usuario asignado se crea un responsable con el MISMO id,
    así el equipo queda enlazado sin modificarlo. Devuelve cuántos se crearon. */
async function pasarUsuariosAResponsables(ctx: MutationCtx): Promise<number> {
  const responsables = new Set((await todos(ctx, "responsables")).map((r) => r.id));
  const usuarios = new Map((await todos(ctx, "usuarios")).map((u) => [u.id, u]));
  let creados = 0;
  for (const e of await todos(ctx, "equipos")) {
    const id = e.responsableId;
    if (!id || responsables.has(id) || !usuarios.has(id)) continue;
    const u = usuarios.get(id)!;
    const datos = limpiar("responsables", {
      cedula: u.documento, nombres: u.nombre, contacto: u.telefono,
      email: u.email, estado: u.estado || "Activo", creado: new Date().toISOString(),
    });
    await bd(ctx).insert("responsables", { ...datos, id });
    responsables.add(id);
    creados++;
  }
  return creados;
}

/* ---------------------------------------------------------------
   MUTACIÓN: pasar a Responsables los usuarios asignados a equipos
   La llama el navegador automáticamente (una sola vez) cuando detecta
   equipos cuyo responsable todavía es un usuario. Es segura de repetir.
   --------------------------------------------------------------- */
export const migrarResponsables = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await exigirSesion(ctx, token);
    return { creados: await pasarUsuariosAResponsables(ctx) };
  },
});

/* ---------------------------------------------------------------
   CONSULTA: todos los datos del inventario
   Devuelve null si la sesión no es válida (el navegador vuelve al login).
   Como es una suscripción, cada cambio llega solo a todos los equipos
   que tengan la aplicación abierta.
   --------------------------------------------------------------- */
export const listar = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!(await sesionValida(ctx, token))) return null;
    const datos: Record<string, Registro[]> = {};
    for (const t of TABLAS) {
      datos[t] = (await bd(ctx).query(t).collect()).map(publico);
    }
    return datos;
  },
});

/* ---------------------------------------------------------------
   MUTACIÓN: crear o actualizar un registro
   --------------------------------------------------------------- */
export const guardar = mutation({
  args: { token: v.string(), tabla: vTabla, registro: v.any() },
  handler: async (ctx, { token, tabla, registro }) => {
    await exigirSesion(ctx, token);
    if (!registro || typeof registro !== "object") throw new ConvexError("Registro no válido.");

    const id: string = registro.id ? String(registro.id) : nuevoId();
    const datos = limpiar(tabla, registro);
    const existente = await buscarPorId(ctx, tabla, id);

    // Campos que no pueden repetirse
    const lista = await todos(ctx, tabla);
    for (const k of UNICOS[tabla]) {
      if (!datos[k]) continue;
      const dup = lista.find((r) => r.id !== id && norm(r[k]) === norm(datos[k]));
      if (dup) {
        throw new ConvexError(`Ya existe un registro de ${NOMBRES[tabla][1]} con ${k} “${datos[k]}”.`);
      }
    }

    if (existente) {
      const doc: Registro = { ...datos, id };
      if (existente.creado) doc.creado = existente.creado;   // se conserva la fecha original
      await bd(ctx).replace(existente._id, doc);
    } else {
      await bd(ctx).insert(tabla, { ...datos, id, creado: datos.creado || new Date().toISOString() });
    }

    // Mantiene coherente la fecha de último mantenimiento
    if (tabla === "mantenimientos") {
      await sincronizarUltMant(ctx, datos.equipoId);
      if (existente && existente.equipoId !== datos.equipoId) {
        await sincronizarUltMant(ctx, existente.equipoId);
      }
    }
    if (tabla === "equipos") await sincronizarUltMant(ctx, id);

    return { id };
  },
});

/* ---------------------------------------------------------------
   MUTACIÓN: eliminar un registro
   Se bloquea si otros registros dependen de él. Al eliminar un equipo
   se elimina también su historial de mantenimientos.
   --------------------------------------------------------------- */
export const eliminar = mutation({
  args: { token: v.string(), tabla: vTabla, id: v.string() },
  handler: async (ctx, { token, tabla, id }) => {
    await exigirSesion(ctx, token);
    const reg = await buscarPorId(ctx, tabla, id);
    if (!reg) return { eliminados: 0 };

    const enUso: string[] = [];
    for (const [col, campo] of DEPENDENCIAS[tabla] || []) {
      const n = (await todos(ctx, col)).filter((r) => r[campo] === id).length;
      if (n) enUso.push(`${n} ${n === 1 ? NOMBRES[col][0] : NOMBRES[col][1]}`);
    }
    if (enUso.length) {
      throw new ConvexError(
        `No es posible eliminar: está siendo utilizado por ${enUso.join(" y ")}. Cámbielo a estado Inactivo.`);
    }

    let eliminados = 1;
    if (tabla === "equipos") {
      const hist: Registro[] = await bd(ctx)
        .query("mantenimientos")
        .withIndex("por_equipo", (q: any) => q.eq("equipoId", id))
        .collect();
      for (const m of hist) { await bd(ctx).delete(m._id); eliminados++; }
    }
    await bd(ctx).delete(reg._id);
    if (tabla === "mantenimientos") await sincronizarUltMant(ctx, reg.equipoId);
    return { eliminados };
  },
});

/* ---------------------------------------------------------------
   MUTACIÓN: importar un respaldo completo
   REEMPLAZA todo el contenido de las 9 tablas por el recibido.
   Sirve para subir los datos que estaban en el navegador (localStorage)
   o para restaurar un archivo de respaldo JSON.
   --------------------------------------------------------------- */
export const importar = mutation({
  args: { token: v.string(), datos: v.any() },
  handler: async (ctx, { token, datos }) => {
    await exigirSesion(ctx, token);
    if (!datos || typeof datos !== "object") throw new ConvexError("El archivo no tiene el formato esperado.");

    // 1) Vaciar las tablas
    for (const t of TABLAS) {
      for (const r of await todos(ctx, t)) await bd(ctx).delete(r._id);
    }

    // 2) Insertar los registros recibidos
    const resumen: Record<string, number> = {};
    for (const t of TABLAS) {
      const lista = Array.isArray(datos[t]) ? datos[t] : [];
      const vistos = new Set<string>();
      let n = 0;
      for (const r of lista) {
        if (!r || typeof r !== "object") continue;
        const id = r.id ? String(r.id) : nuevoId();
        if (vistos.has(id)) continue;          // evita ids repetidos en el archivo
        vistos.add(id);
        await bd(ctx).insert(t, { ...limpiar(t, r), id });
        n++;
      }
      resumen[t] = n;
    }

    // 3) Respaldos antiguos: los usuarios asignados a equipos pasan a Responsables
    resumen.responsables += await pasarUsuariosAResponsables(ctx);

    // 4) Recalcular la fecha de último mantenimiento de cada equipo
    for (const e of await todos(ctx, "equipos")) await sincronizarUltMant(ctx, e.id);

    return resumen;
  },
});
