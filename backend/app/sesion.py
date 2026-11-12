"""
sesion.py - Una sesión de entrenamiento por cada pestaña del navegador.

Guarda la red, los datos y la configuración; avanza el entrenamiento a
pequeños saltos y prepara los "cuadros" (fotos del estado de la red) que
se envían a la web para dibujarla en 3D mientras aprende.
"""

from __future__ import annotations

import time

import numpy as np

from .datos import PROBLEMAS, cargar, un_caliente
from .red_neuronal import ACTIVACIONES, RedNeuronal

# velocidad -> (lotes entrenados por cuadro, cuadros por segundo)
VELOCIDADES = {1: (1, 3), 2: (2, 8), 3: (6, 14), 4: (20, 16), 5: (60, 16)}

MAX_OCULTAS = 5            # capas ocultas como máximo
MAX_NEURONAS = 32          # neuronas por capa oculta como máximo
REJILLA = 36               # el mapa de decisión se calcula en 36 x 36 puntos
SEGUNDOS_POR_MUESTRA = 1.6  # cada cuánto cambia el ejemplo que recorre la red

# Crecimiento automático: si la precisión en datos nuevos pasa `paciencia`
# épocas sin subir al menos un punto, y aún no llega a la meta del problema,
# se añade una capa.
MEJORA_MINIMA = 0.01


class Sesion:
    def __init__(self):
        self.config = {
            "problema": "espiral",
            "activacion": "relu",
            "optimizador": "adam",
            "tasa": 0.02,
            "lote": 32,
            "velocidad": 3,
            "auto_crecer": False,
        }
        self.semilla = 1
        self.entrenando = False
        self.sonda = None            # entrada elegida por la persona (punto o dibujo)
        self._preparar(ocultas=[])

    # ------------------------------------------------------------------
    # Preparación
    # ------------------------------------------------------------------

    def _preparar(self, ocultas):
        """Carga el problema y crea una red nueva con pesos aleatorios."""
        self.datos = cargar(self.config["problema"], semilla=0)
        self.red = RedNeuronal(
            self.datos.n_entradas, ocultas, self.datos.n_salidas,
            self.config["activacion"], self.semilla,
        )
        self.rng = np.random.default_rng(self.semilla)
        self.paso = 0
        self.pasos_por_epoca = int(np.ceil(len(self.datos.X_ent) / self.config["lote"]))
        self._orden = self.rng.permutation(len(self.datos.X_ent))
        self._cursor = 0
        self._indice_muestra = 0
        self._cambio_muestra = time.monotonic()
        self._reiniciar_paciencia()

        if self.datos.es_2d:
            eje = np.linspace(-1.15, 1.15, REJILLA)
            xx, yy = np.meshgrid(eje, eje)
            self._rejilla = np.c_[xx.ravel(), yy.ravel()]
        else:
            self._rejilla = None

    def _reiniciar_paciencia(self):
        self._mejor_precision = 0.0
        self._epoca_mejor = self.epoca

    @property
    def epoca(self):
        return self.paso / self.pasos_por_epoca

    @property
    def paciencia(self):
        """Épocas sin mejorar que se toleran antes de crecer."""
        # Una red de una sola capa se estanca enseguida; con capas ocultas
        # hay mesetas largas que acaban cediendo, así que se espera más.
        if self.datos.es_2d:
            return 120 if self.red.ocultas else 40
        return 10 if self.red.ocultas else 5

    @property
    def meta(self):
        return PROBLEMAS[self.datos.id]["meta"]

    # ------------------------------------------------------------------
    # Entrenamiento
    # ------------------------------------------------------------------

    def _siguiente_lote(self):
        """Lotes pequeños y barajados: al agotar los datos termina una época."""
        lote = self.config["lote"]
        if self._cursor >= len(self._orden):
            self._orden = self.rng.permutation(len(self.datos.X_ent))
            self._cursor = 0
        indices = self._orden[self._cursor:self._cursor + lote]
        self._cursor += lote
        return self.datos.X_ent[indices], un_caliente(self.datos.y_ent[indices], self.datos.n_salidas)

    def entrenar_un_lote(self):
        X, Y = self._siguiente_lote()
        perdida, gradientes = self.red.entrenar_lote(
            X, Y, self.config["tasa"], self.config["optimizador"]
        )
        self.paso += 1
        return perdida, gradientes

    def avanzar(self):
        """Entrena los lotes que tocan en un cuadro. Devuelve los eventos ocurridos."""
        eventos = []
        lotes, _ = VELOCIDADES[self.config["velocidad"]]
        for _ in range(lotes):
            self.entrenar_un_lote()
            if self.paso % self.pasos_por_epoca == 0:      # acaba de terminar una época
                evento = self._revisar_crecimiento()
                if evento:
                    eventos.append(evento)
        return eventos

    def _revisar_crecimiento(self):
        """Decide, al final de cada época, si la red necesita una capa más."""
        precision = self.precision(self.datos.X_pru, self.datos.y_pru)
        if precision >= self._mejor_precision + MEJORA_MINIMA:
            self._mejor_precision = precision
            self._epoca_mejor = self.epoca

        estancada = self.epoca - self._epoca_mejor >= self.paciencia
        puede_crecer = len(self.red.ocultas) < MAX_OCULTAS - 1
        if (self.config["auto_crecer"] and estancada and puede_crecer
                and self._mejor_precision < self.meta):
            return self.agregar_capa(automatica=True)
        return None

    # ------------------------------------------------------------------
    # Cambios de estructura
    # ------------------------------------------------------------------

    def agregar_capa(self, neuronas=None, automatica=False):
        if len(self.red.ocultas) >= MAX_OCULTAS:
            return None
        neuronas = neuronas or PROBLEMAS[self.datos.id]["neuronas_nuevas"]
        neuronas = int(np.clip(neuronas, 1, MAX_NEURONAS))
        self.red.agregar_capa(neuronas)
        self._reiniciar_paciencia()
        return {
            "tipo": "evento", "clase": "capa_agregada", "automatica": automatica,
            "epoca": round(self.epoca, 2), "capas": self.red.tamanos,
            "indice": len(self.red.ocultas),
        }

    def quitar_capa(self):
        if not self.red.ocultas:
            return None
        self.red.quitar_capa()
        self._reiniciar_paciencia()
        return {
            "tipo": "evento", "clase": "capa_quitada", "automatica": False,
            "epoca": round(self.epoca, 2), "capas": self.red.tamanos,
            "indice": len(self.red.ocultas) + 1,
        }

    def cambiar_neuronas(self, indice, neuronas):
        if not 0 <= indice < len(self.red.ocultas):
            return
        self.red.cambiar_neuronas(indice, int(np.clip(neuronas, 1, MAX_NEURONAS)))
        self._reiniciar_paciencia()

    def configurar(self, cambios):
        """Cambia de problema: datos nuevos y red nueva de una sola capa."""
        if cambios.get("problema") in PROBLEMAS:
            self.config["problema"] = cambios["problema"]
        self.sonda = None
        self.entrenando = False
        self._preparar(ocultas=[])

    def reiniciar(self):
        """Mismos datos y misma forma de red, pero pesos aleatorios nuevos."""
        self.semilla += 1
        self.entrenando = False
        self._preparar(ocultas=self.red.ocultas)

    def ajustar(self, cambios):
        """Ajustes que no obligan a rehacer la red."""
        if cambios.get("activacion") in ACTIVACIONES:
            self.config["activacion"] = cambios["activacion"]
            self.red.activacion = cambios["activacion"]
        if cambios.get("optimizador") in ("sgd", "adam"):
            self.config["optimizador"] = cambios["optimizador"]
        if "tasa" in cambios:
            self.config["tasa"] = float(np.clip(cambios["tasa"], 1e-4, 3.0))
        if cambios.get("velocidad") in VELOCIDADES:
            self.config["velocidad"] = cambios["velocidad"]
        if "auto_crecer" in cambios:
            self.config["auto_crecer"] = bool(cambios["auto_crecer"])
            self._reiniciar_paciencia()

    def fijar_sonda(self, entrada):
        """La persona señala un punto o dibuja un dígito: esa entrada recorre la red."""
        if entrada is None or len(entrada) != self.datos.n_entradas:
            self.sonda = None
        else:
            self.sonda = np.clip(np.asarray(entrada, dtype=float), -2.0, 2.0)

    # ------------------------------------------------------------------
    # Medidas
    # ------------------------------------------------------------------

    def precision(self, X, y):
        return float((self.red.predecir(X) == y).mean())

    def perdida_total(self):
        P = self.red.propagar_adelante(self.datos.X_ent)
        return self.red.calcular_perdida(P, self.datos.Y_ent)

    # ------------------------------------------------------------------
    # Lo que se envía a la web
    # ------------------------------------------------------------------

    def muestra(self, cambiar=False):
        """Un ejemplo recorriendo la red: la activación de cada neurona."""
        if self.sonda is not None:
            entrada, etiqueta = self.sonda, None
        else:
            ahora = time.monotonic()
            if cambiar or ahora - self._cambio_muestra > SEGUNDOS_POR_MUESTRA:
                self._indice_muestra = (self._indice_muestra + 1) % len(self.datos.X_pru)
                self._cambio_muestra = ahora
            entrada = self.datos.X_pru[self._indice_muestra]
            etiqueta = int(self.datos.y_pru[self._indice_muestra])

        probabilidades = self.red.propagar_adelante(entrada[None, :])[0]
        return {
            "id": -1 if etiqueta is None else self._indice_muestra,
            "es_sonda": etiqueta is None,
            "entrada": np.round(entrada, 3).tolist(),
            "etiqueta": etiqueta,
            "prediccion": int(probabilidades.argmax()),
            "probabilidades": np.round(probabilidades, 3).tolist(),
            "activaciones": [np.round(a[0], 3).tolist() for a in self.red.activaciones],
        }

    def cuadro(self, tipo="cuadro"):
        """Foto completa de la red en este instante."""
        datos = self.datos
        cuadro = {
            "tipo": tipo,
            "paso": self.paso,
            "epoca": round(self.epoca, 2),
            "perdida": round(self.perdida_total(), 4),
            "precision": round(self.precision(datos.X_pru, datos.y_pru), 4),
            "precision_entrenamiento": round(self.precision(datos.X_ent, datos.y_ent), 4),
            "capas": self.red.tamanos,
            "pesos": [np.round(capa.W, 3).ravel().tolist() for capa in self.red.capas],
            "sesgos": [np.round(capa.b, 3).tolist() for capa in self.red.capas],
            "muestra": self.muestra(),
        }
        if self._rejilla is not None:
            # Probabilidad de la clase B en cada punto del plano: el mapa de decisión.
            mapa = self.red.propagar_adelante(self._rejilla)[:, 1]
            cuadro["frontera"] = np.round(mapa, 2).tolist()
        return cuadro

    def estado(self, motivo="ajuste"):
        """El cuadro más todo lo que la web necesita para dibujar los paneles."""
        datos = self.datos
        estado = self.cuadro(tipo="estado")
        estado.update({
            "motivo": motivo,
            "entrenando": self.entrenando,
            "config": dict(self.config),
            "parametros": self.red.n_parametros,
            "pasos_por_epoca": self.pasos_por_epoca,
            "limites": {"ocultas": MAX_OCULTAS, "neuronas": MAX_NEURONAS},
            "problema": {
                "id": datos.id,
                "nombre": PROBLEMAS[datos.id]["nombre"],
                "es_2d": datos.es_2d,
                "clases": datos.clases,
                "nombres_entrada": datos.nombres_entrada,
                "ejemplos_entrenamiento": len(datos.X_ent),
                "ejemplos_prueba": len(datos.X_pru),
                "neuronas_nuevas": PROBLEMAS[datos.id]["neuronas_nuevas"],
                "meta": self.meta,
                "rejilla": REJILLA if datos.es_2d else 0,
            },
        })
        if datos.es_2d:
            estado["puntos"] = np.c_[np.round(datos.X_ent, 3), datos.y_ent].tolist()
        return estado

    def paso_detallado(self):
        """Un solo lote, guardando el antes y el después para explicarlo por fases."""
        antes = self.muestra(cambiar=True)
        perdida_antes = self.perdida_total()
        _, gradientes = self.entrenar_un_lote()
        cuadro = self.cuadro(tipo="paso_detallado")
        cuadro["muestra"] = antes
        cuadro["perdida_antes"] = round(perdida_antes, 4)
        cuadro["gradientes"] = [round(float(np.abs(dW).mean()), 5) for dW, _ in gradientes]
        return cuadro
