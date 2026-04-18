/**
 * Codigos de salida de imapsync (p. ej. 2.314). Ver imapsync en CPAN/GitHub: constantes EXIT_*.
 * host1 = origen, host2 = destino en el flujo tipico de este proyecto.
 */
const IMAPSYNC_EXIT_HINT_ES = new Map([
  [1, "error generico u otro fallo no clasificado por imapsync"],
  [6, "proceso interrumpido por señal (imapsync)"],
  [7, "error relacionado con archivo de configuracion o rutas"],
  [8, "error de archivo PID o bloqueo de otra instancia"],
  [10, "fallo de conexion IMAP (generico, origen o destino)"],
  [12, "fallo TLS / certificado SSL en conexion IMAP"],
  [16, "fallo de autenticacion IMAP (generico)"],
  [21, "carpeta en origen (host1) no existe"],
  [101, "no se pudo conectar al servidor de origen (host1)"],
  [102, "no se pudo conectar al servidor de destino (host2)"],
  [111, "migracion terminada con errores parciales (mensajes o carpetas)"],
  [112, "demasiados errores durante la migracion (tope alcanzado)"],
  [113, "cuota de buzon excedida en destino (host2)"],
  [114, "error al escribir o anexar mensaje en destino (host2)"],
  [115, "error al leer o descargar desde origen (host1)"],
  [116, "error al crear carpeta (suele ser destino host2)"],
  [117, "error al seleccionar carpeta IMAP"],
  [118, "limite de transferencia de imapsync superado (--exitwhenover)"],
  [119, "mensaje rechazado en destino (p. ej. filtro o antivirus)"],
  [120, "error al aplicar FLAGS en mensajes"],
  [161, "login o credenciales rechazados en origen (host1)"],
  [162, "login o credenciales rechazados en destino (host2)"],
  [254, "fallo en pruebas internas de imapsync (modo test)"]
]);

function describeImapsyncExitCode(code) {
  if (code === 0) return "completado sin error";
  const n = Number(code);
  if (!Number.isFinite(n)) return "codigo de salida no numerico; revisa el detalle";
  if (IMAPSYNC_EXIT_HINT_ES.has(n)) {
    return IMAPSYNC_EXIT_HINT_ES.get(n);
  }
  if (n >= 128 && n < 192) {
    return "proceso terminado por señal del sistema o shell (codigo tipo 128+señal)";
  }
  return "causa no catalogada; revisa el detalle y la documentacion de imapsync para este codigo";
}

function imapsyncFailureSummary(code) {
  const n = Number(code);
  const hint = describeImapsyncExitCode(n);
  return `imapsync finalizo con error (${n}) — ${hint}`;
}

module.exports = {
  describeImapsyncExitCode,
  imapsyncFailureSummary,
  IMAPSYNC_EXIT_HINT_ES
};
