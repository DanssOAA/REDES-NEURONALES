// motor.js - La escena 3D, escrita directamente con three.js.
//
// Dibuja la red tal como la envía el backend:
//   - una esfera por neurona (su color es su activación),
//   - un hilo por conexión (su grosor es el tamaño del peso; azul si es
//     positivo, naranja si es negativo),
//   - una placa por capa, para que se vea dónde empieza y acaba cada una.
//
// Todo se interpola suavemente: cuando llega un cuadro nuevo los pesos
// no saltan, se deslizan. Cuando la red gana una capa, las demás se
// apartan y la nueva crece desde cero.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { disponerCapa, posicionX } from './disposicion.js'

const MAX_NEURONAS = 512
const MAX_CHISPAS = 200
const CHISPAS_POR_TRAMO = 22
const MARGEN_PLACA = 0.475 // lo que sobresale la placa alrededor de las neuronas

export class MotorEscena {
  constructor(contenedor, capaEtiquetas) {
    this.contenedor = contenedor
    this.capaEtiquetas = capaEtiquetas
    this.capas = []        // neuronas, agrupadas por capa
    this.tramos = []       // conexiones entre una capa y la siguiente
    this.placas = new Map()
    this.etiquetas = []
    this.onda = null
    this.chispas = []
    this.info = { clases: [], nombresEntrada: [] }
    this.firma = ''
    this.despiertoHasta = 0
    this.tPrevio = performance.now()
    this.distObjetivo = null
    this.color = {
      papel: new THREE.Color('#f1f3ef'), tinta: new THREE.Color('#1b2440'),
      azul: new THREE.Color('#1e5bd8'), naranja: new THREE.Color('#e8590c'),
      neutro: new THREE.Color('#c5cad3'),
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 0)
    contenedor.appendChild(this.renderer.domElement)

    this.escena = new THREE.Scene()
    this.camara = new THREE.PerspectiveCamera(36, 1, 0.1, 400)
    this.camara.position.set(-7.5, 5.2, 13.5)

    this.controles = new OrbitControls(this.camara, this.renderer.domElement)
    this.controles.enableDamping = true
    this.controles.dampingFactor = 0.09
    this.controles.minDistance = 3
    this.controles.maxDistance = 90
    this.controles.autoRotateSpeed = 0.9
    this.controles.addEventListener('change', () => this.despertar(600))
    this.controles.addEventListener('start', () => { this.distObjetivo = null })

    this.luzAmbiente = new THREE.HemisphereLight(0xffffff, 0xb8bcc4, 2.3)
    this.luzSol = new THREE.DirectionalLight(0xffffff, 1.5)
    this.luzSol.position.set(-6, 10, 8)
    this.escena.add(this.luzAmbiente, this.luzSol)

    // Neuronas: una sola malla repetida (instanciada), mucho más rápida que 300 mallas.
    this.mallaNeuronas = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshLambertMaterial(),
      MAX_NEURONAS,
    )
    this.mallaNeuronas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NEURONAS * 3), 3)
    this.mallaNeuronas.count = 0
    this.mallaNeuronas.frustumCulled = false
    this.escena.add(this.mallaNeuronas)

    this.mallaConexiones = null
    this._crearConexiones(1024)

    this.mallaChispas = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_CHISPAS,
    )
    this.mallaChispas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CHISPAS * 3), 3)
    this.mallaChispas.count = 0
    this.mallaChispas.frustumCulled = false
    this.escena.add(this.mallaChispas)

    this.grupoPlacas = new THREE.Group()
    this.escena.add(this.grupoPlacas)

    this._vector = new THREE.Vector3()
    this._observador = new ResizeObserver(() => this._ajustarTamano())
    this._observador.observe(contenedor)
    this._ajustarTamano()

    this._bucle = this._bucle.bind(this)
    this._animacion = requestAnimationFrame(this._bucle)
  }

  // ------------------------------------------------------------------
  // Lo que se le pide desde fuera
  // ------------------------------------------------------------------

  setTema(colores) {
    for (const nombre of Object.keys(this.color)) {
      if (colores[nombre]) this.color[nombre].set(colores[nombre])
    }
    this.luzAmbiente.groundColor.copy(this.color.papel).multiplyScalar(0.8)
    for (const placa of this.placas.values()) {
      placa.borde.material.color.copy(this.color.tinta)
      placa.relleno.material.color.copy(this.color.tinta)
    }
    this.despertar()
  }

  /** tamanos: neuronas por capa, por ejemplo [2, 12, 12, 2]. */
  setEstructura(tamanos, info) {
    const firma = tamanos.join('-') + '|' + (info?.clases || []).join(',')
    if (firma === this.firma) return
    this.firma = firma
    this.info = info || this.info

    const total = tamanos.length
    const previas = new Map(this.capas.map((capa) => [capa.clave, capa]))

    this.capas = tamanos.map((n, indice) => {
      const tipo = indice === 0 ? 'entrada' : indice === total - 1 ? 'salida' : 'oculta'
      const clave = tipo === 'oculta' ? 'oculta' + indice : tipo
      const forma = disponerCapa(n, tipo)
      const x = posicionX(indice, total)
      const capa = {
        clave, tipo, indice, n, x,
        radio: forma.radio, alto: forma.alto, ancho: forma.ancho,
        pos: new Float32Array(n * 3),      // dónde está ahora cada neurona
        destino: new Float32Array(n * 3),  // dónde debe acabar
        nace: new Float32Array(n),         // 0 = recién creada, 1 = tamaño completo
        act: new Float32Array(n),          // activación mostrada
        actDestino: new Float32Array(n),
      }
      const vieja = previas.get(clave)
      for (let i = 0; i < n; i++) {
        capa.destino[i * 3] = x
        capa.destino[i * 3 + 1] = forma.y[i]
        capa.destino[i * 3 + 2] = forma.z[i]
        if (vieja && i < vieja.n) {
          capa.pos.set(vieja.pos.subarray(i * 3, i * 3 + 3), i * 3)
          capa.nace[i] = vieja.nace[i]
          capa.act[i] = vieja.act[i]
        } else {
          capa.pos.set(capa.destino.subarray(i * 3, i * 3 + 3), i * 3)
        }
      }
      return capa
    })

    // Conexiones: se conservan los pesos mostrados de los tramos que no cambian.
    const tramosPrevios = new Map(this.tramos.map((tramo) => [tramo.clave, tramo]))
    let desplazamiento = 0
    this.tramos = []
    for (let g = 0; g < total - 1; g++) {
      const a = this.capas[g]
      const b = this.capas[g + 1]
      const clave = `${a.clave}>${b.clave}:${a.n}x${b.n}`
      const cantidad = a.n * b.n
      const previo = tramosPrevios.get(clave)
      this.tramos.push({
        clave, cantidad, desplazamiento,
        w: previo ? previo.w : new Float32Array(cantidad),
        wDestino: previo ? previo.wDestino : new Float32Array(cantidad),
        referencia: previo ? previo.referencia : 0.5,
        radioMaximo: Math.min(0.062, Math.max(0.011, 0.36 / Math.sqrt(cantidad))),
      })
      desplazamiento += cantidad
    }
    if (desplazamiento > this.capacidadConexiones) this._crearConexiones(desplazamiento)
    this.mallaConexiones.count = desplazamiento
    this.mallaNeuronas.count = tamanos.reduce((suma, n) => suma + n, 0)

    this._reconstruirPlacas()
    this._reconstruirEtiquetas()
    this.onda = null
    this.chispas = []
    this.encuadrar()
    this.despertar(2500)
  }

  /** pesos: una lista plana por tramo, fila a fila (entrada i, neurona j) -> i * nB + j. */
  setPesos(pesos) {
    if (!pesos || pesos.length !== this.tramos.length) return
    for (let g = 0; g < pesos.length; g++) {
      const tramo = this.tramos[g]
      if (pesos[g].length === tramo.cantidad) tramo.wDestino.set(pesos[g])
    }
    this.despertar()
  }

  /** activaciones: una lista por capa con la salida de cada neurona para un ejemplo. */
  setActivaciones(activaciones) {
    if (!activaciones || activaciones.length !== this.capas.length) return
    activaciones.forEach((valores, indice) => {
      const capa = this.capas[indice]
      if (valores.length !== capa.n) return
      let maximo = 1
      for (const v of valores) maximo = Math.max(maximo, Math.abs(v))
      for (let i = 0; i < capa.n; i++) capa.actDestino[i] = valores[i] / maximo
    })
    this._actualizarSalida(activaciones[activaciones.length - 1])
    this.despertar()
  }

  /** Lanza una ola por la red: +1 hacia la salida (señal), -1 hacia la entrada (error). */
  pulso(direccion = 1) {
    const total = this.capas.length
    if (total < 2) return
    this.onda = { direccion, inicio: performance.now(), duracion: 520 + 400 * (total - 1), total }
    this.chispas = []
    for (let g = 0; g < this.tramos.length; g++) {
      const tramo = this.tramos[g]
      const a = this.capas[g]
      const b = this.capas[g + 1]
      // Las chispas recorren las conexiones que más aportan: |activación x peso|.
      const aporte = new Float32Array(tramo.cantidad)
      for (let i = 0; i < a.n; i++) {
        const entrada = Math.abs(a.actDestino[i]) + 0.05
        for (let j = 0; j < b.n; j++) aporte[i * b.n + j] = entrada * Math.abs(tramo.wDestino[i * b.n + j])
      }
      const orden = Array.from(aporte.keys()).sort((p, q) => aporte[q] - aporte[p])
      for (const c of orden.slice(0, CHISPAS_POR_TRAMO)) {
        if (this.chispas.length >= MAX_CHISPAS) break
        const i = Math.floor(c / b.n)
        const j = c % b.n
        const signo = Math.sign(a.actDestino[i] * tramo.wDestino[c]) || 1
        this.chispas.push({ g, i, j, signo })
      }
    }
    this.despertar(this.onda.duracion + 400)
  }

  setGiro(activo) {
    this.controles.autoRotate = activo
    this.despertar()
  }

  /** Aleja o acerca la cámara para que quepa toda la red, sin cambiar el ángulo. */
  encuadrar() {
    if (!this.capas.length) return
    this.camara.updateMatrixWorld()
    const derecha = new THREE.Vector3().setFromMatrixColumn(this.camara.matrixWorld, 0)
    const arriba = new THREE.Vector3().setFromMatrixColumn(this.camara.matrixWorld, 1)
    const atras = new THREE.Vector3().setFromMatrixColumn(this.camara.matrixWorld, 2)
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camara.fov) / 2)
    const tanH = tanV * this.camara.aspect

    // Distancia mínima para que un punto (con su margen) quede dentro del encuadre.
    let distancia = 0
    const medir = (x, y, z, margen) => {
      const horizontal = Math.abs(x * derecha.x + y * derecha.y + z * derecha.z) + margen
      const vertical = Math.abs(x * arriba.x + y * arriba.y + z * arriba.z) + margen
      const fondo = x * atras.x + y * atras.y + z * atras.z
      distancia = Math.max(distancia, horizontal / tanH + fondo, vertical / tanV + fondo)
    }
    for (const capa of this.capas) {
      for (let i = 0; i < capa.n; i++) {
        const p = i * 3
        medir(capa.destino[p], capa.destino[p + 1], capa.destino[p + 2], 0.55)
        if (capa.tipo === 'salida') medir(capa.destino[p] + 1.5, capa.destino[p + 1], capa.destino[p + 2], 0.2)
        if (capa.tipo === 'entrada') medir(capa.destino[p] - 0.9, capa.destino[p + 1], capa.destino[p + 2], 0.2)
      }
      // Las cuatro esquinas de la placa; por abajo se deja sitio para el rótulo.
      const y = capa.alto / 2 + MARGEN_PLACA
      const z = capa.ancho / 2 + MARGEN_PLACA
      medir(capa.x, y, z, 0.1)
      medir(capa.x, y, -z, 0.1)
      medir(capa.x, -y - 1.05, z, 0.1)
      medir(capa.x, -y - 1.05, -z, 0.1)
    }
    this.distObjetivo = Math.min(88, Math.max(4, distancia))
    this.despertar(2500)
  }

  despertar(ms = 1800) {
    this.despiertoHasta = Math.max(this.despiertoHasta, performance.now() + ms)
  }

  destruir() {
    cancelAnimationFrame(this._animacion)
    this._observador.disconnect()
    this.controles.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.capaEtiquetas.replaceChildren()
  }

  // ------------------------------------------------------------------
  // Construcción interna
  // ------------------------------------------------------------------

  _crearConexiones(minimo) {
    if (this.mallaConexiones) {
      this.escena.remove(this.mallaConexiones)
      this.mallaConexiones.geometry.dispose()
      this.mallaConexiones.material.dispose()
    }
    let capacidad = 1024
    while (capacidad < minimo) capacidad *= 2
    this.capacidadConexiones = capacidad
    // Cada conexión es un cilindro fino de altura 1 que luego se estira entre dos neuronas.
    this.mallaConexiones = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 5, 1, true),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      capacidad,
    )
    this.mallaConexiones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacidad * 3), 3)
    this.mallaConexiones.count = 0
    this.mallaConexiones.frustumCulled = false
    this.escena.add(this.mallaConexiones)
  }

  _reconstruirPlacas() {
    const claves = new Set(this.capas.map((capa) => capa.clave))
    for (const [clave, placa] of this.placas) {
      if (!claves.has(clave)) {
        this.grupoPlacas.remove(placa.grupo)
        placa.borde.geometry.dispose()
        placa.relleno.geometry.dispose()
        this.placas.delete(clave)
      }
    }
    for (const capa of this.capas) {
      if (this.placas.has(capa.clave)) continue
      const contorno = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.5, -0.5), new THREE.Vector3(0, 0.5, -0.5),
        new THREE.Vector3(0, 0.5, 0.5), new THREE.Vector3(0, -0.5, 0.5),
      ])
      const borde = new THREE.LineLoop(
        contorno,
        new THREE.LineBasicMaterial({ color: this.color.tinta, transparent: true, opacity: 0.34 }),
      )
      const relleno = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: this.color.tinta, transparent: true, opacity: 0.045,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      )
      const grupo = new THREE.Group()
      grupo.add(borde, relleno)
      grupo.scale.set(1, 0.01, 0.01)
      grupo.position.x = capa.x
      this.grupoPlacas.add(grupo)
      this.placas.set(capa.clave, { grupo, borde, relleno })
    }
  }

  _reconstruirEtiquetas() {
    this.capaEtiquetas.replaceChildren()
    this.etiquetas = []
    const crear = (clase, capa, neurona) => {
      const elemento = document.createElement('div')
      elemento.className = 'etiqueta ' + clase
      this.capaEtiquetas.appendChild(elemento)
      const etiqueta = { elemento, capa, neurona, clase }
      this.etiquetas.push(etiqueta)
      return elemento
    }
    let ocultas = 0
    for (const capa of this.capas) {
      const pie = crear('etiqueta-capa', capa, -1)
      const nombre = capa.tipo === 'entrada' ? 'Entrada'
        : capa.tipo === 'salida' ? 'Salida' : `Oculta ${++ocultas}`
      const titulo = document.createElement('strong')
      titulo.textContent = nombre
      const cuenta = document.createElement('span')
      cuenta.textContent = capa.n === 1 ? '1 neurona' : `${capa.n} neuronas`
      pie.append(titulo, cuenta)

      if (capa.tipo === 'salida') {
        for (let i = 0; i < capa.n; i++) crear('etiqueta-salida', capa, i).textContent = this.info.clases?.[i] ?? i
      }
      if (capa.tipo === 'entrada' && this.info.nombresEntrada?.length === capa.n) {
        for (let i = 0; i < capa.n; i++) crear('etiqueta-entrada', capa, i).textContent = this.info.nombresEntrada[i]
      }
    }
  }

  _actualizarSalida(probabilidades) {
    if (!probabilidades) return
    let mejor = 0
    probabilidades.forEach((p, i) => { if (p > probabilidades[mejor]) mejor = i })
    for (const etiqueta of this.etiquetas) {
      if (etiqueta.clase !== 'etiqueta-salida') continue
      const i = etiqueta.neurona
      const nombre = this.info.clases?.[i] ?? i
      etiqueta.elemento.textContent = `${nombre}  ${Math.round((probabilidades[i] || 0) * 100)} %`
      etiqueta.elemento.classList.toggle('gana', i === mejor)
    }
  }

  _ajustarTamano() {
    const ancho = Math.max(1, this.contenedor.clientWidth)
    const alto = Math.max(1, this.contenedor.clientHeight)
    this.renderer.setSize(ancho, alto, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camara.aspect = ancho / alto
    this.camara.updateProjectionMatrix()
    this.ancho = ancho
    this.alto = alto
    if (this.capas.length) this.encuadrar()
    this.despertar()
  }

  // ------------------------------------------------------------------
  // Cada fotograma
  // ------------------------------------------------------------------

  _bucle(ahora) {
    this._animacion = requestAnimationFrame(this._bucle)
    if (ahora > this.despiertoHasta && !this.controles.autoRotate) {
      this.tPrevio = ahora
      return // nada se mueve: no se gasta batería redibujando
    }
    const dt = Math.min(0.05, (ahora - this.tPrevio) / 1000)
    this.tPrevio = ahora
    const suave = 1 - Math.exp(-dt * 8)       // posiciones y activaciones
    const suavePesos = 1 - Math.exp(-dt * 11)

    // Por dónde va la ola (en unidades de capa), si hay una en marcha.
    let ola = null
    if (this.onda) {
      const avance = (ahora - this.onda.inicio) / this.onda.duracion
      if (avance >= 1) {
        this.onda = null
      } else {
        const recorrido = this.onda.total - 1 + 0.8
        ola = this.onda.direccion > 0 ? -0.4 + avance * recorrido : this.onda.total - 0.6 - avance * recorrido
      }
    }

    this._dibujarNeuronas(suave, ola)
    this._dibujarConexiones(suavePesos, suave, ola)
    this._dibujarChispas(ola)
    this._moverPlacas(suave)

    if (this.distObjetivo) {
      const desde = this.controles.target
      const direccion = this._vector.copy(this.camara.position).sub(desde)
      const distancia = direccion.length()
      const nueva = distancia + (this.distObjetivo - distancia) * (1 - Math.exp(-dt * 4))
      this.camara.position.copy(desde).addScaledVector(direccion.normalize(), nueva)
      desde.multiplyScalar(Math.exp(-dt * 4)) // vuelve a centrarse en la red
      if (Math.abs(nueva - this.distObjetivo) < 0.01) this.distObjetivo = null
    }

    this.controles.update()
    this.renderer.render(this.escena, this.camara)
    this._colocarEtiquetas()
  }

  _dibujarNeuronas(suave, ola) {
    const matrices = this.mallaNeuronas.instanceMatrix.array
    const colores = this.mallaNeuronas.instanceColor.array
    const { neutro, azul, naranja } = this.color
    let n = 0
    for (const capa of this.capas) {
      const empuje = ola === null ? 0 : Math.exp(-((capa.indice - ola) ** 2) / 0.1)
      for (let i = 0; i < capa.n; i++, n++) {
        const p = i * 3
        capa.pos[p] += (capa.destino[p] - capa.pos[p]) * suave
        capa.pos[p + 1] += (capa.destino[p + 1] - capa.pos[p + 1]) * suave
        capa.pos[p + 2] += (capa.destino[p + 2] - capa.pos[p + 2]) * suave
        capa.nace[i] += (1 - capa.nace[i]) * suave * 0.7
        capa.act[i] += (capa.actDestino[i] - capa.act[i]) * suave

        const a = capa.act[i]
        const fuerza = Math.min(1, Math.abs(a)) ** 0.75
        const tono = a >= 0 ? azul : naranja
        const escala = capa.radio * capa.nace[i] * (1 + 0.25 * fuerza + 0.5 * empuje)

        const m = n * 16
        matrices[m] = escala; matrices[m + 1] = 0; matrices[m + 2] = 0; matrices[m + 3] = 0
        matrices[m + 4] = 0; matrices[m + 5] = escala; matrices[m + 6] = 0; matrices[m + 7] = 0
        matrices[m + 8] = 0; matrices[m + 9] = 0; matrices[m + 10] = escala; matrices[m + 11] = 0
        matrices[m + 12] = capa.pos[p]; matrices[m + 13] = capa.pos[p + 1]; matrices[m + 14] = capa.pos[p + 2]; matrices[m + 15] = 1

        const c = n * 3
        colores[c] = neutro.r + (tono.r - neutro.r) * fuerza
        colores[c + 1] = neutro.g + (tono.g - neutro.g) * fuerza
        colores[c + 2] = neutro.b + (tono.b - neutro.b) * fuerza
      }
    }
    this.mallaNeuronas.instanceMatrix.needsUpdate = true
    this.mallaNeuronas.instanceColor.needsUpdate = true
  }

  _dibujarConexiones(suavePesos, suave, ola) {
    const matrices = this.mallaConexiones.instanceMatrix.array
    const colores = this.mallaConexiones.instanceColor.array
    const { papel, azul, naranja, tinta } = this.color
    const haciaAtras = this.onda && this.onda.direccion < 0

    for (let g = 0; g < this.tramos.length; g++) {
      const tramo = this.tramos[g]
      const a = this.capas[g]
      const b = this.capas[g + 1]
      const { w, wDestino } = tramo

      let maximo = 0.05
      for (let c = 0; c < tramo.cantidad; c++) {
        w[c] += (wDestino[c] - w[c]) * suavePesos
        const absoluto = w[c] < 0 ? -w[c] : w[c]
        if (absoluto > maximo) maximo = absoluto
      }
      tramo.referencia += (maximo - tramo.referencia) * suave
      const referencia = tramo.referencia
      const destello = ola === null ? 0 : Math.exp(-((g + 0.5 - ola) ** 2) / 0.12)

      for (let i = 0; i < a.n; i++) {
        const ax = a.pos[i * 3], ay = a.pos[i * 3 + 1], az = a.pos[i * 3 + 2]
        const naceA = a.nace[i]
        for (let j = 0; j < b.n; j++) {
          const c = i * b.n + j
          const bx = b.pos[j * 3], by = b.pos[j * 3 + 1], bz = b.pos[j * 3 + 2]
          const peso = w[c]
          const fuerza = Math.min(1, Math.abs(peso) / referencia)
          const radio = tramo.radioMaximo * (0.05 + 0.95 * fuerza) * Math.min(naceA, b.nace[j])

          // Matriz que estira el cilindro desde la neurona A hasta la B.
          const dx = bx - ax, dy = by - ay, dz = bz - az
          const largo = Math.hypot(dx, dy, dz) || 1
          let ux = dz, uz = -dx
          const lu = Math.hypot(ux, uz) || 1
          ux /= lu; uz /= lu
          const nx = dx / largo, ny = dy / largo, nz = dz / largo
          const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux

          const m = (tramo.desplazamiento + c) * 16
          matrices[m] = ux * radio; matrices[m + 1] = 0; matrices[m + 2] = uz * radio; matrices[m + 3] = 0
          matrices[m + 4] = dx; matrices[m + 5] = dy; matrices[m + 6] = dz; matrices[m + 7] = 0
          matrices[m + 8] = vx * radio; matrices[m + 9] = vy * radio; matrices[m + 10] = vz * radio; matrices[m + 11] = 0
          matrices[m + 12] = (ax + bx) / 2; matrices[m + 13] = (ay + by) / 2; matrices[m + 14] = (az + bz) / 2; matrices[m + 15] = 1

          // Los pesos débiles se funden con el papel; los fuertes toman color pleno.
          const tono = peso >= 0 ? azul : naranja
          const mezcla = 0.16 + 0.84 * fuerza ** 0.8
          let r = papel.r + (tono.r - papel.r) * mezcla
          let v = papel.g + (tono.g - papel.g) * mezcla
          let z = papel.b + (tono.b - papel.b) * mezcla
          if (destello > 0.02) {
            const hacia = haciaAtras ? tinta : tono
            const cuanto = destello * 0.7 * (0.25 + 0.75 * fuerza)
            r += (hacia.r - r) * cuanto
            v += (hacia.g - v) * cuanto
            z += (hacia.b - z) * cuanto
          }
          const k = (tramo.desplazamiento + c) * 3
          colores[k] = r; colores[k + 1] = v; colores[k + 2] = z
        }
      }
    }
    this.mallaConexiones.instanceMatrix.needsUpdate = true
    this.mallaConexiones.instanceColor.needsUpdate = true
  }

  _dibujarChispas(ola) {
    if (ola === null || !this.onda) {
      this.mallaChispas.count = 0
      return
    }
    const matrices = this.mallaChispas.instanceMatrix.array
    const colores = this.mallaChispas.instanceColor.array
    const { azul, naranja, tinta } = this.color
    const haciaAtras = this.onda.direccion < 0
    let n = 0
    for (const chispa of this.chispas) {
      const a = this.capas[chispa.g]
      const b = this.capas[chispa.g + 1]
      if (!a || !b || chispa.i >= a.n || chispa.j >= b.n) continue
      const avance = haciaAtras ? chispa.g + 1 - ola : ola - chispa.g
      if (avance <= 0 || avance >= 1) continue
      const t = haciaAtras ? 1 - avance : avance
      const p = chispa.i * 3
      const q = chispa.j * 3
      const escala = 0.05 + 0.07 * Math.sin(Math.PI * avance)
      const m = n * 16
      matrices[m] = escala; matrices[m + 1] = 0; matrices[m + 2] = 0; matrices[m + 3] = 0
      matrices[m + 4] = 0; matrices[m + 5] = escala; matrices[m + 6] = 0; matrices[m + 7] = 0
      matrices[m + 8] = 0; matrices[m + 9] = 0; matrices[m + 10] = escala; matrices[m + 11] = 0
      matrices[m + 12] = a.pos[p] + (b.pos[q] - a.pos[p]) * t
      matrices[m + 13] = a.pos[p + 1] + (b.pos[q + 1] - a.pos[p + 1]) * t
      matrices[m + 14] = a.pos[p + 2] + (b.pos[q + 2] - a.pos[p + 2]) * t
      matrices[m + 15] = 1
      const tono = haciaAtras ? tinta : chispa.signo > 0 ? azul : naranja
      colores[n * 3] = tono.r; colores[n * 3 + 1] = tono.g; colores[n * 3 + 2] = tono.b
      n++
    }
    this.mallaChispas.count = n
    this.mallaChispas.instanceMatrix.needsUpdate = true
    this.mallaChispas.instanceColor.needsUpdate = true
  }

  _moverPlacas(suave) {
    for (const capa of this.capas) {
      const placa = this.placas.get(capa.clave)
      if (!placa) continue
      const escala = placa.grupo.scale
      placa.grupo.position.x = capa.pos[0]
      escala.y += (capa.alto + 2 * MARGEN_PLACA - escala.y) * suave
      escala.z += (capa.ancho + 2 * MARGEN_PLACA - escala.z) * suave
    }
  }

  _colocarEtiquetas() {
    const v = this._vector
    for (const etiqueta of this.etiquetas) {
      const capa = etiqueta.capa
      let x
      let y
      let visible = true
      if (etiqueta.neurona < 0) {
        // Rótulo de la capa: centrado bajo el punto más bajo de su placa en pantalla,
        // para que no la pise se mire desde donde se mire.
        const my = capa.alto / 2 + MARGEN_PLACA
        const mz = capa.ancho / 2 + MARGEN_PLACA
        let suma = 0
        let bajo = -Infinity
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            v.set(capa.pos[0], sy * my, sz * mz).project(this.camara)
            if (v.z >= 1 || v.z <= -1) visible = false
            suma += (v.x * 0.5 + 0.5) * this.ancho
            bajo = Math.max(bajo, (-v.y * 0.5 + 0.5) * this.alto)
          }
        }
        x = suma / 4
        y = bajo + 5
      } else {
        const p = etiqueta.neurona * 3
        const lado = etiqueta.clase === 'etiqueta-salida' ? 0.5 : -0.5
        v.set(capa.pos[p] + lado, capa.pos[p + 1], capa.pos[p + 2]).project(this.camara)
        visible = v.z < 1 && v.z > -1
        x = (v.x * 0.5 + 0.5) * this.ancho
        y = (-v.y * 0.5 + 0.5) * this.alto
      }
      etiqueta.elemento.style.display = visible ? '' : 'none'
      if (visible) etiqueta.elemento.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    }
  }
}
