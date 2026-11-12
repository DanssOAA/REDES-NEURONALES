// MapaDecision.jsx - Qué clase asigna la red a cada zona del plano.
//
// El fondo es la opinión de la red en una rejilla de puntos (naranja = clase A,
// azul = clase B). Encima van los ejemplos de entrenamiento. Al pasar el
// cursor, ese punto se envía a la red y la escena 3D muestra cómo lo procesa.

import { useEffect, useRef } from 'react'
import { aRGB, leerTema } from '../tema.js'

const LIMITE = 1.15 // el mapa cubre de -1,15 a 1,15 en ambos ejes

export default function MapaDecision({ suscribir, datos, tema, alSondear, rejilla }) {
  const lienzo = useRef(null)
  const sonda = useRef(null)
  const ultimoEnvio = useRef(0)
  const redibujar = useRef(null)

  useEffect(() => {
    const canvas = lienzo.current
    const ctx = canvas.getContext('2d')
    const mini = document.createElement('canvas')
    mini.width = mini.height = rejilla
    const miniCtx = mini.getContext('2d')
    const imagen = miniCtx.createImageData(rejilla, rejilla)
    const colores = leerTema()
    const papel = aRGB(colores.hoja)
    const claseA = aRGB(colores.naranja)
    const claseB = aRGB(colores.azul)

    const dibujar = () => {
      const { frontera, puntos } = datos.current
      const escala = window.devicePixelRatio || 1
      const lado = canvas.clientWidth
      if (!lado) return
      if (canvas.width !== Math.round(lado * escala)) canvas.width = canvas.height = Math.round(lado * escala)
      ctx.setTransform(escala, 0, 0, escala, 0, 0)
      ctx.clearRect(0, 0, lado, lado)

      if (frontera?.length === rejilla * rejilla) {
        for (let fila = 0; fila < rejilla; fila++) {
          for (let col = 0; col < rejilla; col++) {
            const p = frontera[fila * rejilla + col]         // probabilidad de la clase B
            const tono = p >= 0.5 ? claseB : claseA
            const fuerza = Math.abs(p - 0.5) * 2 * 0.62
            const k = ((rejilla - 1 - fila) * rejilla + col) * 4 // la y crece hacia arriba
            imagen.data[k] = papel[0] + (tono[0] - papel[0]) * fuerza
            imagen.data[k + 1] = papel[1] + (tono[1] - papel[1]) * fuerza
            imagen.data[k + 2] = papel[2] + (tono[2] - papel[2]) * fuerza
            imagen.data[k + 3] = 255
          }
        }
        miniCtx.putImageData(imagen, 0, 0)
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(mini, 0, 0, lado, lado)
      }

      const aPixel = (v) => ((v + LIMITE) / (2 * LIMITE)) * lado
      if (puntos) {
        ctx.lineWidth = 1
        ctx.strokeStyle = colores.hoja
        for (const [x, y, clase] of puntos) {
          ctx.beginPath()
          ctx.arc(aPixel(x), lado - aPixel(y), 3.1, 0, Math.PI * 2)
          ctx.fillStyle = clase ? colores.azul : colores.naranja
          ctx.fill()
          ctx.stroke()
        }
      }
      if (sonda.current) {
        const [x, y] = sonda.current
        ctx.strokeStyle = colores.tinta
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(aPixel(x), lado - aPixel(y), 7, 0, Math.PI * 2)
        ctx.moveTo(aPixel(x) - 12, lado - aPixel(y)); ctx.lineTo(aPixel(x) + 12, lado - aPixel(y))
        ctx.moveTo(aPixel(x), lado - aPixel(y) - 12); ctx.lineTo(aPixel(x), lado - aPixel(y) + 12)
        ctx.stroke()
      }
    }

    dibujar()
    redibujar.current = dibujar
    const observador = new ResizeObserver(dibujar)
    observador.observe(canvas)
    const baja = suscribir(dibujar)
    return () => { baja(); observador.disconnect() }
  }, [suscribir, datos, tema, rejilla])

  const mover = (evento) => {
    const caja = lienzo.current.getBoundingClientRect()
    const x = ((evento.clientX - caja.left) / caja.width) * 2 * LIMITE - LIMITE
    const y = LIMITE - ((evento.clientY - caja.top) / caja.height) * 2 * LIMITE
    sonda.current = [Number(x.toFixed(3)), Number(y.toFixed(3))]
    redibujar.current?.()
    const ahora = performance.now()
    if (ahora - ultimoEnvio.current > 40) {
      ultimoEnvio.current = ahora
      alSondear(sonda.current)
    }
  }
  const salir = () => {
    sonda.current = null
    redibujar.current?.()
    alSondear(null)
  }

  return (
    <div className="mapa">
      <canvas
        ref={lienzo}
        className="mapa-lienzo"
        onPointerMove={mover}
        onPointerDown={mover}
        onPointerLeave={salir}
        role="img"
        aria-label="Mapa de decisión: zonas que la red asigna a cada clase, con los ejemplos de entrenamiento encima."
      />
      <p className="leyenda">
        <span className="punto punto-a" /> clase A
        <span className="punto punto-b" /> clase B
        <span className="leyenda-ayuda">Pasa el cursor: ese punto entra en la red.</span>
      </p>
    </div>
  )
}
