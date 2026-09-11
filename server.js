const express = require("express");
const http = require("http");
const crypto = require("crypto");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const conexiones = new Map();

app.use(express.json());
app.use(express.static("public"));

function generarCodigo() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function urlValida(valor) {
  try {
    const u = new URL(valor);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (error) {
    return false;
  }
}

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.get("/c/:codigo", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/api/conexiones", (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const mensaje = String(req.body.mensaje || "").trim();
  const url = String(req.body.url || "").trim();

  if (!nombre) {
    return res.status(400).json({
      ok: false,
      error: "El nombre es obligatorio."
    });
  }

  if (!urlValida(url)) {
    return res.status(400).json({
      ok: false,
      error: "El enlace no es válido."
    });
  }

  let codigo = generarCodigo();

  while (conexiones.has(codigo)) {
    codigo = generarCodigo();
  }

  conexiones.set(codigo, {
    codigo: codigo,
    nombre: nombre,
    mensaje: mensaje,
    url: url,
    ubicacion: null,
    creada: Date.now()
  });

  res.json({
    ok: true,
    codigo: codigo,
    enlace: "/c/" + codigo
  });
});

app.get("/api/conexiones/:codigo", (req, res) => {
  const codigo = String(req.params.codigo || "").toUpperCase();
  const conexion = conexiones.get(codigo);

  if (!conexion) {
    return res.status(404).json({
      ok: false,
      error: "La conexión no existe."
    });
  }

  res.json({
    ok: true,
    codigo: conexion.codigo,
    nombre: conexion.nombre,
    mensaje: conexion.mensaje,
    url: conexion.url,
    activa: conexion.ubicacion !== null
  });
});

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("crear-conexion", (codigo) => {
    const codigoSeguro = String(codigo || "").toUpperCase();

    if (!conexiones.has(codigoSeguro)) {
      socket.emit("error-conexion", {
        mensaje: "La conexión no existe."
      });
      return;
    }

    socket.join(codigoSeguro);
  });

  socket.on("unirse-conexion", (codigo) => {
    const codigoSeguro = String(codigo || "").toUpperCase();
    const conexion = conexiones.get(codigoSeguro);

    if (!conexion) {
      socket.emit("error-conexion", {
        mensaje: "La conexión no existe o expiró."
      });
      return;
    }

    socket.join(codigoSeguro);

    socket.emit("conexion-lista", {
      codigo: conexion.codigo,
      nombre: conexion.nombre,
      mensaje: conexion.mensaje,
      url: conexion.url,
      ubicacion: conexion.ubicacion
    });
  });

  socket.on("ubicacion", (datos) => {
    const codigo = String(datos?.codigo || "").toUpperCase();
    const conexion = conexiones.get(codigo);

    if (!conexion) {
      return;
    }

    const latitude = Number(datos?.latitude);
    const longitude = Number(datos?.longitude);
    const accuracy = Number(datos?.accuracy);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    if (latitude < -90 || latitude > 90) {
      return;
    }

    if (longitude < -180 || longitude > 180) {
      return;
    }

    conexion.ubicacion = {
      latitude: latitude,
      longitude: longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      actualizada: Date.now()
    };

    io.to(codigo).emit("ubicacion-actualizada", conexion.ubicacion);
  });

  socket.on("dejar-de-compartir", (codigo) => {
    const codigoSeguro = String(codigo || "").toUpperCase();
    const conexion = conexiones.get(codigoSeguro);

    if (!conexion) {
      return;
    }

    conexion.ubicacion = null;

    io.to(codigoSeguro).emit("ubicacion-eliminada");
  });

  socket.on("cerrar-conexion", (codigo) => {
    const codigoSeguro = String(codigo || "").toUpperCase();

    if (!conexiones.has(codigoSeguro)) {
      return;
    }

    conexiones.delete(codigoSeguro);

    io.to(codigoSeguro).emit("conexion-cerrada");

    console.log("Conexión cerrada:", codigoSeguro);
  });

  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

setInterval(() => {
  const ahora = Date.now();
  const limite = 24 * 60 * 60 * 1000;

  for (const [codigo, conexion] of conexiones) {
    if (ahora - conexion.creada > limite) {
      conexiones.delete(codigo);
      io.to(codigo).emit("conexion-cerrada");
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Servidor funcionando en el puerto " + PORT);
});
