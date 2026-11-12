"""
red_neuronal.py - Una red neuronal multicapa escrita desde cero con NumPy.

No usa TensorFlow ni PyTorch a propósito: aquí se ve cada operación.
El ciclo de aprendizaje tiene cuatro pasos y cada uno es un método:

    1. propagar_adelante   la señal va de la entrada a la salida
    2. calcular_perdida    se mide cuánto se equivocó la red
    3. retropropagar       el error vuelve hacia atrás (regla de la cadena)
    4. actualizar_pesos    cada peso se corrige un poco

La web muestra estos mismos métodos en el panel de código: lo que se lee
en clase es exactamente lo que se está ejecutando.
"""

from __future__ import annotations

import numpy as np


# --------------------------------------------------------------------------
# Funciones de activación
# --------------------------------------------------------------------------
# Cada derivada se escribe en función de la SALIDA de la neurona (a), no de
# su entrada (z). Así la retropropagación reutiliza lo que ya se calculó.

def tanh(z):
    return np.tanh(z)


def derivada_tanh(a):
    return 1.0 - a ** 2


def relu(z):
    return np.maximum(0.0, z)


def derivada_relu(a):
    return (a > 0).astype(float)


def sigmoide(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -60.0, 60.0)))


def derivada_sigmoide(a):
    return a * (1.0 - a)


def softmax(z):
    """Convierte las puntuaciones de la última capa en probabilidades que suman 1."""
    z = z - z.max(axis=1, keepdims=True)      # evita números enormes al exponenciar
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


ACTIVACIONES = {
    "tanh": (tanh, derivada_tanh),
    "relu": (relu, derivada_relu),
    "sigmoide": (sigmoide, derivada_sigmoide),
}


# --------------------------------------------------------------------------
# Una capa
# --------------------------------------------------------------------------

class Capa:
    """Una capa densa: todas sus neuronas reciben todas las salidas de la capa anterior."""

    def __init__(self, n_entradas, n_neuronas, rng, activacion="tanh"):
        # W tiene una fila por cada entrada y una columna por cada neurona:
        # W[i, j] es el peso de la conexión entrada i -> neurona j.
        # Los pesos nacen aleatorios y pequeños. Si todos empezaran iguales,
        # todas las neuronas aprenderían exactamente lo mismo.
        escala = np.sqrt((2.0 if activacion == "relu" else 1.0) / n_entradas)
        self.W = rng.normal(0.0, escala, size=(n_entradas, n_neuronas))
        self.b = np.zeros(n_neuronas)          # un sesgo por neurona

        # Memoria que usa el optimizador Adam (ver actualizar_pesos).
        self.mW, self.vW = np.zeros_like(self.W), np.zeros_like(self.W)
        self.mb, self.vb = np.zeros_like(self.b), np.zeros_like(self.b)
        self.t = 0


# --------------------------------------------------------------------------
# La red
# --------------------------------------------------------------------------

class RedNeuronal:
    """Perceptrón multicapa para clasificar. Puede empezar sin capas ocultas y crecer."""

    def __init__(self, n_entradas, ocultas, n_salidas, activacion="tanh", semilla=0):
        self.n_entradas = n_entradas
        self.n_salidas = n_salidas
        self.activacion = activacion
        self.rng = np.random.default_rng(semilla)

        # ocultas=[] es una red de una sola capa: entrada -> salida.
        # ocultas=[8, 8] son dos capas ocultas de 8 neuronas antes de la salida.
        tamanos = [n_entradas, *ocultas, n_salidas]
        self.capas = [
            Capa(tamanos[i], tamanos[i + 1], self.rng, activacion)
            for i in range(len(tamanos) - 1)
        ]
        self.activaciones = []

    # ---- información --------------------------------------------------

    @property
    def tamanos(self):
        """Neuronas por capa, contando la entrada. Ej.: [2, 8, 8, 2]."""
        return [self.n_entradas] + [capa.W.shape[1] for capa in self.capas]

    @property
    def ocultas(self):
        return self.tamanos[1:-1]

    @property
    def n_parametros(self):
        return int(sum(capa.W.size + capa.b.size for capa in self.capas))

    # ---- los cuatro pasos del aprendizaje ------------------------------

    def propagar_adelante(self, X):
        """Paso 1: la señal viaja de la entrada a la salida, capa por capa."""
        f, _ = ACTIVACIONES[self.activacion]
        A = X
        self.activaciones = [A]                 # se guarda la salida de cada capa

        for capa in self.capas[:-1]:            # capas ocultas
            Z = A @ capa.W + capa.b             # suma ponderada de cada neurona
            A = f(Z)                            # activación: aquí entra la no linealidad
            self.activaciones.append(A)

        salida = self.capas[-1]                 # capa de salida
        Z = A @ salida.W + salida.b
        P = softmax(Z)                          # una probabilidad por clase
        self.activaciones.append(P)
        return P

    def calcular_perdida(self, P, Y):
        """Paso 2: medir el error con la entropía cruzada."""
        # Y vale 1 en la clase correcta y 0 en las demás, así que solo cuenta
        # la probabilidad que la red dio a la respuesta correcta.
        # Si esa probabilidad es 1, la pérdida es 0. Si se acerca a 0, se dispara.
        probabilidad_correcta = np.sum(P * Y, axis=1)
        return float(-np.mean(np.log(probabilidad_correcta + 1e-12)))

    def retropropagar(self, Y):
        """Paso 3: el error viaja de la salida hacia la entrada (regla de la cadena)."""
        _, derivada = ACTIVACIONES[self.activacion]
        n = Y.shape[0]
        gradientes = [None] * len(self.capas)

        # Error en la salida: probabilidad predicha menos respuesta correcta.
        delta = (self.activaciones[-1] - Y) / n

        for i in reversed(range(len(self.capas))):
            capa = self.capas[i]
            A_anterior = self.activaciones[i]   # lo que entró a esta capa

            dW = A_anterior.T @ delta           # culpa de cada peso en el error
            db = delta.sum(axis=0)              # culpa de cada sesgo
            gradientes[i] = (dW, db)

            if i > 0:
                # Repartir el error entre las neuronas de la capa anterior:
                # cuánto influyó cada una (W) y cuán sensible era (derivada).
                delta = (delta @ capa.W.T) * derivada(A_anterior)

        return gradientes

    def actualizar_pesos(self, gradientes, tasa, optimizador="adam"):
        """Paso 4: mover cada peso un poco en la dirección que reduce el error."""
        for capa, (dW, db) in zip(self.capas, gradientes):
            if optimizador == "sgd":
                # Descenso de gradiente clásico: restar el gradiente por la tasa.
                capa.W -= tasa * dW
                capa.b -= tasa * db
            else:
                # Adam: la misma idea, pero cada peso recuerda su gradiente medio (m)
                # y su tamaño habitual (v) para dar pasos ni muy largos ni muy cortos.
                capa.t += 1
                parametros = ((capa.W, dW, capa.mW, capa.vW), (capa.b, db, capa.mb, capa.vb))
                for valor, g, m, v in parametros:
                    m *= 0.9
                    m += 0.1 * g
                    v *= 0.999
                    v += 0.001 * g * g
                    m_corregida = m / (1 - 0.9 ** capa.t)
                    v_corregida = v / (1 - 0.999 ** capa.t)
                    valor -= tasa * m_corregida / (np.sqrt(v_corregida) + 1e-8)

    def entrenar_lote(self, X, Y, tasa, optimizador="adam"):
        """El ciclo completo sobre un lote de ejemplos. Se repite miles de veces."""
        P = self.propagar_adelante(X)                        # 1. predecir
        perdida = self.calcular_perdida(P, Y)                # 2. medir el error
        gradientes = self.retropropagar(Y)                   # 3. repartir culpas
        self.actualizar_pesos(gradientes, tasa, optimizador)  # 4. corregir
        return perdida, gradientes

    # ---- crecer: de una capa a muchas ----------------------------------

    def agregar_capa(self, n_neuronas):
        """Inserta una capa oculta nueva justo antes de la salida."""
        n_previas = self.tamanos[-2]            # quién alimentaba a la salida
        nueva = Capa(n_previas, n_neuronas, self.rng, self.activacion)
        salida = Capa(n_neuronas, self.n_salidas, self.rng, self.activacion)

        # Las capas anteriores conservan sus pesos: lo aprendido no se pierde.
        # Solo la capa nueva y la de salida empiezan de cero.
        self.capas[-1:] = [nueva, salida]

    def quitar_capa(self):
        """Elimina la última capa oculta y vuelve a conectar la salida."""
        if len(self.capas) < 2:
            return
        n_previas = self.tamanos[-3]
        self.capas[-2:] = [Capa(n_previas, self.n_salidas, self.rng, self.activacion)]

    def cambiar_neuronas(self, indice, n_neuronas):
        """Cambia el tamaño de la capa oculta `indice` (0 es la primera)."""
        tamanos = self.tamanos
        # Hay que rehacer la capa que cambia y la siguiente, porque sus
        # matrices W tienen formas que dependen de ese número de neuronas.
        self.capas[indice] = Capa(tamanos[indice], n_neuronas, self.rng, self.activacion)
        self.capas[indice + 1] = Capa(n_neuronas, tamanos[indice + 2], self.rng, self.activacion)

    # ---- usar la red ----------------------------------------------------

    def predecir(self, X):
        """Clase más probable para cada ejemplo."""
        return self.propagar_adelante(X).argmax(axis=1)
