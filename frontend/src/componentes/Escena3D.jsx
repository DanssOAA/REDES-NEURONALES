import { useEffect, useRef, useState } from 'react'
import { MotorEscena } from '../escena/motor.js'
import { leerTema } from '../tema.js'

/** Envoltorio de React para el motor 3D (src/escena/motor.js). */
export default function Escena3D({ conectarMotor, tema, giro, encuadre }) {
  const caja = useRef(null)
  const etiquetas = useRef(null)
  const motor = useRef(null)
  const [sinWebGL, setSinWebGL] = useState(false)

  useEffect(() => {
    let creado
    try {
      creado = new MotorEscena(caja.current, etiquetas.current)
    } catch (error) {
      console.error(error)
      setSinWebGL(true)
      return undefined
    }
    motor.current = creado
    creado.setTema(leerTema())
    conectarMotor(creado)
    return () => {
      conectarMotor(null)
      creado.destruir()
      motor.current = null
    }
  }, [conectarMotor])

  useEffect(() => { motor.current?.setTema(leerTema()) }, [tema])
  useEffect(() => { motor.current?.setGiro(giro) }, [giro])
  useEffect(() => { if (encuadre) motor.current?.encuadrar() }, [encuadre])

  return (
    <div className="escena">
      <div
        ref={caja}
        className="escena-lienzo"
        role="img"
        aria-label="Red neuronal en tres dimensiones. Arrastra para girarla y usa la rueda para acercarte."
      />
      <div ref={etiquetas} className="escena-etiquetas" aria-hidden="true" />
      {sinWebGL && (
        <p className="escena-fallo">
          Este navegador no pudo iniciar los gráficos 3D (WebGL). Prueba con Chrome, Edge o
          Firefox actualizados, o activa la aceleración por hardware.
        </p>
      )}
    </div>
  )
}
