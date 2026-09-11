const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const conexiones = new Map();

io.on("connection", (socket) => {
    console.log("Cliente conectado:", socket.id);

    socket.on("crear-conexion", (codigo) => {
        socket.join(codigo);
        console.log(`Conexión creada: ${codigo}`);
    });

    socket.on("unirse-conexion", (codigo) => {
        socket.join(codigo);
        console.log(`Cliente unido: ${codigo}`);
    });

    socket.on("ubicacion", ({ codigo, latitude, longitude }) => {
        // Solo mantiene/transmite la ubicación actual.
        // No se escribe en una base de datos.
        conexiones.set(codigo, { latitude, longitude });

        socket.to(codigo).emit("ubicacion", {
            latitude,
            longitude
        });
    });

    socket.on("dejar-de-compartir", (codigo) => {
        conexiones.delete(codigo);
        socket.to(codigo).emit("ubicacion-eliminada");
    });

    socket.on("disconnect", () => {
        console.log("Cliente desconectado:", socket.id);
    });
});

server.listen(3000, "0.0.0.0", () => {
    console.log("Servidor funcionando en http://localhost:3000");
});

