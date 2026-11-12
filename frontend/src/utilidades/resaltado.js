// resaltado.js - Coloreado de sintaxis de Python, lo justo para leer bien en clase.
// Devuelve el código separado en líneas, y cada línea en trozos { tipo, texto }.

const PATRON = new RegExp(
  [
    /("""[\s\S]*?"""|'''[\s\S]*?''')/, // doc: cadenas de documentación
    /(#[^\n]*)/, // com: comentarios
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/, // cad: cadenas
    /(^[ \t]*@\w+)/, // dec: decoradores
    /\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/, // num: números
    /\b(def|class|return|for|in|if|else|elif|import|from|as|while|not|and|or|is|lambda|with|pass|raise|try|except|break|continue)\b/, // cla: palabras clave
    /\b(None|True|False|self)\b/, // con: constantes
    /([A-Za-z_]\w*)(?=\()/, // fun: llamadas y definiciones
    /(@|\*\*|[-+*/=<>]=?|!=)/, // ope: operadores (el @ es el producto de matrices)
  ]
    .map((r) => r.source)
    .join('|'),
  'gm',
)

const TIPOS = ['doc', 'com', 'cad', 'dec', 'num', 'cla', 'con', 'fun', 'ope']

export function resaltar(codigo) {
  const lineas = [[]]
  const agregar = (tipo, texto) => {
    const partes = texto.split('\n')
    partes.forEach((parte, i) => {
      if (i > 0) lineas.push([])
      if (parte) lineas[lineas.length - 1].push({ tipo, texto: parte })
    })
  }
  let cursor = 0
  for (const hallazgo of codigo.matchAll(PATRON)) {
    if (hallazgo.index > cursor) agregar('', codigo.slice(cursor, hallazgo.index))
    const grupo = hallazgo.slice(1).findIndex((valor) => valor !== undefined)
    agregar(TIPOS[grupo], hallazgo[0])
    cursor = hallazgo.index + hallazgo[0].length
  }
  if (cursor < codigo.length) agregar('', codigo.slice(cursor))
  return lineas
}
