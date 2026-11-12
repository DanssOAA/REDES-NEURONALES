// disposicion.js - Dónde va cada neurona en el espacio.
//
// Las capas se reparten de izquierda a derecha (eje X). Dentro de una capa,
// las neuronas forman una rejilla vertical: filas en Y, columnas en Z.
// Por eso los 64 píxeles de un dígito se ven como una imagen de 8 x 8.

export const SEPARACION = 3.4 // distancia entre una capa y la siguiente

function columnas(n, tipo) {
  if (tipo === 'salida' || n <= 5) return 1
  const raiz = Math.sqrt(n)
  // Busca una rejilla exacta y no demasiado alargada: 8 -> 2x4, 16 -> 4x4, 64 -> 8x8.
  for (let c = Math.floor(raiz); c >= Math.ceil(raiz / 2); c--) {
    if (n % c === 0) return c
  }
  return Math.ceil(raiz)
}

export function disponerCapa(n, tipo) {
  const cols = columnas(n, tipo)
  const filas = Math.ceil(n / cols)
  const paso = n > 40 ? 0.56 : n > 6 ? 0.68 : 0.92
  const radio = n > 40 ? 0.15 : n > 6 ? 0.185 : 0.23
  const y = new Float32Array(n)
  const z = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const fila = Math.floor(i / cols)
    const col = i % cols
    y[i] = ((filas - 1) / 2 - fila) * paso
    z[i] = (col - (cols - 1) / 2) * paso
  }
  return { y, z, radio, alto: (filas - 1) * paso, ancho: (cols - 1) * paso }
}

export function posicionX(indice, totalCapas) {
  return (indice - (totalCapas - 1) / 2) * SEPARACION
}
