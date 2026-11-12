// PanelRed.jsx - La forma de la red (capas y neuronas) y cómo aprende.

const ACTIVACIONES = [
  { id: 'relu', nombre: 'ReLU' },
  { id: 'tanh', nombre: 'tanh' },
  { id: 'sigmoide', nombre: 'Sigmoide' },
]
const OPTIMIZADORES = [
  { id: 'adam', nombre: 'Adam', tasa: 0.02 },
  { id: 'sgd', nombre: 'Descenso simple', tasa: 0.3 },
]

// El deslizador de la tasa va en escala logarítmica: de 0,001 a 1.
const aDeslizador = (tasa) => Math.round((Math.log10(tasa) + 3) * 20)
const aTasa = (valor) => Number((10 ** (valor / 20 - 3)).toPrecision(2))

export default function PanelRed({ estado, acciones }) {
  const { capas, config, problema, limites, parametros, conectado } = estado
  const ocultas = capas.slice(1, -1)
  const nuevas = problema?.neuronas_nuevas ?? 8
  const entradaTexto = problema?.es_2d === false
    ? '64 píxeles de la imagen'
    : 'las coordenadas x, y'

  return (
    <aside className="panel panel-red" aria-label="La red y cómo aprende">
      <section>
        <h2>La red</h2>
        <ol className="capas">
          <li className="capa capa-fija">
            <span className="capa-nombre">Entrada</span>
            <span className="capa-detalle">{capas[0]} valores: {entradaTexto}</span>
          </li>

          {ocultas.map((neuronas, indice) => (
            <li className="capa" key={indice}>
              <span className="capa-nombre">Oculta {indice + 1}</span>
              <span className="contador">
                <button
                  type="button"
                  aria-label={`Quitar una neurona de la capa oculta ${indice + 1}`}
                  disabled={!conectado || neuronas <= 1}
                  onClick={() => acciones.cambiarNeuronas(indice, neuronas - 1)}
                >
                  −
                </button>
                <output aria-label="Neuronas">{neuronas}</output>
                <button
                  type="button"
                  aria-label={`Añadir una neurona a la capa oculta ${indice + 1}`}
                  disabled={!conectado || neuronas >= limites.neuronas}
                  onClick={() => acciones.cambiarNeuronas(indice, neuronas + 1)}
                >
                  +
                </button>
              </span>
              {indice === ocultas.length - 1 && (
                <button type="button" className="enlace" disabled={!conectado} onClick={acciones.quitarCapa}>
                  Quitar capa
                </button>
              )}
            </li>
          ))}

          <li className="capa capa-nueva">
            <button
              type="button"
              className="boton boton-linea"
              disabled={!conectado || ocultas.length >= limites.ocultas}
              onClick={acciones.agregarCapa}
            >
              Añadir capa oculta
            </button>
            <span className="capa-detalle">
              {ocultas.length >= limites.ocultas
                ? `Máximo de ${limites.ocultas} capas ocultas`
                : `${nuevas} neuronas, antes de la salida`}
            </span>
          </li>

          <li className="capa capa-fija">
            <span className="capa-nombre">Salida</span>
            <span className="capa-detalle">
              {capas[capas.length - 1]} clases: {problema?.es_2d === false ? 'del 0 al 9' : 'A o B'}
            </span>
          </li>
        </ol>
        <p className="nota">
          {ocultas.length === 0
            ? 'Ahora es una red de una sola capa. '
            : `${ocultas.length + 1} capas de pesos. `}
          Tiene {parametros.toLocaleString('es')} números que ajustar.
        </p>
      </section>

      <section>
        <h2>Cómo aprende</h2>

        <label className="interruptor">
          <input
            type="checkbox"
            checked={config.auto_crecer}
            disabled={!conectado}
            onChange={(e) => acciones.ajustar({ auto_crecer: e.target.checked })}
          />
          <span>
            <strong>Crecer sola</strong>
            Añade una capa cuando deja de mejorar
          </span>
        </label>

        <div className="campo">
          <span className="campo-nombre" id="rotulo-activacion">Activación de las capas ocultas</span>
          <div className="segmentos" role="group" aria-labelledby="rotulo-activacion">
            {ACTIVACIONES.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={config.activacion === a.id}
                disabled={!conectado}
                onClick={() => acciones.ajustar({ activacion: a.id })}
              >
                {a.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <span className="campo-nombre" id="rotulo-optimizador">Regla para corregir los pesos</span>
          <div className="segmentos" role="group" aria-labelledby="rotulo-optimizador">
            {OPTIMIZADORES.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={config.optimizador === o.id}
                disabled={!conectado}
                onClick={() => acciones.ajustar({ optimizador: o.id, tasa: o.tasa })}
              >
                {o.nombre}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <label className="campo-nombre" htmlFor="tasa">
            Tasa de aprendizaje <output>{String(config.tasa).replace('.', ',')}</output>
          </label>
          <input
            id="tasa"
            type="range"
            min="0"
            max="60"
            step="1"
            value={aDeslizador(config.tasa)}
            disabled={!conectado}
            onChange={(e) => acciones.ajustar({ tasa: aTasa(Number(e.target.value)) })}
          />
          <div className="escala"><span>pasos cortos</span><span>pasos largos</span></div>
        </div>
      </section>
    </aside>
  )
}
