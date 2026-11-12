// useEntrenador.js - El puente entre la web y el backend de Python.
//
// Abre el WebSocket, traduce los mensajes que llegan en estado de React
// (para los paneles) y en llamadas directas al motor 3D (para que la
// escena no dependa de los redibujados de React), y ofrece las acciones
// que disparan los botones.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const DURACION_FASE = 900 // ms que dura cada fase de "Un paso"
const MAX_HISTORIAL = 900

const INICIAL = {
  conectado: false,
  entrenando: false,
  capas: [2, 2],
  config: { problema: 'espiral', activacion: 'relu', optimizador: 'adam', tasa: 0.02, velocidad: 3, auto_crecer: false },
  problema: null,
  parametros: 0,
  limites: { ocultas: 5, neuronas: 32 },
  metricas: { paso: 0, epoca: 0, perdida: null, precision: null, precisionEntrenamiento: null },
  muestra: null,
  fase: 0,          // 0 = ninguna; 1..4 = fase del paso detallado
  aviso: null,      // último evento (capa añadida o quitada)
  version: 0,       // sube cada vez que cambia el historial
}

export function useEntrenador() {
  const [estado, setEstado] = useState(INICIAL)
  const interno = useRef({
    ws: null, motor: null, oyentes: new Set(), temporizadores: [],
    historial: [], marcas: [], puntos: null, frontera: null, muestra: null,
    idMuestra: null, enFases: false, cerrado: false, ultimoEstado: null,
  })

  const notificar = useCallback((tipo) => {
    for (const oyente of interno.current.oyentes) oyente(tipo, interno.current)
  }, [])

  const anotarHistorial = useCallback((m) => {
    const r = interno.current
    const ultimo = r.historial[r.historial.length - 1]
    if (ultimo && ultimo[0] === m.epoca) return
    r.historial.push([m.epoca, m.perdida, m.precision])
    if (r.historial.length > MAX_HISTORIAL) {
      r.historial = r.historial.filter((_, i) => i % 2 === 0 || i === r.historial.length - 1)
    }
  }, [])

  const metricasDe = (m) => ({
    paso: m.paso, epoca: m.epoca, perdida: m.perdida,
    precision: m.precision, precisionEntrenamiento: m.precision_entrenamiento,
  })

  const aplicarMuestra = useCallback((muestra, conPulso) => {
    const r = interno.current
    r.muestra = muestra
    r.motor?.setActivaciones(muestra.activaciones)
    if (conPulso && muestra.id !== r.idMuestra && !muestra.es_sonda) r.motor?.pulso(1)
    r.idMuestra = muestra.id
  }, [])

  const recibir = useCallback((m) => {
    const r = interno.current

    if (m.tipo === 'estado') {
      const reinicio = ['inicio', 'configurar', 'reiniciar'].includes(m.motivo)
      const cortarFases = reinicio || m.entrenando
      if (reinicio) {
        r.historial = []
        r.marcas = []
      }
      if (cortarFases) {
        r.temporizadores.forEach(clearTimeout)
        r.enFases = false
      }
      r.ultimoEstado = m
      r.puntos = m.puntos || null
      r.frontera = m.frontera || null
      r.motor?.setEstructura(m.capas, { clases: m.problema.clases, nombresEntrada: m.problema.nombres_entrada })
      r.motor?.setPesos(m.pesos)
      aplicarMuestra(m.muestra, false)
      anotarHistorial(m)
      setEstado((e) => ({
        ...e,
        entrenando: m.entrenando, capas: m.capas, config: m.config, problema: m.problema,
        parametros: m.parametros, limites: m.limites, metricas: metricasDe(m), muestra: m.muestra,
        fase: cortarFases ? 0 : e.fase, aviso: reinicio ? null : e.aviso, version: e.version + 1,
      }))
      notificar('estado')
    } else if (m.tipo === 'cuadro') {
      r.frontera = m.frontera || null
      r.motor?.setPesos(m.pesos)
      aplicarMuestra(m.muestra, true)
      anotarHistorial(m)
      setEstado((e) => ({ ...e, metricas: metricasDe(m), muestra: m.muestra, version: e.version + 1 }))
      notificar('cuadro')
    } else if (m.tipo === 'evento') {
      r.marcas.push({ epoca: m.epoca, clase: m.clase })
      setEstado((e) => ({ ...e, aviso: { ...m, momento: Date.now() } }))
    } else if (m.tipo === 'muestra') {
      aplicarMuestra(m.muestra, false)
      setEstado((e) => ({ ...e, muestra: m.muestra }))
      notificar('muestra')
    } else if (m.tipo === 'paso_detallado') {
      // Un solo lote explicado en cuatro tiempos, al ritmo de una clase.
      r.enFases = true
      const en = (fase, accion) => {
        r.temporizadores.push(setTimeout(() => {
          accion?.()
          setEstado((e) => ({ ...e, fase }))
        }, (fase === 0 ? 4 : fase - 1) * DURACION_FASE))
      }
      r.temporizadores.forEach(clearTimeout)
      r.temporizadores = []
      setEstado((e) => ({ ...e, muestra: m.muestra, metricas: { ...e.metricas, perdida: m.perdida_antes } }))
      en(1, () => { aplicarMuestra(m.muestra, false); r.motor?.pulso(1); notificar('muestra') })
      en(2)
      en(3, () => r.motor?.pulso(-1))
      en(4, () => {
        r.frontera = m.frontera || null
        r.motor?.setPesos(m.pesos)
        anotarHistorial(m)
        setEstado((e) => ({ ...e, metricas: metricasDe(m), version: e.version + 1 }))
        notificar('cuadro')
      })
      en(0, () => { r.enFases = false })
    }
  }, [anotarHistorial, aplicarMuestra, notificar])

  // Conexión, con reintento automático si el backend aún no ha arrancado.
  useEffect(() => {
    const r = interno.current
    r.cerrado = false
    let reintento
    const conectar = () => {
      const protocolo = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${protocolo}://${location.host}/ws`)
      r.ws = ws
      ws.onopen = () => setEstado((e) => ({ ...e, conectado: true }))
      ws.onmessage = (evento) => recibir(JSON.parse(evento.data))
      ws.onclose = () => {
        setEstado((e) => ({ ...e, conectado: false, entrenando: false }))
        if (!r.cerrado) reintento = setTimeout(conectar, 1500)
      }
      ws.onerror = () => ws.close()
    }
    conectar()
    return () => {
      r.cerrado = true
      clearTimeout(reintento)
      r.temporizadores.forEach(clearTimeout)
      r.ws?.close()
    }
  }, [recibir])

  const acciones = useMemo(() => {
    const enviar = (orden) => {
      const ws = interno.current.ws
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(orden))
    }
    return {
      entrenar: () => enviar({ tipo: 'iniciar' }),
      pausar: () => enviar({ tipo: 'pausar' }),
      darUnPaso: () => { if (!interno.current.enFases) enviar({ tipo: 'paso' }) },
      reiniciarPesos: () => enviar({ tipo: 'reiniciar' }),
      elegirProblema: (problema) => enviar({ tipo: 'configurar', problema }),
      agregarCapa: () => enviar({ tipo: 'agregar_capa' }),
      quitarCapa: () => enviar({ tipo: 'quitar_capa' }),
      cambiarNeuronas: (indice, neuronas) => enviar({ tipo: 'neuronas', indice, neuronas }),
      ajustar: (cambios) => enviar({ tipo: 'ajustar', ...cambios }),
      sondear: (entrada) => enviar({ tipo: 'sonda', entrada }),
    }
  }, [])

  /** Para los lienzos que se redibujan con cada cuadro sin pasar por React. */
  const suscribir = useCallback((oyente) => {
    interno.current.oyentes.add(oyente)
    return () => interno.current.oyentes.delete(oyente)
  }, [])

  /** La escena 3D se registra aquí cuando está lista. */
  const conectarMotor = useCallback((motor) => {
    const r = interno.current
    r.motor = motor
    const m = r.ultimoEstado
    if (motor && m) {
      motor.setEstructura(m.capas, { clases: m.problema.clases, nombresEntrada: m.problema.nombres_entrada })
      motor.setPesos(m.pesos)
      motor.setActivaciones((r.muestra || m.muestra).activaciones)
    }
  }, [])

  return { estado, acciones, suscribir, conectarMotor, datos: interno }
}
