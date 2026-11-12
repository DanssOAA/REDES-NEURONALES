// App.jsx - Composición de la página.
//
//   cabecera            elegir problema, tema y tamaño de texto
//   PanelRed            capas, neuronas y forma de aprender
//   Escena3D            la red en tres dimensiones (el centro de todo)
//   Transporte          entrenar, pausar, un paso, velocidad
//   resultados          mapa de decisión o lienzo de dígitos, y la gráfica
//   PanelCodigo         el código real del backend para explicarlo en clase

import { useLayoutEffect, useState } from 'react'
import Escena3D from './componentes/Escena3D.jsx'
import GraficaAprendizaje from './componentes/GraficaAprendizaje.jsx'
import LienzoDigito from './componentes/LienzoDigito.jsx'
import MapaDecision from './componentes/MapaDecision.jsx'
import PanelCodigo from './componentes/PanelCodigo.jsx'
import PanelRed from './componentes/PanelRed.jsx'
import Transporte from './componentes/Transporte.jsx'
import { guardar, temaInicial } from './tema.js'
import { useEntrenador } from './useEntrenador.js'

const PROBLEMAS = [
  { id: 'lineal', nombre: 'Lineal', pista: 'Dos grupos que separa una recta. Basta una capa.' },
  { id: 'xor', nombre: 'XOR', pista: 'Esquinas opuestas comparten clase. Ninguna recta las separa.' },
  { id: 'circulos', nombre: 'Círculos', pista: 'Un grupo rodea al otro. Hace falta una capa oculta.' },
  { id: 'espiral', nombre: 'Espiral', pista: 'Dos brazos enroscados. Pide varias capas.' },
  { id: 'digitos', nombre: 'Dígitos', pista: 'Números escritos a mano en 8 × 8 píxeles. Dibuja el tuyo.' },
]

const porciento = (v) => `${Math.round(v * 100)} %`

/** Una frase que cuenta lo que está pasando, pensada para leerla en voz alta. */
function narrar(estado) {
  const { conectado, capas, metricas, fase, aviso, entrenando, problema } = estado
  if (!conectado || !problema) {
    return 'Buscando el backend de Python. Ejecuta iniciar.ps1 y esta página se conectará sola.'
  }
  const ocultas = capas.length - 2
  if (fase === 1) return 'Paso 1 de 4. Un ejemplo entra en la red y la señal avanza hasta la salida.'
  if (fase === 2) return `Paso 2 de 4. Se mide el error de la predicción: la pérdida es ${metricas.perdida?.toFixed(3).replace('.', ',')}.`
  if (fase === 3) return 'Paso 3 de 4. El error vuelve hacia atrás y reparte la culpa entre los pesos.'
  if (fase === 4) return 'Paso 4 de 4. Cada peso se corrige un poco. Mira qué hilos cambian de grosor.'

  if (aviso && Date.now() - aviso.momento < 7000) {
    if (aviso.clase === 'capa_agregada') {
      return (aviso.automatica ? 'La red dejó de mejorar y ganó la' : 'Nueva') +
        ` capa oculta ${aviso.indice}. Las capas anteriores conservan lo aprendido.`
    }
    return 'Capa quitada. La salida vuelve a conectarse y empieza de cero.'
  }

  const precision = metricas.precision ?? 0
  if (metricas.paso === 0) {
    return ocultas === 0
      ? 'Una sola capa: cada entrada va directa a la salida. Pulsa Entrenar.'
      : `Red de ${ocultas + 1} capas con pesos al azar. Pulsa Entrenar.`
  }
  if (precision >= problema.meta) {
    return `Problema resuelto: acierta el ${porciento(precision)} de ejemplos que nunca vio.`
  }
  if (ocultas === 0 && metricas.epoca > 25) {
    return problema.es_2d
      ? `Una sola capa solo traza una frontera recta: se queda en el ${porciento(precision)}. Añade una capa oculta.`
      : `Una sola capa llega al ${porciento(precision)}. Añade una capa oculta para afinar.`
  }
  const forma = ocultas === 0 ? 'una sola capa' : `${ocultas} ${ocultas === 1 ? 'capa oculta' : 'capas ocultas'}`
  return `${entrenando ? 'Entrenando' : 'En pausa'} con ${forma}: acierta el ${porciento(precision)}.`
}

export default function App() {
  const { estado, acciones, suscribir, conectarMotor, datos } = useEntrenador()
  const [tema, setTema] = useState(temaInicial)
  const [textoGrande, setTextoGrande] = useState(() => document.documentElement.dataset.texto === 'grande')
  const [giro, setGiro] = useState(false)
  const [encuadre, setEncuadre] = useState(0)
  const [modoCodigo, setModoCodigo] = useState('normal')

  useLayoutEffect(() => {
    document.documentElement.dataset.tema = tema
    guardar('tema', tema)
  }, [tema])

  useLayoutEffect(() => {
    document.documentElement.dataset.texto = textoGrande ? 'grande' : 'normal'
    guardar('texto', textoGrande ? 'grande' : 'normal')
  }, [textoGrande])

  const { conectado, config, problema } = estado
  const elegido = PROBLEMAS.find((p) => p.id === config.problema)
  const es2d = problema?.es_2d !== false

  return (
    <div className={'app app-codigo-' + modoCodigo}>
      <header className="cabecera">
        <h1 className="marca">Capa a capa</h1>

        <nav className="problemas" aria-label="Problema que aprende la red">
          <div className="segmentos">
            {PROBLEMAS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={config.problema === p.id}
                disabled={!conectado}
                onClick={() => acciones.elegirProblema(p.id)}
              >
                {p.nombre}
              </button>
            ))}
          </div>
          <p className="problema-pista">{elegido?.pista}</p>
        </nav>

        <div className="cabecera-ajustes">
          <span className={'conexion ' + (conectado ? 'conexion-ok' : 'conexion-no')} role="status">
            {conectado ? 'Python conectado' : 'Sin backend'}
          </span>
          <button type="button" className="boton boton-discreto" aria-pressed={textoGrande} onClick={() => setTextoGrande(!textoGrande)}>
            Texto grande
          </button>
          <button type="button" className="boton boton-discreto" onClick={() => setTema(tema === 'claro' ? 'oscuro' : 'claro')}>
            {tema === 'claro' ? 'Modo oscuro' : 'Modo claro'}
          </button>
        </div>
      </header>

      <PanelRed estado={estado} acciones={acciones} />

      <main className="escenario">
        <p className={'narrador' + (estado.fase ? ' narrador-fase' : '')} aria-live="polite">
          <span>{narrar(estado)}</span>
        </p>
        <Escena3D conectarMotor={conectarMotor} tema={tema} giro={giro} encuadre={encuadre} />
        <Transporte
          estado={estado}
          acciones={acciones}
          giro={giro}
          alGirar={() => setGiro(!giro)}
          alEncuadrar={() => setEncuadre(encuadre + 1)}
        />
      </main>

      <aside className="panel panel-resultados" aria-label="Resultados">
        <section>
          <h2>{es2d ? 'Lo que ha aprendido' : 'Ponla a prueba'}</h2>
          {es2d ? (
            <MapaDecision
              key={config.problema + tema}
              suscribir={suscribir}
              datos={datos}
              tema={tema}
              rejilla={problema?.rejilla || 36}
              alSondear={acciones.sondear}
            />
          ) : (
            <LienzoDigito
              muestra={estado.muestra}
              clases={problema?.clases}
              alSondear={acciones.sondear}
              tema={tema}
            />
          )}
        </section>
        <section>
          <h2>Cómo va</h2>
          <GraficaAprendizaje datos={datos} estado={estado} />
        </section>
      </aside>

      <PanelCodigo conectado={conectado} fase={estado.fase} modo={modoCodigo} alCambiarModo={setModoCodigo} />
    </div>
  )
}
