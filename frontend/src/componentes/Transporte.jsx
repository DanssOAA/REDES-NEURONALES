// Transporte.jsx - Los mandos del entrenamiento, bajo la escena.

const NOMBRES_VELOCIDAD = ['', 'Muy lenta', 'Lenta', 'Normal', 'Rápida', 'Muy rápida']

export default function Transporte({ estado, acciones, giro, alGirar, alEncuadrar }) {
  const { conectado, entrenando, config, fase } = estado
  const enFases = fase > 0

  return (
    <div className="transporte" role="toolbar" aria-label="Entrenamiento">
      <button
        type="button"
        className="boton boton-principal"
        disabled={!conectado}
        onClick={entrenando ? acciones.pausar : acciones.entrenar}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          {entrenando
            ? <path d="M3 2h4v12H3zM9 2h4v12H9z" fill="currentColor" />
            : <path d="M3 1.5v13l11-6.5z" fill="currentColor" />}
        </svg>
        {entrenando ? 'Pausar' : 'Entrenar'}
      </button>

      <button type="button" className="boton" disabled={!conectado || enFases} onClick={acciones.darUnPaso}>
        Un paso
      </button>

      <button type="button" className="boton" disabled={!conectado} onClick={acciones.reiniciarPesos}>
        Reiniciar pesos
      </button>

      <label className="velocidad">
        <span>Velocidad: {NOMBRES_VELOCIDAD[config.velocidad].toLowerCase()}</span>
        <input
          type="range"
          min="1"
          max="5"
          step="1"
          value={config.velocidad}
          disabled={!conectado}
          onChange={(e) => acciones.ajustar({ velocidad: Number(e.target.value) })}
        />
      </label>

      <span className="transporte-vista">
        <button type="button" className="boton boton-discreto" aria-pressed={giro} onClick={alGirar}>
          Girar
        </button>
        <button type="button" className="boton boton-discreto" onClick={alEncuadrar}>
          Encuadrar
        </button>
      </span>
    </div>
  )
}
