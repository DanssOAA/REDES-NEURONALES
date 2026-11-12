// GraficaAprendizaje.jsx - Pérdida y precisión a lo largo del entrenamiento.

const ANCHO = 300
const ALTO_CURVA = 58

function trazo(historial, columna, escalaX, escalaY) {
  let d = ''
  for (let i = 0; i < historial.length; i++) {
    d += `${i ? 'L' : 'M'}${escalaX(historial[i][0]).toFixed(1)} ${escalaY(historial[i][columna]).toFixed(1)}`
  }
  return d
}

function Curva({ titulo, valor, historial, columna, maximo, marcas, epocaMaxima, clase, meta }) {
  const escalaX = (epoca) => 2 + (epoca / epocaMaxima) * (ANCHO - 4)
  const escalaY = (v) => ALTO_CURVA - 2 - (Math.min(v, maximo) / maximo) * (ALTO_CURVA - 6)
  return (
    <figure className={'curva ' + clase}>
      <figcaption>
        <span>{titulo}</span>
        <strong>{valor}</strong>
      </figcaption>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO_CURVA}`} preserveAspectRatio="none" role="img" aria-label={`${titulo}: ${valor}`}>
        <line className="curva-base" x1="0" x2={ANCHO} y1={ALTO_CURVA - 1} y2={ALTO_CURVA - 1} />
        {meta != null && <line className="curva-meta" x1="0" x2={ANCHO} y1={escalaY(meta)} y2={escalaY(meta)} />}
        {marcas.map((marca, i) => (
          <line key={i} className="curva-marca" x1={escalaX(marca.epoca)} x2={escalaX(marca.epoca)} y1="0" y2={ALTO_CURVA} />
        ))}
        {historial.length > 1 && <path className="curva-linea" d={trazo(historial, columna, escalaX, escalaY)} />}
      </svg>
    </figure>
  )
}

export default function GraficaAprendizaje({ datos, estado }) {
  const { historial, marcas } = datos.current
  const { metricas, problema } = estado
  const epocaMaxima = Math.max(1, historial.length ? historial[historial.length - 1][0] : 1)
  let perdidaMaxima = 0.7
  for (const punto of historial) perdidaMaxima = Math.max(perdidaMaxima, punto[1])
  const capasNuevas = marcas.filter((m) => m.clase === 'capa_agregada')
  const porcentaje = (v) => (v == null ? 'sin datos' : `${(v * 100).toFixed(1).replace('.', ',')} %`)

  return (
    <div className="grafica">
      <Curva
        titulo="Precisión con ejemplos que no ha visto"
        valor={porcentaje(metricas.precision)}
        historial={historial} columna={2} maximo={1}
        marcas={capasNuevas} epocaMaxima={epocaMaxima}
        clase="curva-precision" meta={problema?.meta}
      />
      <Curva
        titulo="Pérdida (error medio)"
        valor={metricas.perdida == null ? 'sin datos' : metricas.perdida.toFixed(3).replace('.', ',')}
        historial={historial} columna={1} maximo={perdidaMaxima}
        marcas={capasNuevas} epocaMaxima={epocaMaxima}
        clase="curva-perdida"
      />
      <p className="grafica-pie">
        <span>Época {Math.floor(metricas.epoca).toLocaleString('es')}</span>
        {capasNuevas.length > 0 && <span className="leyenda-marca">capa añadida</span>}
        {problema?.meta && <span className="leyenda-meta">meta {Math.round(problema.meta * 100)} %</span>}
      </p>
    </div>
  )
}
