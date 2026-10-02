/* ================================================================
   MODELO DE DATOS COMPARTIDO
   ----------------------------------------------------------------
   Este archivo no define funciones: solo describe las tablas.
   Lo usan schema.ts (estructura de la base) e inventario.ts
   (validaciones al guardar, eliminar e importar).

   Si agrega un campo nuevo en el formulario del index.html,
   agréguelo también aquí; de lo contrario el servidor lo descarta.
   ================================================================ */

/** Campos de texto de cada tabla (además de "id" y "creado", que son comunes). */
export const CAMPOS = {
  usuarios:     ["nombre", "documento", "cargo", "email", "telefono", "rol", "estado"],
  responsables: ["cedula", "nombres", "contacto", "email", "estado"],
  proveedores:  ["nombre", "nit", "contacto", "telefono", "email", "direccion", "estado"],
  sedes:        ["nombre", "codigo", "ciudad", "direccion", "telefono", "responsable", "estado"],
  areas:        ["nombre", "codigo", "sedeId", "responsable", "estado"],
  tiposEquipo:  ["nombre", "descripcion", "estado"],
  marcas:       ["nombre", "pais", "soporte", "estado"],
  contratistas: ["idContratista", "nombre", "contacto", "email", "estado"],
  equipos: [
    "idEquipo", "fechaCompra", "fechaUltMant", "proveedorId", "estado",
    "sedeId", "areaId", "responsableId",
    "tipoId", "marcaId", "modelo", "serialFabrica", "serialExterno", "detalleHardware",
    "sistemaOperativo", "versionOffice", "cuentaOffice", "vigenciaOffice", "observaciones",
  ],
  mantenimientos: ["equipoId", "fecha", "hora", "tipo", "contratistaId", "detalles"],
} as const;

export type Tabla = keyof typeof CAMPOS;
export const TABLAS = Object.keys(CAMPOS) as Tabla[];

/** Campos que no se pueden repetir dentro de cada tabla (sin distinguir mayúsculas ni tildes). */
export const UNICOS: Record<Tabla, string[]> = {
  usuarios:       ["nombre"],
  responsables:   ["cedula"],
  proveedores:    ["nombre"],
  sedes:          ["nombre"],
  areas:          ["nombre"],
  tiposEquipo:    ["nombre"],
  marcas:         ["nombre"],
  contratistas:   ["idContratista", "nombre"],
  equipos:        ["idEquipo", "serialFabrica"],
  mantenimientos: [],
};

/** Qué tablas apuntan a cada una. Si hay registros que dependen, no se permite eliminar. */
export const DEPENDENCIAS: Partial<Record<Tabla, [Tabla, string][]>> = {
  proveedores:  [["equipos", "proveedorId"]],
  sedes:        [["equipos", "sedeId"], ["areas", "sedeId"]],
  areas:        [["equipos", "areaId"]],
  responsables: [["equipos", "responsableId"]],
  contratistas: [["mantenimientos", "contratistaId"]],
  tiposEquipo:  [["equipos", "tipoId"]],
  marcas:       [["equipos", "marcaId"]],
};

/** Nombre legible de cada tabla para los mensajes de error. */
export const NOMBRES: Record<Tabla, [string, string]> = {
  usuarios:       ["usuario", "usuarios"],
  responsables:   ["responsable", "responsables"],
  proveedores:    ["proveedor", "proveedores"],
  sedes:          ["sede", "sedes"],
  areas:          ["área", "áreas"],
  tiposEquipo:    ["tipo de equipo", "tipos de equipo"],
  marcas:         ["marca", "marcas"],
  contratistas:   ["contratista", "contratistas"],
  equipos:        ["equipo", "equipos"],
  mantenimientos: ["mantenimiento", "mantenimientos"],
};
