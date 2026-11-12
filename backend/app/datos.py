"""
datos.py - Los problemas que la red puede aprender.

Cuatro problemas de dos entradas (x, y), donde se puede dibujar qué región
asigna la red a cada clase, y uno "de verdad": reconocer dígitos escritos
a mano en imágenes de 8x8 píxeles (64 entradas, 10 clases).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

RUTA_DIGITOS = Path(__file__).resolve().parent.parent / "datos" / "digitos.npz"

PROBLEMAS = {
    "lineal": {
        "nombre": "Lineal",
        "descripcion": "Dos grupos que se separan con una recta.",
        "neuronas_nuevas": 4,       # tamaño de cada capa oculta que se añade
        "meta": 0.98,               # precisión con la que se da por resuelto
    },
    "xor": {
        "nombre": "XOR",
        "descripcion": "Esquinas opuestas comparten clase. Ninguna recta las separa.",
        "neuronas_nuevas": 6,
        "meta": 0.98,
    },
    "circulos": {
        "nombre": "Círculos",
        "descripcion": "Un grupo rodea al otro.",
        "neuronas_nuevas": 6,
        "meta": 0.98,
    },
    "espiral": {
        "nombre": "Espiral",
        "descripcion": "Dos brazos enroscados. Pide varias capas.",
        "neuronas_nuevas": 12,
        "meta": 0.98,
    },
    "digitos": {
        "nombre": "Dígitos",
        "descripcion": "Números escritos a mano en 8x8 píxeles.",
        "neuronas_nuevas": 16,
        "meta": 0.975,
    },
}


@dataclass
class Conjunto:
    """Datos de un problema, ya separados en entrenamiento y prueba."""

    id: str
    X_ent: np.ndarray           # ejemplos con los que la red aprende
    y_ent: np.ndarray           # su clase correcta (un entero por ejemplo)
    X_pru: np.ndarray           # ejemplos que la red nunca ve al entrenar
    y_pru: np.ndarray
    clases: list
    nombres_entrada: list = field(default_factory=list)
    es_2d: bool = True

    @property
    def n_entradas(self):
        return self.X_ent.shape[1]

    @property
    def n_salidas(self):
        return len(self.clases)

    @property
    def Y_ent(self):
        return un_caliente(self.y_ent, self.n_salidas)


def un_caliente(y, n_clases):
    """[2, 0] -> [[0, 0, 1], [1, 0, 0]]: un 1 en la columna de la clase correcta."""
    Y = np.zeros((len(y), n_clases))
    Y[np.arange(len(y)), y] = 1.0
    return Y


# --------------------------------------------------------------------------
# Generadores de los problemas de dos entradas (todo cabe en [-1, 1])
# --------------------------------------------------------------------------

def _lineal(rng, n):
    y = rng.integers(0, 2, n)
    centros = np.where(y[:, None] == 0, [-0.45, -0.4], [0.45, 0.4])
    return centros + rng.normal(0, 0.24, (n, 2)), y


def _xor(rng, n):
    X = rng.uniform(-1, 1, (n, 2))
    X += np.sign(X) * 0.08                       # deja un pasillo en los ejes
    X = np.clip(X, -1, 1)
    return X, (X[:, 0] * X[:, 1] > 0).astype(int)


def _circulos(rng, n):
    y = rng.integers(0, 2, n)
    radio = np.where(y == 0, rng.uniform(0.0, 0.38, n), rng.uniform(0.66, 0.98, n))
    angulo = rng.uniform(0, 2 * np.pi, n)
    X = np.c_[radio * np.cos(angulo), radio * np.sin(angulo)]
    return X + rng.normal(0, 0.03, (n, 2)), y


def _espiral(rng, n):
    y = rng.integers(0, 2, n)
    t = rng.uniform(0.08, 1.0, n)                # distancia al centro
    angulo = t * 1.5 * 2 * np.pi + y * np.pi     # vuelta y media; un brazo por clase
    X = np.c_[t * np.cos(angulo), t * np.sin(angulo)]
    return X + rng.normal(0, 0.025, (n, 2)), y


_GENERADORES = {"lineal": _lineal, "xor": _xor, "circulos": _circulos, "espiral": _espiral}


# --------------------------------------------------------------------------
# Carga
# --------------------------------------------------------------------------

def cargar(problema, semilla=0):
    """Devuelve el Conjunto del problema pedido."""
    rng = np.random.default_rng(semilla)

    if problema == "digitos":
        archivo = np.load(RUTA_DIGITOS)
        X = archivo["X"].astype(float) / 16.0    # píxeles de 0 a 16 -> de 0 a 1
        y = archivo["y"].astype(int)
        clases = [str(d) for d in range(10)]
        nombres, es_2d, fraccion_prueba = [], False, 0.2
    else:
        X, y = _GENERADORES[problema](rng, 360)
        clases = ["A", "B"]
        nombres, es_2d, fraccion_prueba = ["x", "y"], True, 0.3

    # Barajar y apartar una parte para la prueba.
    orden = rng.permutation(len(X))
    X, y = X[orden], y[orden]
    corte = int(len(X) * (1 - fraccion_prueba))

    return Conjunto(
        id=problema,
        X_ent=X[:corte], y_ent=y[:corte],
        X_pru=X[corte:], y_pru=y[corte:],
        clases=clases, nombres_entrada=nombres, es_2d=es_2d,
    )
