"""
main.py - Servidor web del backend (FastAPI).

    GET  /api/salud      comprobar que el servidor responde
    GET  /api/codigo     fragmentos de código para el panel de clase
    WS   /ws             canal en tiempo real: órdenes hacia aquí, cuadros hacia la web

Arrancar a mano (desde la carpeta backend):
    python -m uvicorn app.main:app --port 8000
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .codigo import fragmentos
from .sesion import VELOCIDADES, Sesion

app = FastAPI(title="Capa a capa", docs_url="/api/docs", openapi_url="/api/openapi.json")

# El frontend en modo desarrollo vive en otro puerto (5173): se le da permiso.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/salud")
def salud():
    return {"estado": "ok"}


@app.get("/api/codigo")
def codigo():
    return fragmentos()


@app.websocket("/ws")
async def canal(ws: WebSocket):
    """Una conexión = una sesión de entrenamiento propia."""
    await ws.accept()
    sesion = Sesion()
    candado = asyncio.Lock()          # para no mezclar dos envíos a la vez
    tarea = None

    async def enviar(mensaje):
        async with candado:
            await ws.send_json(mensaje)

    async def bucle_de_entrenamiento():
        """Entrena unos lotes, envía un cuadro, espera, y vuelta a empezar."""
        while sesion.entrenando:
            inicio = time.perf_counter()
            for evento in sesion.avanzar():
                await enviar(evento)
                await enviar(sesion.estado(motivo="estructura"))
            await enviar(sesion.cuadro())
            _, cuadros_por_segundo = VELOCIDADES[sesion.config["velocidad"]]
            transcurrido = time.perf_counter() - inicio
            await asyncio.sleep(max(0.005, 1 / cuadros_por_segundo - transcurrido))

    async def detener():
        nonlocal tarea
        sesion.entrenando = False
        if tarea:
            try:
                await tarea
            except Exception:
                pass
            tarea = None

    try:
        await enviar(sesion.estado(motivo="inicio"))
        while True:
            orden = await ws.receive_json()
            tipo = orden.get("tipo")

            if tipo == "iniciar":
                if not sesion.entrenando:
                    sesion.entrenando = True
                    tarea = asyncio.create_task(bucle_de_entrenamiento())
                await enviar(sesion.estado())

            elif tipo == "pausar":
                await detener()
                await enviar(sesion.estado())

            elif tipo == "paso":
                await detener()
                await enviar(sesion.paso_detallado())

            elif tipo == "configurar":
                await detener()
                sesion.configurar(orden)
                await enviar(sesion.estado(motivo="configurar"))

            elif tipo == "reiniciar":
                await detener()
                sesion.reiniciar()
                await enviar(sesion.estado(motivo="reiniciar"))

            elif tipo == "agregar_capa":
                evento = sesion.agregar_capa(orden.get("neuronas"))
                if evento:
                    await enviar(evento)
                await enviar(sesion.estado(motivo="estructura"))

            elif tipo == "quitar_capa":
                evento = sesion.quitar_capa()
                if evento:
                    await enviar(evento)
                await enviar(sesion.estado(motivo="estructura"))

            elif tipo == "neuronas":
                sesion.cambiar_neuronas(int(orden.get("indice", -1)), int(orden.get("neuronas", 1)))
                await enviar(sesion.estado(motivo="estructura"))

            elif tipo == "ajustar":
                sesion.ajustar(orden)
                await enviar(sesion.estado())

            elif tipo == "sonda":
                sesion.fijar_sonda(orden.get("entrada"))
                if not sesion.entrenando:
                    await enviar({"tipo": "muestra", "muestra": sesion.muestra()})

    except WebSocketDisconnect:
        pass
    finally:
        sesion.entrenando = False
        if tarea:
            tarea.cancel()


# Si existe una versión compilada del frontend (frontend/dist), se sirve desde
# aquí mismo. Así la aplicación funciona solo con Python, sin Node.js.
DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="web")
