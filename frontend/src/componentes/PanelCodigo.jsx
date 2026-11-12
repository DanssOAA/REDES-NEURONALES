// PanelCodigo.jsx - El código real del backend, listo para explicarlo en clase.
//
// Los fragmentos llegan de /api/codigo, que los lee del propio código en
// ejecución. Las líneas clave van marcadas con rotulador y numeradas; cada
// número tiene su explicación al lado.

import { useEffect, useMemo, useState } from 'react'
import { resaltar } from '../utilidades/resaltado.js'

const POR_FASE = ['adelante', 'perdida', 'atras', 'actualizar']

export default function PanelCodigo({ conectado, fase, modo, alCambiarModo }) {
  const [fragmentos, setFragmentos] = useState(null)
  const [fallo, setFallo] = useState(false)
  const [activo, setActivo] = useState('adelante')
  const [letra, setLetra] = useState(0)        // pasos de tamaño de letra: -1 a 4
  const [enfocada, setEnfocada] = useState(null)

  useEffect(() => {
    if (fragmentos || !conectado) return undefined
    let vigente = true
    fetch('/api/codigo')
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(respuesta.status)))
      .then((lista) => { if (vigente) { setFragmentos(lista); setFallo(false) } })
      .catch(() => { if (vigente) setFallo(true) })
    return () => { vigente = false }
  }, [conectado, fragmentos])

  // Durante "Un paso", el panel acompaña a la fase que se está viendo en 3D.
  useEffect(() => {
    if (fase >= 1 && fase <= 4) setActivo(POR_FASE[fase - 1])
  }, [fase])

  const fragmento = fragmentos?.find((f) => f.id === activo)

  const lineas = useMemo(() => {
    if (!fragmento) return []
    const crudas = fragmento.codigo.split('\n')
    return resaltar(fragmento.codigo).map((trozos, i) => ({
      trozos,
      numero: fragmento.linea + i,
      clave: fragmento.claves.findIndex((c) => crudas[i].includes(c.buscar)),
    }))
  }, [fragmento])

  const oculto = modo === 'oculto'

  return (
    <section className={'codigo codigo-' + modo} aria-label="Código del backend">
      <header className="codigo-cabecera">
        <h2>El código real</h2>
        <div className="pestanas" role="tablist" aria-label="Fragmentos de código">
          {(fragmentos || []).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={f.id === activo}
              className={f.paso && f.paso === fase ? 'en-curso' : ''}
              onClick={() => { setActivo(f.id); if (oculto) alCambiarModo('normal') }}
            >
              {f.paso && <span className="pestana-paso">{f.paso}</span>}
              {f.titulo}
            </button>
          ))}
        </div>
        <div className="codigo-mandos">
          <button type="button" className="boton boton-discreto" aria-label="Letra más pequeña" disabled={letra <= -1} onClick={() => setLetra(letra - 1)}>A−</button>
          <button type="button" className="boton boton-discreto" aria-label="Letra más grande" disabled={letra >= 4} onClick={() => setLetra(letra + 1)}>A+</button>
          <button type="button" className="boton boton-discreto" onClick={() => alCambiarModo(modo === 'amplio' ? 'normal' : 'amplio')}>
            {modo === 'amplio' ? 'Reducir' : 'Ampliar'}
          </button>
          <button type="button" className="boton boton-discreto" aria-expanded={!oculto} onClick={() => alCambiarModo(oculto ? 'normal' : 'oculto')}>
            {oculto ? 'Mostrar' : 'Ocultar'}
          </button>
        </div>
      </header>

      {!oculto && (
        <div className="codigo-cuerpo" style={{ '--letra-codigo': `${0.86 + letra * 0.13}rem` }}>
          {!fragmento && (
            <p className="codigo-vacio">
              {fallo
                ? 'No se pudo leer el código del backend. Comprueba que el servidor de Python sigue en marcha y recarga la página.'
                : 'El código aparecerá aquí en cuanto la web conecte con el backend de Python.'}
            </p>
          )}

          {fragmento && (
            <>
              <div className="codigo-fuente" role="tabpanel">
                <p className="codigo-archivo">
                  {fragmento.archivo}, desde la línea {fragmento.linea}
                </p>
                <pre tabIndex={0}>
                  <code>
                    {lineas.map((linea, i) => (
                      <span
                        key={i}
                        className={
                          'linea' + (linea.clave >= 0 ? ' linea-clave' : '') +
                          (linea.clave >= 0 && linea.clave === enfocada ? ' linea-enfocada' : '')
                        }
                        onMouseEnter={() => linea.clave >= 0 && setEnfocada(linea.clave)}
                        onMouseLeave={() => setEnfocada(null)}
                      >
                        <span className="linea-numero">{linea.numero}</span>
                        <span className="linea-marca">{linea.clave >= 0 ? linea.clave + 1 : ''}</span>
                        <span className="linea-texto">
                          {linea.trozos.length === 0
                            ? ' '
                            : linea.trozos.map((trozo, j) => (
                                <span key={j} className={trozo.tipo ? 'r-' + trozo.tipo : undefined}>{trozo.texto}</span>
                              ))}
                        </span>
                      </span>
                    ))}
                  </code>
                </pre>
              </div>

              <div className="codigo-notas">
                <p className="codigo-idea">{fragmento.idea}</p>
                {fragmento.claves.length > 0 && (
                  <ol>
                    {fragmento.claves.map((clave, i) => (
                      <li
                        key={i}
                        className={enfocada === i ? 'nota-enfocada' : ''}
                        onMouseEnter={() => setEnfocada(i)}
                        onMouseLeave={() => setEnfocada(null)}
                      >
                        <span className="nota-numero">{i + 1}</span>
                        <span>{clave.nota}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
