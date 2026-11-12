"""
codigo.py - Los fragmentos de código que la web enseña en el panel de clase.

No son copias: se leen con `inspect` del código que está en ejecución.
Si cambias un método en red_neuronal.py y reinicias el backend, la web
muestra tu versión.

Cada fragmento lleva una idea general y unas "claves": líneas concretas
(se localizan por el texto que contienen) con su explicación.
"""

from __future__ import annotations

import inspect
import textwrap
from pathlib import Path

from . import red_neuronal
from .red_neuronal import Capa, RedNeuronal
from .sesion import Sesion

RAIZ = Path(__file__).resolve().parent.parent.parent


def _fuente(objeto):
    """Código fuente de una función o método, con su archivo y línea."""
    lineas, numero = inspect.getsourcelines(objeto)
    archivo = Path(inspect.getsourcefile(objeto)).resolve()
    return textwrap.dedent("".join(lineas)).rstrip(), archivo, numero


def _tramo(desde, hasta):
    """Código entre dos funciones consecutivas del mismo archivo (ambas incluidas)."""
    _, archivo, inicio = _fuente(desde)
    lineas_fin, numero_fin = inspect.getsourcelines(hasta)
    todas = archivo.read_text(encoding="utf-8").splitlines()
    return "\n".join(todas[inicio - 1:numero_fin - 1 + len(lineas_fin)]).rstrip(), archivo, inicio


FRAGMENTOS = [
    {
        "id": "adelante",
        "paso": 1,
        "titulo": "Propagar hacia adelante",
        "fuente": lambda: _fuente(RedNeuronal.propagar_adelante),
        "idea": "La entrada atraviesa la red capa por capa hasta convertirse en una "
                "predicción. En la escena 3D es la ola que va de izquierda a derecha.",
        "claves": [
            {"buscar": "Z = A @ capa.W + capa.b",
             "nota": "Cada neurona multiplica sus entradas por sus pesos, las suma y añade su "
                     "sesgo. El operador @ es un producto de matrices: calcula la capa entera "
                     "de una vez."},
            {"buscar": "A = f(Z)",
             "nota": "La activación dobla la señal. Sin ella, cien capas apiladas equivaldrían "
                     "a una sola y la red solo sabría trazar rectas."},
            {"buscar": "P = softmax(Z)",
             "nota": "La última capa no usa la activación normal: softmax reparte el 100 % de "
                     "probabilidad entre las clases."},
        ],
    },
    {
        "id": "perdida",
        "paso": 2,
        "titulo": "Medir el error",
        "fuente": lambda: _fuente(RedNeuronal.calcular_perdida),
        "idea": "Un solo número resume lo mal que predijo la red. Entrenar es hacer que "
                "ese número baje. Es la curva de pérdida del panel derecho.",
        "claves": [
            {"buscar": "probabilidad_correcta = np.sum(P * Y, axis=1)",
             "nota": "De todas las probabilidades que dio la red, solo interesa la de la "
                     "respuesta correcta."},
            {"buscar": "np.log(probabilidad_correcta",
             "nota": "El logaritmo castiga mucho estar seguro y equivocado: con probabilidad "
                     "0,9 la pérdida es 0,1; con 0,01 es 4,6."},
        ],
    },
    {
        "id": "atras",
        "paso": 3,
        "titulo": "Retropropagar",
        "fuente": lambda: _fuente(RedNeuronal.retropropagar),
        "idea": "El error se devuelve desde la salida hasta la entrada para saber cuánta "
                "culpa tiene cada peso. En la escena 3D es la ola que vuelve hacia la izquierda.",
        "claves": [
            {"buscar": "delta = (self.activaciones[-1] - Y) / n",
             "nota": "En la salida el error es una resta: lo que la red dijo menos lo que "
                     "debía decir."},
            {"buscar": "dW = A_anterior.T @ delta",
             "nota": "El gradiente de un peso es la señal que le llegó multiplicada por el "
                     "error de la neurona a la que apunta."},
            {"buscar": "delta = (delta @ capa.W.T) * derivada(A_anterior)",
             "nota": "La regla de la cadena: el error retrocede por los mismos pesos por los "
                     "que avanzó la señal, y se atenúa donde la neurona era poco sensible."},
        ],
    },
    {
        "id": "actualizar",
        "paso": 4,
        "titulo": "Actualizar los pesos",
        "fuente": lambda: _fuente(RedNeuronal.actualizar_pesos),
        "idea": "Cada peso se mueve un poco en contra de su gradiente. En la escena 3D las "
                "conexiones cambian de grosor y de color.",
        "claves": [
            {"buscar": "capa.W -= tasa * dW",
             "nota": "Todo el aprendizaje está en esta línea. La tasa de aprendizaje decide "
                     "el tamaño del paso: muy grande y la red da bandazos, muy pequeña y no "
                     "avanza."},
            {"buscar": "valor -= tasa * m_corregida / (np.sqrt(v_corregida) + 1e-8)",
             "nota": "Adam hace la misma resta, pero usa un gradiente suavizado y lo divide "
                     "por su tamaño habitual. Suele llegar antes a la solución."},
        ],
    },
    {
        "id": "ciclo",
        "paso": None,
        "titulo": "El ciclo completo",
        "fuente": lambda: _fuente(RedNeuronal.entrenar_lote),
        "idea": "Los cuatro pasos juntos. Esta función se ejecuta miles de veces, cada vez "
                "con un lote distinto de ejemplos.",
        "claves": [],
    },
    {
        "id": "crecer",
        "paso": None,
        "titulo": "Añadir una capa",
        "fuente": lambda: _fuente(RedNeuronal.agregar_capa),
        "idea": "Así pasa la red de una capa a varias. La capa nueva se coloca justo antes "
                "de la salida.",
        "claves": [
            {"buscar": "nueva = Capa(n_previas, n_neuronas",
             "nota": "La capa nueva recibe lo que antes iba directo a la salida."},
            {"buscar": "self.capas[-1:] = [nueva, salida]",
             "nota": "Se sustituye la antigua capa de salida por dos: la nueva oculta y una "
                     "salida recién creada. Las anteriores no se tocan."},
        ],
    },
    {
        "id": "cuando",
        "paso": None,
        "titulo": "Cuándo crecer",
        "fuente": lambda: _fuente(Sesion._revisar_crecimiento),
        "idea": "Con «Crecer sola» activado, al terminar cada época se comprueba si la red "
                "se ha estancado.",
        "claves": [
            {"buscar": "estancada = self.epoca - self._epoca_mejor >= self.paciencia",
             "nota": "Estancada significa que lleva demasiadas épocas sin mejorar al menos "
                     "un punto de precisión en datos que no ha visto."},
            {"buscar": "return self.agregar_capa(automatica=True)",
             "nota": "Si está estancada y aún no alcanza la meta, gana una capa oculta."},
        ],
    },
    {
        "id": "capa",
        "paso": None,
        "titulo": "Una capa por dentro",
        "fuente": lambda: _fuente(Capa.__init__),
        "idea": "Una capa es solo una matriz de pesos y un vector de sesgos. Eso es todo "
                "lo que la red aprende.",
        "claves": [
            {"buscar": "self.W = rng.normal(0.0, escala, size=(n_entradas, n_neuronas))",
             "nota": "Una fila por entrada y una columna por neurona. En la escena 3D cada "
                     "número de esta matriz es una conexión."},
            {"buscar": "escala = np.sqrt(",
             "nota": "Cuantas más entradas tiene una neurona, más pequeños nacen sus pesos, "
                     "para que la suma no se dispare."},
        ],
    },
    {
        "id": "activaciones",
        "paso": None,
        "titulo": "Funciones de activación",
        "fuente": lambda: _tramo(red_neuronal.tanh, red_neuronal.softmax),
        "idea": "Lo que hace cada neurona con su suma ponderada, y la derivada que "
                "necesita la retropropagación.",
        "claves": [
            {"buscar": "return np.maximum(0.0, z)",
             "nota": "ReLU: deja pasar lo positivo y apaga lo negativo. Simple y eficaz."},
            {"buscar": "return np.tanh(z)",
             "nota": "tanh: aplasta cualquier valor al rango de -1 a 1."},
        ],
    },
]


def fragmentos():
    """Lista lista para enviar a la web."""
    resultado = []
    for fragmento in FRAGMENTOS:
        codigo, archivo, linea = fragmento["fuente"]()
        resultado.append({
            "id": fragmento["id"],
            "paso": fragmento["paso"],
            "titulo": fragmento["titulo"],
            "idea": fragmento["idea"],
            "claves": fragmento["claves"],
            "codigo": codigo,
            "archivo": archivo.relative_to(RAIZ).as_posix(),
            "linea": linea,
        })
    return resultado
