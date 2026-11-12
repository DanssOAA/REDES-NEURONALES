// tema.js - Los colores viven en estilos.css como variables. Aquí se leen
// para usarlos donde el CSS no llega: la escena 3D y los lienzos 2D.

const NOMBRES = ['papel', 'hoja', 'tinta', 'tinta-suave', 'azul', 'naranja', 'neutro', 'resaltador', 'regla']

export function leerTema() {
  const estilo = getComputedStyle(document.documentElement)
  const tema = {}
  for (const nombre of NOMBRES) {
    const clave = nombre.replace(/-(\w)/g, (_, letra) => letra.toUpperCase())
    tema[clave] = estilo.getPropertyValue('--' + nombre).trim()
  }
  return tema
}

export function temaInicial() {
  const guardado = document.documentElement.dataset.tema
  if (guardado === 'claro' || guardado === 'oscuro') return guardado
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export function guardar(clave, valor) {
  try {
    localStorage.setItem('capa-a-capa:' + clave, valor)
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura lo que dure la pestaña.
  }
}

/** '#1e5bd8' -> [30, 91, 216] */
export function aRGB(hex) {
  const limpio = hex.replace('#', '')
  const n = parseInt(limpio.length === 3 ? limpio.replace(/./g, '$&$&') : limpio, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
