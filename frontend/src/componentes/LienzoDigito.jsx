// LienzoDigito.jsx - Dibuja un dígito y mira cómo lo lee la red.
//
// El dibujo se reduce a 8 x 8 píxeles igual que los datos de entrenamiento:
// se recorta, se escala a 32 x 32 y se promedia en bloques de 4 x 4.

import { useEffect, useRef, useState } from 'react'

const LADO = 200

// Se leen los píxeles a menudo: se le avisa al navegador para que lo optimice.
const contexto = (canvas) => canvas.getContext('2d', { willReadFrequently: true })

function reducir(canvas) {
  const ctx = contexto(canvas)
  const { data } = ctx.getImageData(0, 0, LADO, LADO)
  let x0 = LADO, y0 = LADO, x1 = -1, y1 = -1
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      if (data[(y * LADO + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null

  // Recorte centrado y a escala uniforme dentro de 32 x 32.
  const ancho = x1 - x0 + 1
  const alto = y1 - y0 + 1
  const escala = 30 / Math.max(ancho, alto, 60)
  const medio = document.createElement('canvas')
  medio.width = medio.height = 32
  const m = medio.getContext('2d', { willReadFrequently: true })
  m.imageSmoothingEnabled = true
  m.drawImage(canvas, x0, y0, ancho, alto, (32 - ancho * escala) / 2, (32 - alto * escala) / 2, ancho * escala, alto * escala)
  const pixeles = m.getImageData(0, 0, 32, 32).data

  const salida = []
  for (let fila = 0; fila < 8; fila++) {
    for (let col = 0; col < 8; col++) {
      let suma = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) suma += pixeles[((fila * 4 + dy) * 32 + col * 4 + dx) * 4 + 3]
      }
      salida.push(Number(Math.min(1, (suma / (16 * 255)) * 1.35).toFixed(3)))
    }
  }
  return salida
}

export default function LienzoDigito({ muestra, clases, alSondear, tema }) {
  const lienzo = useRef(null)
  const vista = useRef(null)
  const trazando = useRef(false)
  const ultimoEnvio = useRef(0)
  const [hayDibujo, setHayDibujo] = useState(false)

  // Lo que la red tiene delante ahora mismo, en sus 8 x 8 píxeles reales.
  useEffect(() => {
    const canvas = vista.current
    if (!canvas || !muestra?.entrada || muestra.entrada.length !== 64) return
    const ctx = canvas.getContext('2d')
    const estilo = getComputedStyle(document.documentElement)
    ctx.clearRect(0, 0, 8, 8)
    ctx.fillStyle = estilo.getPropertyValue('--azul')
    muestra.entrada.forEach((valor, i) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, valor))
      ctx.fillRect(i % 8, Math.floor(i / 8), 1, 1)
    })
    ctx.globalAlpha = 1
  }, [muestra, tema])

  const enviar = (forzar) => {
    const ahora = performance.now()
    if (!forzar && ahora - ultimoEnvio.current < 70) return
    ultimoEnvio.current = ahora
    alSondear(reducir(lienzo.current))
  }

  const posicion = (evento) => {
    const caja = lienzo.current.getBoundingClientRect()
    return [((evento.clientX - caja.left) / caja.width) * LADO, ((evento.clientY - caja.top) / caja.height) * LADO]
  }
  const empezar = (evento) => {
    evento.preventDefault()
    lienzo.current.setPointerCapture(evento.pointerId)
    trazando.current = true
    const ctx = contexto(lienzo.current)
    const [x, y] = posicion(evento)
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--tinta')
    ctx.lineWidth = 22
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.01, y)
    ctx.stroke()
    setHayDibujo(true)
  }
  const trazar = (evento) => {
    if (!trazando.current) return
    const ctx = contexto(lienzo.current)
    const [x, y] = posicion(evento)
    ctx.lineTo(x, y)
    ctx.stroke()
    enviar(false)
  }
  const terminar = () => {
    if (!trazando.current) return
    trazando.current = false
    enviar(true)
  }
  const borrar = () => {
    contexto(lienzo.current).clearRect(0, 0, LADO, LADO)
    setHayDibujo(false)
    alSondear(null)
  }

  const probabilidades = muestra?.probabilidades || []
  const prediccion = muestra?.prediccion
  const acierta = muestra?.etiqueta === prediccion

  return (
    <div className="digito">
      <div className="digito-fila">
        <div className="digito-dibujo">
          <canvas
            ref={lienzo}
            width={LADO}
            height={LADO}
            className="digito-lienzo"
            onPointerDown={empezar}
            onPointerMove={trazar}
            onPointerUp={terminar}
            onPointerCancel={terminar}
            role="img"
            aria-label="Zona para dibujar un dígito con el ratón o el dedo"
          />
          {!hayDibujo && <span className="digito-pista">Dibuja aquí un número</span>}
        </div>
        <div className="digito-lado">
          <canvas ref={vista} width="8" height="8" className="digito-vista" aria-hidden="true" />
          <span className="nota">Así lo ve la red: 8 × 8 píxeles</span>
          <button type="button" className="boton" onClick={borrar} disabled={!hayDibujo}>
            Borrar dibujo
          </button>
        </div>
      </div>

      <p className="digito-veredicto">
        {muestra?.es_sonda
          ? <>Tu dibujo. La red lee un <strong>{clases?.[prediccion]}</strong>.</>
          : <>
              Ejemplo de prueba: es un <strong>{clases?.[muestra?.etiqueta]}</strong>. La red lee
              un <strong className={acierta ? 'bien' : 'mal'}>{clases?.[prediccion]}</strong>
              {acierta ? ', acierta.' : ', falla.'}
            </>}
      </p>

      <ol className="barras" aria-label="Probabilidad que la red da a cada dígito">
        {probabilidades.map((p, i) => (
          <li key={i} className={i === prediccion ? 'gana' : ''}>
            <span>{clases?.[i]}</span>
            <span className="barra"><span style={{ width: `${Math.round(p * 100)}%` }} /></span>
            <span className="barra-valor">{Math.round(p * 100)} %</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
