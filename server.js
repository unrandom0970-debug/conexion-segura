```js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Conexiones temporales.
// No se utiliza una base de datos.
const conexiones = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Crear una conexión
app.post("/api/conexiones", (req, res) => {
    const { nombre, mensaje, url } = req.body;

    if (!url || !/^https?:\/\//i.test(url)) {
        return res.status(400).json({
            error: "Introduce una URL válida que empiece por http:// o https://"
        });
    }

    const codigo = crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase();

    const conexion = {
        codigo,
        nombre: nombre?.trim() || "Conexión SDR",
        mensaje: mensaje?.trim() || "Te han enviado una conexión.",
        url,
        creada: Date.now(),
        ubicacion: null
    };

    conexiones.set(codigo, conexion);

    res.json({
        ok: true,
        codigo,
        enlace: `/c/${codigo}`
    });
});

// Obtener una conexión
app.get("/api/conexiones/:codigo", (req, res) => {
    const codigo = req.params.codigo.toUpperCase();
    const conexion = conexiones.get(codigo);

    if (!conexion) {
        return res.status(404).json({
            error: "Esta conexión ya no existe."
        });
    }

    res.json({
        codigo: conexion.codigo,
        nombre: conexion.nombre,
        mensaje: conexion.mensaje,
        url: conexion.url,
        activa: Boolean(conexion.ubicacion)
    });
});

// Ruta visual de conexiones
app.get("/c/:codigo", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {

    socket.on("crear-conexion", (codigo) => {
        socket.join(codigo);
    });

    socket.on("unirse-conexion", (codigo) => {
        const conexion = conexiones.get(codigo);

        if (!conexion) {
            socket.emit("conexion-error", "La conexión no existe o expiró.");
            return;
        }

        socket.join(codigo);

        socket.emit("conexion-lista", {
            codigo: conexion.codigo,
            nombre: conexion.nombre,
            mensaje: conexion.mensaje,
            url: conexion.url,
            ubicacion: conexion.ubicacion
        });

        if (conexion.ubicacion) {
            socket.emit("ubicacion", conexion.ubicacion);
        }
    });

    socket.on("ubicacion", (data) => {
        const codigo = String(data.codigo || "").toUpperCase();
        const conexion = conexiones.get(codigo);

        if (!conexion) return;

        const latitude = Number(data.latitude);
        const longitude = Number(data.longitude);
        const accuracy = Number(data.accuracy);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return;
        }

        const ubicacion = {
            latitude,
            longitude,
            accuracy: Number.isFinite(accuracy) ? accuracy : null,
            updatedAt: Date.now()
        };

        // Solo conserva la última posición.
        conexion.ubicacion = ubicacion;

        socket.to(codigo).emit("ubicacion", ubicacion);
    });

    socket.on("dejar-de-compartir", (codigo) => {
        codigo = String(codigo || "").toUpperCase();

        const conexion = conexiones.get(codigo);

        if (!conexion) return;

        // Eliminamos inmediatamente la ubicación.
        conexion.ubicacion = null;

        socket.to(codigo).emit("ubicacion-eliminada");
    });

    socket.on("cerrar-conexion", (codigo) => {
        codigo = String(codigo || "").toUpperCase();

        // Borra toda la conexión temporal.
        conexiones.delete(codigo);

        io.to(codigo).emit("conexion-cerrada");
    });

    socket.on("disconnect", () => {
        // No guardamos ubicación asociada permanentemente al socket.
    });
});

// Limpieza automática.
// Las conexiones que llevan 24 h sin uso desaparecen.
setInterval(() => {
    const ahora = Date.now();

    for (const [codigo, conexion] of conexiones) {
        if (ahora - conexion.creada > 24 * 60 * 60 * 1000) {
            conexiones.delete(codigo);
            io.to(codigo).emit("conexion-cerrada");
        }
    }
}, 10 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Conexión Segura SDR funcionando en puerto ${PORT}`);
});
```

