import { supabase } from './supabase';
import { API_BASE, API_PREFIJO } from './identidad';

/**
 * Cliente de la API del panel (`/api/panel-app/*`).
 *
 * Las tablas del negocio (salones, citas, clientes, servicios…) tienen RLS
 * cerrada para `anon`, así que la app NO puede leerlas directamente con la
 * clave pública de Supabase: devolvería cero filas en silencio. Todo pasa por
 * el backend Next, que valida el token contra `usuarios_salon` y responde con
 * los datos ya filtrados por salón.
 *
 * Fusiona los dos clientes que en `gonper-app` estaban separados sin motivo
 * (`api.js` y `cuentaApi.js`): uno lanzaba con el código HTTP y el otro sacaba
 * el mensaje del JSON. Aquí siempre se intenta sacar el mensaje legible, y si
 * no lo hay se cae al código.
 */

/** Error con el código HTTP y el mensaje del backend ya extraído. */
export class ApiError extends Error {
  constructor(mensaje, status, code) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function pedir(path, opciones = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const cabeceras = { ...(opciones.headers || {}) };
  if (session?.access_token) {
    cabeceras.Authorization = `Bearer ${session.access_token}`;
  }
  if (opciones.body !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${API_PREFIJO}${path}`, {
    method: opciones.method || 'GET',
    headers: cabeceras,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  });

  // 204 sin cuerpo: no intentes parsear.
  if (res.status === 204) return null;

  let cuerpo;
  try {
    cuerpo = await res.json();
  } catch {
    cuerpo = null;
  }

  if (!res.ok) {
    const mensaje =
      cuerpo?.mensaje || cuerpo?.error || `Error ${res.status} en ${path}`;
    throw new ApiError(mensaje, res.status, cuerpo?.error);
  }
  return cuerpo;
}

export function apiGet(path) {
  return pedir(path);
}

export function apiPost(path, body) {
  return pedir(path, { method: 'POST', body: body ?? {} });
}

export function apiPatch(path, body) {
  return pedir(path, { method: 'PATCH', body: body ?? {} });
}

export function apiDelete(path) {
  return pedir(path, { method: 'DELETE' });
}
