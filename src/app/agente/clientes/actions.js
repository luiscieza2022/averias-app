"use server";

// Backend de clientes
//   JOJO-34. HU01 - Listar clientes
//
// Cómo usarlo desde el frontend:
//
//   import { listarClientes } from "./actions";
//
//   const r = await listarClientes();
//   if (!r.ok)  -> mostrar r.error y un botón "Reintentar" (volver a llamar listarClientes)
//   if (r.vacio) -> mostrar r.mensaje ("No hay clientes registrados")
//   else         -> r.clientes = [{ id, codigo, nombre_completo, documento, telefono }]
//
//   Al seleccionar un cliente, el frontend usa su id para continuar con la atención.
//   La lista es de solo lectura: este archivo solo hace consultas (select).

import { createClient } from "@/lib/supabase/server";
import { requireRol } from "@/lib/auth";

const MENSAJE_VACIO = "No hay clientes registrados";
const MENSAJE_ERROR = "No se pudo cargar la lista de clientes. Intenta nuevamente.";

// ---------------------------------------------------------------------
// HU01 - Listar clientes
// Devuelve nombre completo, DNI/RUC, teléfono y código de cada cliente,
// ordenados por nombre. Solo lectura.
// ---------------------------------------------------------------------
export async function listarClientes() {
  await requireRol("agente");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("id, codigo, nombre_completo, documento, telefono")
    .order("nombre_completo", { ascending: true });

  if (error) {
    console.error("[clientes]", error.code, error.message);
    return { ok: false, error: MENSAJE_ERROR, reintentar: true };
  }

  const clientes = data || [];
  if (clientes.length === 0) {
    return { ok: true, clientes: [], vacio: true, mensaje: MENSAJE_VACIO };
  }

  return { ok: true, clientes, vacio: false };
}

// ---------------------------------------------------------------------
// HU02 - Buscar informacion del cliente (JOJO-39)
// Permite buscar por DNI/RUC, codigo de cliente o telefono
// Devuelve datos completos del cliente y sus últimas 5 averias.
// ---------------------------------------------------------------------
export async function buscarCliente(termino) {
  await requireRol("agente");

  if (!termino || !termino.trim()) {
    return { ok: false, error: "Debe ingresar un término de búsqueda." };
  }

  const supabase = await createClient();
  const busqueda = termino.trim();

  // 1. Buscar cliente por código, documento (DNI/RUC) o teléfono
  const { data: clientes, error: errorCliente } = await supabase
    .from("clientes")
    .select("id, codigo, nombre_completo, documento, telefono, correo, direccion")
    .or(`codigo.ilike.%${busqueda}%,documento.ilike.%${busqueda}%,telefono.ilike.%${busqueda}%`)
    .limit(1);

  if (errorCliente) {
    console.error("[buscarCliente]", errorCliente.code, errorCliente.message);
    return { ok: false, error: "Error al consultar el cliente en la base de datos." };
  }

  if (!clientes || clientes.length === 0) {
    return { ok: true, cliente: null, vacio: true, mensaje: "Cliente no encontrado" };
  }

  const cliente = clientes[0];

  // 2. Obtener el historial de las últimas 5 averías (código, fecha, tipo y estado)
  const { data: averias, error: errorAverias } = await supabase
    .from("averias")
    .select(`
      id,
      codigo,
      fecha_reporte,
      estado,
      tipos_averia (
        nombre
      )
    `)
    .eq("cliente_id", cliente.id)
    .order("fecha_reporte", { ascending: false })
    .limit(5);

  if (errorAverias) {
    console.error("[buscarCliente - averias]", errorAverias.code, errorAverias.message);
  }

  const historialAverias = (averias || []).map((av) => ({
    id: av.id,
    codigo: av.codigo,
    fecha: av.fecha_reporte,
    tipo: av.tipos_averia?.nombre || "No especificado",
    estado: av.estado
  }));

  return {
    ok: true,
    vacio: false,
    cliente: {
      ...cliente,
      averias: historialAverias
    }
  };
}
